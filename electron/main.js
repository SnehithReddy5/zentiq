const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

let mainWindow;
let serverInstance = null;

// Native TCP RAW ESC/POS Socket Print Function
function printToNetworkPrinter(ip, port, dataArray) {
  return new Promise((resolve, reject) => {
    if (!ip) {
      return reject(new Error('Printer IP address is required'));
    }
    const targetPort = parseInt(port, 10) || 9100;
    const socket = new net.Socket();
    let isFinished = false;

    socket.setTimeout(8000);

    socket.connect(targetPort, ip, () => {
      const buffer = Buffer.from(dataArray);
      socket.write(buffer, (err) => {
        if (err) {
          if (!isFinished) {
            isFinished = true;
            socket.destroy();
            reject(err);
          }
        } else {
          // Pause 400ms to allow printer microcontroller to drain buffer before closing
          setTimeout(() => {
            if (!isFinished) {
              isFinished = true;
              socket.end();
              resolve({ success: true });
            }
          }, 400);
        }
      });
    });

    socket.on('error', (err) => {
      if (!isFinished) {
        isFinished = true;
        socket.destroy();
        reject(err);
      }
    });

    socket.on('timeout', () => {
      if (!isFinished) {
        isFinished = true;
        socket.destroy();
        reject(new Error('Connection timed out connecting to printer at ' + ip + ':' + targetPort));
      }
    });
  });
}

// IPC Handler for window.electronPrinter.printRaw
ipcMain.handle('print-raw', async (event, { ip, port, data }) => {
  try {
    const res = await printToNetworkPrinter(ip, port, data);
    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

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

// Starts a lightweight localhost HTTP server to serve dist/ bundle and handle /api/print
function startLocalServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // CORS headers for all responses
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      let reqPath = decodeURI(req.url.split('?')[0]);

      // HTTP Endpoint for Raw TCP Thermal Print dispatch
      if (req.method === 'POST' && reqPath === '/api/print') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(Buffer.concat(body).toString());
            const result = await printToNetworkPrinter(payload.ip, payload.port, payload.data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (printErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: printErr.message }));
          }
        });
        return;
      }

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
      preload: path.join(__dirname, 'preload.js'),
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
