const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'Zentiq POS Terminal',
    backgroundColor: '#090D1A',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const distPath = path.join(__dirname, '../dist/index.html');
  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:8081');
  }

  // If localhost fails to load (dev server not ready), retry after 2 seconds
  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (mainWindow) {
        if (fs.existsSync(distPath)) {
          mainWindow.loadFile(distPath);
        } else {
          mainWindow.loadURL('http://localhost:8081');
        }
      }
    }, 2000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
