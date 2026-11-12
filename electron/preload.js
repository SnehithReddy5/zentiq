const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPrinter', {
  printRaw: (ip, port, data) => ipcRenderer.invoke('print-raw', { ip, port, data }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
