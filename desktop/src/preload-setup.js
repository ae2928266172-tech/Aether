const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('Setup', {
  get: () => ipcRenderer.invoke('setup:get'),
  checkServer: (s) => ipcRenderer.invoke('setup:check-server', s),
  testPrint: (c) => ipcRenderer.invoke('setup:test-print', c),
  save: (c) => ipcRenderer.invoke('setup:save', c),
});
