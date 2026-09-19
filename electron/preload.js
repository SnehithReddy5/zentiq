const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPrinter', {
  printRaw: (ip, port, data) => ipcRenderer.invoke('print-raw', { ip, port, data }),
});
