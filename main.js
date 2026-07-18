const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const fsp  = fs.promises;
const os   = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const RELEASES_API_URL = 'https://api.github.com/repos/tawaunl/id3-editor/releases/latest';
const SUPPORTED_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.aac', '.m4a', '.wav', '.aiff', '.aif']);
let cachedFfmpegPath = null;

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
  if (cachedFfmpegPath) return cachedFfmpegPath;

  for (const c of ['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg','/usr/bin/ffmpeg','ffmpeg']) {
    try {
      require('child_process').execFileSync(c,['-version'],{stdio:'ignore'});
      cachedFfmpegPath = c;
      return cachedFfmpegPath;
    } catch {}
  }
  cachedFfmpegPath = 'ffmpeg';
  return cachedFfmpegPath;
}

function isSupportedAudioFile(filePath) {
  return SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function collectAudioFilesFromDir(dirPath, out = []) {
  let entries = [];
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }

  await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectAudioFilesFromDir(fullPath, out);
    } else if (entry.isFile() && isSupportedAudioFile(fullPath)) {
      out.push(fullPath);
    }
  }));

  return out;
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

function parseVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isVersionGreater(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const ai = av[i] || 0;
    const bi = bv[i] || 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.get(RELEASES_API_URL, {
      headers: {
        'User-Agent': 'TagEditor/1.0 (update-check)',
        Accept: 'application/vnd.github+json',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`Update check failed (${res.statusCode})`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Update check returned invalid JSON'));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Update check timed out'));
    });
  });
}

// ── open files dialog ──────────────────────────────────────────────────────
ipcMain.handle('open-files', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile','openDirectory','multiSelections'],
    filters: [{ name:'Audio Files', extensions:['mp3','flac','aac','m4a','wav','aiff','aif'] }],
  });

  const out = [];
  for (const selectedPath of r.filePaths || []) {
    try {
      const stat = await fsp.stat(selectedPath);
      if (stat.isDirectory()) {
        await collectAudioFilesFromDir(selectedPath, out);
      } else if (stat.isFile() && isSupportedAudioFile(selectedPath)) {
        out.push(selectedPath);
      }
    } catch {
      // Ignore paths that disappear or cannot be read.
    }
  }

  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
});

// ── read tags ──────────────────────────────────────────────────────────────
ipcMain.handle('read-tags', async (_e, filePath, options = {}) => {
  try {
    const { parseFile } = await import('music-metadata');
    const skipCovers = options.skipCovers !== false;
    const md = await parseFile(filePath, { skipCovers });
    const c  = md.common;
    const { coverBase64, coverMime } = skipCovers ? { coverBase64: null, coverMime: null } : extractCoverFromMetadata(md);
    return {
      title: c.title||'', artist: c.artist||'', album: c.album||'',
      genre: (c.genre&&c.genre[0])||'',
      year: c.year ? String(c.year) : '',
      trackNumber: c.track&&c.track.no ? String(c.track.no) : '',
      trackTotal:  c.track&&c.track.of ? String(c.track.of) : '',
      coverBase64, coverMime,
      coverLoaded: !skipCovers,
      format: md.format.container || path.extname(filePath).slice(1).toUpperCase(),
      duration: md.format.duration||0,
      bitrate:  md.format.bitrate||0,
    };
  } catch(err) { return { error: err.message }; }
});

// ── write tags ─────────────────────────────────────────────────────────────
ipcMain.handle('write-tags', async (_e, filePath, tags) => {
  const ext = path.extname(filePath).toLowerCase();
  let coverTmpPath = null;
  let tmpOut = null;
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
    tmpOut = path.join(os.tmpdir(), `tagedit_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`);
    const metaArgs = [];
    if (tags.title)       metaArgs.push('-metadata',`title=${tags.title}`);
    if (tags.artist)      metaArgs.push('-metadata',`artist=${tags.artist}`);
    if (tags.album)       metaArgs.push('-metadata',`album=${tags.album}`);
    if (tags.genre)       metaArgs.push('-metadata',`genre=${tags.genre}`);
    if (tags.year)        metaArgs.push('-metadata',`date=${tags.year}`);
    if (tags.trackNumber) metaArgs.push('-metadata',`track=${tags.trackNumber}${tags.trackTotal?'/'+tags.trackTotal:''}`);
    const coverArgs = [];
    if (tags.coverBase64) {
      const coverBuffer = Buffer.from(tags.coverBase64,'base64');
      const coverMime = normalizeImageMime(tags.coverMime, guessImageMime(coverBuffer));
      const coverExt = coverMime === 'image/png' ? '.png' : (coverMime === 'image/webp' ? '.webp' : '.jpg');
      coverTmpPath = path.join(os.tmpdir(),`cover_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}${coverExt}`);
      await fsp.writeFile(coverTmpPath, coverBuffer);
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
    await fsp.copyFile(tmpOut, filePath);
    return { success: true };
  } catch(err) { return { error: err.message }; }
  finally {
    await Promise.all([
      tmpOut ? fsp.unlink(tmpOut).catch(() => {}) : Promise.resolve(),
      coverTmpPath ? fsp.unlink(coverTmpPath).catch(() => {}) : Promise.resolve(),
    ]);
  }
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

ipcMain.handle('check-for-updates', async () => {
  try {
    const release = await fetchLatestRelease();
    const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');
    if (!latestVersion) return { error: 'No release version found.' };

    const currentVersion = app.getVersion();
    const updateAvailable = isVersionGreater(latestVersion, currentVersion);

    return {
      success: true,
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: release.html_url || 'https://github.com/tawaunl/id3-editor/releases/latest',
      releaseName: release.name || `v${latestVersion}`,
      publishedAt: release.published_at || '',
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-external-url', async (_e, url) => {
  try {
    await shell.openExternal(String(url || ''));
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ── save settings ──────────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
ipcMain.handle('load-settings', async () => {
  try {
    return JSON.parse(await fsp.readFile(settingsPath,'utf8'));
  } catch {
    return {};
  }
});
ipcMain.handle('save-settings', async (_e, settings) => {
  await fsp.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  return { success: true };
});
