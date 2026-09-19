const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 9123;

// Helper: Get list of installed Windows Printers
function getWindowsPrinters() {
  return new Promise((resolve) => {
    try {
      const cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"';
      exec(cmd, { encoding: 'utf8', timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
        } else {
          const printers = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          resolve(printers);
        }
      });
    } catch (_) {
      resolve([]);
    }
  });
}

// Helper: Raw ESC/POS Print to Windows USB / Spooler Printer using winspool.drv
const psRawPrinterScript = path.join(os.tmpdir(), 'zentiq_raw_printer.ps1');
const psRawPrinterCode = `
param(
    [string]$printerName,
    [string]$filePath
)

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport(\"winspool.drv\", EntryPoint = \"OpenPrinterA\", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport(\"winspool.drv\", EntryPoint = \"ClosePrinter\", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport(\"winspool.drv\", EntryPoint = \"StartDocPrinterA\", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport(\"winspool.drv\", EntryPoint = \"EndDocPrinter\", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport(\"winspool.drv\", EntryPoint = \"StartPagePrinter\", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport(\"winspool.drv\", EntryPoint = \"EndPagePrinter\", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport(\"winspool.drv\", EntryPoint = \"WritePrinter\", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendFileToPrinter(string szPrinterName, string szFileName) {
        FileStream fs = new FileStream(szFileName, FileMode.Open, FileAccess.Read);
        BinaryReader br = new BinaryReader(fs);
        byte[] bytes = br.ReadBytes((int)fs.Length);
        fs.Close();

        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;

        di.pDocName = \"Zentiq ESC/POS Receipt\";
        di.pDataType = \"RAW\";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
\"@

if ($filePath -and (Test-Path $filePath)) {
    $res = [RawPrinterHelper]::SendFileToPrinter($printerName, $filePath)
    Write-Output \"RESULT:$res\"
}
`;

try {
  fs.writeFileSync(psRawPrinterScript, psRawPrinterCode, 'utf8');
} catch (e) {
  console.warn('Could not cache raw printer PS script:', e.message);
}

function printToWindowsUsbPrinter(printerName, dataArray) {
  return new Promise((resolve, reject) => {
    if (!printerName) {
      return reject(new Error('Printer Name is required for USB / Windows printing'));
    }
    const tempBin = path.join(os.tmpdir(), 'zentiq_receipt_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.bin');
    try {
      const buffer = Buffer.from(dataArray);
      fs.writeFileSync(tempBin, buffer);

      const safePrinterName = printerName.replace(/"/g, '`"');
      const cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File "' + psRawPrinterScript + '" -printerName "' + safePrinterName + '" -filePath "' + tempBin + '"';
      exec(cmd, { encoding: 'utf8', timeout: 10000 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tempBin); } catch (_) {}
        if (err) {
          return reject(new Error('USB Printer dispatch failed: ' + (stderr || err.message)));
        }
        if (stdout.includes('RESULT:True')) {
          resolve({ success: true, printer: printerName });
        } else {
          reject(new Error('Windows could not open printer "' + printerName + '". Check USB cable or verify printer name in Windows Settings.'));
        }
      });
    } catch (writeErr) {
      try { fs.unlinkSync(tempBin); } catch (_) {}
      reject(writeErr);
    }
  });
}

// Helper: Raw TCP LAN/Wi-Fi Print
function printToNetworkPrinter(ip, port, dataArray) {
  return new Promise((resolve, reject) => {
    if (!ip) {
      return reject(new Error('Printer IP address is required for LAN printing'));
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
            try { socket.destroy(); } catch (e) {}
            reject(err);
          }
        } else {
          setTimeout(() => {
            if (!isFinished) {
              isFinished = true;
              try { socket.end(); } catch (e) {}
              resolve({ success: true, ip, port: targetPort });
            }
          }, 400);
        }
      });
    });

    socket.on('error', (err) => {
      if (!isFinished) {
        isFinished = true;
        try { socket.destroy(); } catch (e) {}
        reject(err);
      }
    });

    socket.on('timeout', () => {
      if (!isFinished) {
        isFinished = true;
        try { socket.destroy(); } catch (e) {}
        reject(new Error('Connection timed out connecting to printer at ' + ip + ':' + targetPort + ' (8s timeout)'));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/api/health' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'Zentiq Dual USB + LAN Print Bridge' }));
    return;
  }

  // Get detected Windows printers
  if (req.method === 'GET' && (req.url === '/api/printers' || req.url === '/printers')) {
    const printers = await getWindowsPrinters();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, printers }));
    return;
  }

  // Unified Print Dispatch (USB or LAN)
  if (req.method === 'POST' && (req.url === '/api/print' || req.url === '/print')) {
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(body).toString());
        const isUsb = payload.printerType === 'USB' || (payload.printerName && !payload.ip);

        if (isUsb) {
          console.log('[Print Bridge] Dispatching USB print job to "' + payload.printerName + '" (' + (payload.data?.length || 0) + ' bytes)...');
          const result = await printToWindowsUsbPrinter(payload.printerName, payload.data);
          console.log('[Print Bridge] USB print completed successfully on "' + payload.printerName + '"');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else {
          console.log('[Print Bridge] Dispatching LAN print job to ' + payload.ip + ':' + payload.port + ' (' + (payload.data?.length || 0) + ' bytes)...');
          const result = await printToNetworkPrinter(payload.ip, payload.port, payload.data);
          console.log('[Print Bridge] LAN print completed successfully on ' + payload.ip + ':' + payload.port);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        }
      } catch (printErr) {
        console.error('[Print Bridge Error]:', printErr.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: printErr.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('=======================================================');
  console.log('  ZENTIQ DUAL THERMAL PRINT BRIDGE ACTIVE');
  console.log('  Port: http://127.0.0.1:' + PORT);
  console.log('  Supports: USB (Windows Spooler) + LAN (Raw TCP 9100)');
  console.log('=======================================================');
});