const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 820, minWidth: 900, minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── helpers ────────────────────────────────────────────────────────────────
function getFfmpegPath() {
  for (const c of ['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg','/usr/bin/ffmpeg','ffmpeg']) {
    try { require('child_process').execFileSync(c,['-version'],{stdio:'ignore'}); return c; } catch {}
  }
  return 'ffmpeg';
}

function guessImageMime(buf) {
  if (!buf || buf.length < 12) return 'image/jpeg';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return 'image/jpeg';
}

function normalizeImageMime(inputMime, fallback = 'image/jpeg') {
  const s = String(inputMime || '').trim().toLowerCase();
  if (!s) return fallback;

  // strip parameters like "image/jpeg; charset=binary"
  const base = s.split(';')[0].trim();
  if (base === 'jpg' || base === 'jpeg' || base === 'image/jpg' || base === 'image/jpeg') return 'image/jpeg';
  if (base === 'png' || base === 'image/png') return 'image/png';
  if (base === 'webp' || base === 'image/webp') return 'image/webp';
  if (base === 'gif' || base === 'image/gif') return 'image/gif';
  return base.startsWith('image/') ? base : fallback;
}

function extractPictureCandidate(value) {
  if (!value) return null;

  if (Buffer.isBuffer(value)) {
    return { data: value, format: '' };
  }

  if (value instanceof Uint8Array) {
    return { data: Buffer.from(value), format: '' };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractPictureCandidate(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    if (value.data && (Buffer.isBuffer(value.data) || value.data instanceof Uint8Array)) {
      return {
        data: Buffer.isBuffer(value.data) ? value.data : Buffer.from(value.data),
        format: value.format || value.mime || value.type || '',
      };
    }

    if (value.picture && (Buffer.isBuffer(value.picture) || value.picture instanceof Uint8Array)) {
      return {
        data: Buffer.isBuffer(value.picture) ? value.picture : Buffer.from(value.picture),
        format: value.format || value.mime || value.type || '',
      };
    }
  }

  return null;
}

function extractCoverFromMetadata(md) {
  const c = md.common || {};
  if (Array.isArray(c.picture) && c.picture.length > 0) {
    const pic = c.picture[0];
    const buf = Buffer.isBuffer(pic.data) ? pic.data : Buffer.from(pic.data || '');
    if (buf.length > 0) {
      return {
        coverBase64: buf.toString('base64'),
        coverMime: normalizeImageMime(pic.format, guessImageMime(buf)),
      };
    }
  }

  // Fallback: inspect native frames/atoms for embedded artwork (APIC/covr/FLAC picture blocks).
  const native = md.native || {};
  for (const list of Object.values(native)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const candidate = extractPictureCandidate(entry && entry.value);
      if (!candidate || !candidate.data || !candidate.data.length) continue;
      return {
        coverBase64: candidate.data.toString('base64'),
        coverMime: normalizeImageMime(candidate.format, guessImageMime(candidate.data)),
      };
    }
  }

  return { coverBase64: null, coverMime: null };
}

// ── open files dialog ──────────────────────────────────────────────────────
ipcMain.handle('open-files', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile','multiSelections'],
    filters: [{ name:'Audio Files', extensions:['mp3','flac','aac','m4a','wav','aiff','aif'] }],
  });
  return r.filePaths;
});

// ── read tags ──────────────────────────────────────────────────────────────
ipcMain.handle('read-tags', async (_e, filePath) => {
  try {
    const { parseFile } = await import('music-metadata');
    const md = await parseFile(filePath, { skipCovers: false });
    const c  = md.common;
    const { coverBase64, coverMime } = extractCoverFromMetadata(md);
    return {
      title: c.title||'', artist: c.artist||'', album: c.album||'',
      genre: (c.genre&&c.genre[0])||'',
      year: c.year ? String(c.year) : '',
      trackNumber: c.track&&c.track.no ? String(c.track.no) : '',
      trackTotal:  c.track&&c.track.of ? String(c.track.of) : '',
      coverBase64, coverMime,
      format: md.format.container || path.extname(filePath).slice(1).toUpperCase(),
      duration: md.format.duration||0,
      bitrate:  md.format.bitrate||0,
    };
  } catch(err) { return { error: err.message }; }
});

// ── write tags ─────────────────────────────────────────────────────────────
ipcMain.handle('write-tags', async (_e, filePath, tags) => {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.mp3') {
      const NodeID3 = require('node-id3');
      const id3Tags = {
        title: tags.title||'', artist: tags.artist||'', album: tags.album||'',
        genre: tags.genre||'', year: tags.year||'',
        trackNumber: tags.trackNumber ? (tags.trackTotal ? `${tags.trackNumber}/${tags.trackTotal}` : tags.trackNumber) : '',
      };
      if (tags.coverBase64 && tags.coverMime) {
        id3Tags.image = { mime: tags.coverMime, type:{id:3,name:'front cover'}, description:'Cover',
          imageBuffer: Buffer.from(tags.coverBase64,'base64') };
      }
      const ok = NodeID3.update(id3Tags, filePath);
      if (!ok) throw new Error('node-id3 write failed');
      return { success: true };
    }
    // non-MP3: ffmpeg re-mux
    const tmpOut = path.join(os.tmpdir(), `tagedit_${Date.now()}${ext}`);
    const metaArgs = [];
    if (tags.title)       metaArgs.push('-metadata',`title=${tags.title}`);
    if (tags.artist)      metaArgs.push('-metadata',`artist=${tags.artist}`);
    if (tags.album)       metaArgs.push('-metadata',`album=${tags.album}`);
    if (tags.genre)       metaArgs.push('-metadata',`genre=${tags.genre}`);
    if (tags.year)        metaArgs.push('-metadata',`date=${tags.year}`);
    if (tags.trackNumber) metaArgs.push('-metadata',`track=${tags.trackNumber}${tags.trackTotal?'/'+tags.trackTotal:''}`);

    let coverTmpPath = null;
    const coverArgs = [];
    if (tags.coverBase64) {
      const coverBuffer = Buffer.from(tags.coverBase64,'base64');
      const coverMime = normalizeImageMime(tags.coverMime, guessImageMime(coverBuffer));
      const coverExt = coverMime === 'image/png' ? '.png' : (coverMime === 'image/webp' ? '.webp' : '.jpg');
      coverTmpPath = path.join(os.tmpdir(),`cover_${Date.now()}${coverExt}`);
      fs.writeFileSync(coverTmpPath, coverBuffer);
      if (ext==='.flac') {
        coverArgs.push('-i',coverTmpPath,'-map','0:a','-map','1:v','-c:a','copy','-c:v','mjpeg','-disposition:v','attached_pic');
      } else if (ext==='.m4a'||ext==='.aac') {
        coverArgs.push('-i',coverTmpPath,'-map','0:a','-map','1:v','-c:a','copy','-c:v','mjpeg','-disposition:v','attached_pic');
      } else {
        coverArgs.push('-i',coverTmpPath,'-map','0:a','-c:a','copy');
      }
    } else {
      coverArgs.push('-map','0:a','-c:a','copy');
    }
    await execFileAsync(getFfmpegPath(), ['-y','-i',filePath,...coverArgs,...metaArgs,tmpOut]);
    fs.copyFileSync(tmpOut, filePath);
    fs.unlinkSync(tmpOut);
    if (coverTmpPath) fs.unlinkSync(coverTmpPath);
    return { success: true };
  } catch(err) { return { error: err.message }; }
});

// ── rename file ────────────────────────────────────────────────────────────
ipcMain.handle('rename-file', async (_e, filePath, newName) => {
  try {
    const dir     = path.dirname(filePath);
    const ext     = path.extname(filePath);
    const safeName = newName.replace(/[/\\:*?"<>|]/g,'_');
    const newPath  = path.join(dir, safeName + ext);
    if (newPath === filePath) return { success: true, newPath: filePath };
    if (fs.existsSync(newPath)) return { error: 'A file with that name already exists.' };
    fs.renameSync(filePath, newPath);
    return { success: true, newPath };
  } catch(err) { return { error: err.message }; }
});

// ── pick cover image ───────────────────────────────────────────────────────
ipcMain.handle('pick-cover', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name:'Images', extensions:['jpg','jpeg','png','webp'] }],
  });
  if (!r.filePaths.length) return null;
  const data = fs.readFileSync(r.filePaths[0]);
  const ext = path.extname(r.filePaths[0]).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
  return { base64: data.toString('base64'), mime };
});

// ── fetch URL proxy (avoids CORS in renderer) ──────────────────────────────
ipcMain.handle('fetch-url', async (_e, url, headers={}) => {
  try {
    const https = require('https');
    const http  = require('http');
    return await new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { headers: { 'User-Agent':'TagEditor/1.0 (tageditor@local)', ...headers } }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const ct = res.headers['content-type']||'';
          if (ct.includes('image') || ct.includes('octet')) {
            resolve({ ok: true, base64: Buffer.concat(chunks).toString('base64'), mime: ct.split(';')[0].trim() });
          } else {
            resolve({ ok: true, text: Buffer.concat(chunks).toString('utf8'), status: res.statusCode });
          }
        });
      });
      req.on('error', e => reject(e));
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  } catch(err) { return { ok: false, error: err.message }; }
});

// ── save settings ──────────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
ipcMain.handle('load-settings', () => {
  try { return JSON.parse(fs.readFileSync(settingsPath,'utf8')); } catch { return {}; }
});
ipcMain.handle('save-settings', (_e, settings) => {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { success: true };
});
