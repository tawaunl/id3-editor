const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tagAPI', {
  openFiles:     ()                  => ipcRenderer.invoke('open-files'),
  readTags:      (p)                 => ipcRenderer.invoke('read-tags', p),
  writeTags:     (p, tags)           => ipcRenderer.invoke('write-tags', p, tags),
  renameFile:    (p, name)           => ipcRenderer.invoke('rename-file', p, name),
  pickCover:     ()                  => ipcRenderer.invoke('pick-cover'),
  fetchUrl:      (url, headers)      => ipcRenderer.invoke('fetch-url', url, headers),
  loadSettings:  ()                  => ipcRenderer.invoke('load-settings'),
  saveSettings:  (s)                 => ipcRenderer.invoke('save-settings', s),
});
