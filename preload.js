const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tagAPI', {
  openFiles:     ()                  => ipcRenderer.invoke('open-files'),
  readTags:      (p, options)        => ipcRenderer.invoke('read-tags', p, options),
  writeTags:     (p, tags)           => ipcRenderer.invoke('write-tags', p, tags),
  renameFile:    (p, name)           => ipcRenderer.invoke('rename-file', p, name),
  pickCover:     ()                  => ipcRenderer.invoke('pick-cover'),
  fetchUrl:      (url, headers)      => ipcRenderer.invoke('fetch-url', url, headers),
  checkForUpdates: ()                => ipcRenderer.invoke('check-for-updates'),
  openExternalUrl: (url)             => ipcRenderer.invoke('open-external-url', url),
  loadSettings:  ()                  => ipcRenderer.invoke('load-settings'),
  saveSettings:  (s)                 => ipcRenderer.invoke('save-settings', s),
});
