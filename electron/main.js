const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// Fixed local port ensures persistent origin (http://127.0.0.1:18492) across app restarts,
// so localStorage, user login session (auth-storage), and cache are NEVER wiped on app kill/restart.
const FIXED_POS_PORT = 18492;

// Prevent background throttling so live order listeners and thermal printing never pause
if (app && app.commandLine && typeof app.commandLine.appendSwitch === 'function') {
  try {
    app.commandLine.appendSwitch('disable-background-timer-throttling');
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
  } catch (_) { }
}

let mainWindow;
let serverInstance = null;

// Native TCP RAW ESC/POS Socket Print Function
function printToNetworkPrinter(ip, port, dataArray) {
  return new Promise((resolve, reject) => {
    if (!ip) {
      return reject(new Error('Printer IP address is required'));
    }
    let buffer;
    try {
      buffer = Buffer.isBuffer(dataArray) ? dataArray : Buffer.from(dataArray || []);
    } catch (bufErr) {
      return reject(new Error('Invalid print data buffer: ' + bufErr.message));
    }

    const targetPort = parseInt(port, 10) || 9100;
    const socket = new net.Socket();
    let isFinished = false;

    socket.setTimeout(3000);

    socket.connect(targetPort, ip, () => {
      socket.write(buffer, (err) => {
        if (err) {
          if (!isFinished) {
            isFinished = true;
            try { socket.destroy(); } catch (_) { }
            reject(err);
          }
        } else {
          // Fast 50ms drain wait for instant thermal receipt output
          setTimeout(() => {
            if (!isFinished) {
              isFinished = true;
              try { socket.end(); } catch (_) { }
              resolve({ success: true });
            }
          }, 50);
        }
      });
    });

    socket.on('error', (err) => {
      if (!isFinished) {
        isFinished = true;
        try { socket.destroy(); } catch (_) { }
        reject(err);
      }
    });

    socket.on('timeout', () => {
      if (!isFinished) {
        isFinished = true;
        try { socket.destroy(); } catch (_) { }
        reject(new Error('Connection timed out connecting to printer at ' + ip + ':' + targetPort));
      }
    });
  });
}

// IPC Handler for window.electronPrinter.printRaw
ipcMain.handle('print-raw', async (event, payload) => {
  try {
    const { ip, port, data } = payload || {};
    const res = await printToNetworkPrinter(ip, port, data);
    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC Handler to safely open external links (e.g. WhatsApp, documentation, portals)
// in the user's default Windows browser without corrupting or hijacking Electron's keyboard focus
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('whatsapp://') || url.startsWith('mailto:'))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL scheme' };
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

    // Listen on fixed dedicated port (18492) so the origin http://127.0.0.1:18492 is static across app restarts.
    // This permanently protects localStorage, AsyncStorage, and user login tokens from being wiped.
    server.listen(FIXED_POS_PORT, '127.0.0.1', () => {
      console.log('Zentiq POS desktop server listening on static port ' + FIXED_POS_PORT);
      resolve({ server, port: FIXED_POS_PORT });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn('Port ' + FIXED_POS_PORT + ' in use, falling back to OS-assigned port...');
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          console.log('Zentiq POS desktop server listening on fallback port ' + port);
          resolve({ server, port });
        });
      } else {
        reject(err);
      }
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
      backgroundThrottling: false,
    },
  });

  // Intercept all window.open / target="_blank" links (e.g. WhatsApp, links) and open
  // cleanly in the user's default browser (Chrome/Edge/WhatsApp Desktop).
  // Strictly denies internal child windows so Electron's keyboard focus is NEVER corrupted or frozen.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('whatsapp://') || url.startsWith('mailto:'))) {
        shell.openExternal(url);
      }
    } catch (_) { }
    return { action: 'deny' };
  });

  // Restore Chromium webContents keyboard focus whenever the main window receives OS focus
  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.focus();
    }
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
