const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let serverInstance = null;

// MIME types dictionary for Expo web bundle assets
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm'
};

// Starts a lightweight localhost HTTP server to serve dist/ bundle without file:/// protocol issues
function startLocalServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURI(req.url.split('?')[0]);
      if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
      }

      let filePath = path.join(distDir, reqPath);

      // Check if requested file exists, otherwise fallback to index.html for SPA routing
      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, content) => {
          if (readErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading ' + reqPath);
          } else {
            res.writeHead(200, {
              'Content-Type': contentType,
              'Cache-Control': 'no-cache',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(content);
          }
        });
      });
    });

    // Listen on random available port on 127.0.0.1
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log('Zentiq POS desktop server listening on port ' + port);
      resolve({ server, port });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

async function createWindow() {
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

  const distDir = path.join(__dirname, '../dist');

  if (fs.existsSync(distDir)) {
    try {
      const { server, port } = await startLocalServer(distDir);
      serverInstance = server;
      mainWindow.loadURL('http://127.0.0.1:' + port);
    } catch (e) {
      console.error('Failed to start local static server, falling back to file protocol', e);
      mainWindow.loadFile(path.join(distDir, 'index.html'));
    }
  } else {
    // Development mode fallback
    mainWindow.loadURL('http://localhost:8081');
    mainWindow.webContents.on('did-fail-load', () => {
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.loadURL('http://localhost:8081');
        }
      }, 2000);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverInstance) {
      serverInstance.close();
      serverInstance = null;
    }
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
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
