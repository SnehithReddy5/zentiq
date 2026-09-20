import { Platform } from 'react-native';

export class PrinterService {
  private client: any = null;
  private currentIp: string = '';
  private currentPort: number = 9100;
  private currentPrinterName: string = '';
  private currentPrinterType: 'LAN' | 'USB' = 'LAN';

  async getInstalledPrinters(): Promise<string[]> {
    if (Platform.OS === 'web') {
      try {
        const res = await fetch('http://127.0.0.1:9123/api/printers');
        const data = await res.json();
        return (data && Array.isArray(data.printers)) ? data.printers : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  connect(target: string, port: number = 9100, printerType?: 'LAN' | 'USB'): Promise<void> {
    const cleanTarget = (target || '').trim();
    if (!cleanTarget) {
      return Promise.reject(new Error('Printer target (IP address or Printer Name) is required'));
    }

    this.currentPrinterType = printerType || (cleanTarget.includes('.') ? 'LAN' : 'USB');
    if (this.currentPrinterType === 'USB') {
      this.currentPrinterName = cleanTarget;
    } else {
      this.currentIp = cleanTarget;
      this.currentPort = Number(port) || 9100;
    }

    // Web & Windows Electron environments
    if (Platform.OS === 'web') {
      return Promise.resolve();
    }

    // Native Mobile (Android & iOS) via react-native-tcp-socket
    return new Promise((resolve, reject) => {
      try {
        const { NativeModules } = require('react-native');
        if (!NativeModules || !NativeModules.TcpSockets) {
          return reject(
            new Error(
              'Thermal printing over raw TCP sockets is not supported in Expo Go. Please build an APK.'
            )
          );
        }

        const TcpSocket = require('react-native-tcp-socket').default || require('react-native-tcp-socket');
        if (!TcpSocket || !TcpSocket.createConnection) {
          return reject(
            new Error(
              'Thermal printing over raw TCP sockets is not supported in Expo Go. Please build an APK.'
            )
          );
        }

        this.client = TcpSocket.createConnection(
          { port: this.currentPort, host: this.currentIp },
          () => resolve()
        );

        this.client.setTimeout(6000);
        this.client.on('error', (error: any) => reject(error));
        this.client.on('timeout', () => {
          reject(new Error('Printer connection timeout (6s)'));
          this.disconnect();
        });
      } catch (error: any) {
        reject(error);
      }
    });
  }

  print(
    data: Uint8Array,
    overrideOptions?: { printerType?: 'LAN' | 'USB'; printerName?: string; ip?: string; port?: number }
  ): Promise<void> {
    const pType = overrideOptions?.printerType || this.currentPrinterType;
    const pName = overrideOptions?.printerName || this.currentPrinterName;
    const pIp = overrideOptions?.ip || this.currentIp;
    const pPort = overrideOptions?.port || this.currentPort;

    // 1. Windows / Web Bridge (Electron IPC or local HTTP /api/print proxy)
    if (Platform.OS === 'web') {
      const dataArray = Array.from(data);
      const electronBridge = typeof window !== 'undefined' ? (window as any).electronPrinter : null;

      if (electronBridge && typeof electronBridge.printRaw === 'function' && pType === 'LAN') {
        return electronBridge.printRaw(pIp, pPort, dataArray).then((res: any) => {
          if (res && res.success === false) {
            throw new Error(res.error || 'Failed to print on Windows');
          }
        });
      }

      const payload: any = {
        printerType: pType,
        data: dataArray,
      };
      if (pType === 'USB') {
        payload.printerName = pName;
      } else {
        payload.ip = pIp;
        payload.port = pPort;
      }

      return fetch('http://127.0.0.1:9123/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const resJson = await res.json().catch(() => ({}));
          if (!res.ok || (resJson && resJson.success === false)) {
            throw new Error(resJson.error || ('Printer server responded with HTTP ' + res.status));
          }
        })
        .catch((err) => {
          if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
            throw new Error('Thermal Print Bridge not running on this PC. Please run "npm run print-bridge".');
          }
          throw err;
        });
    }

    // 2. Native Mobile (Android & iOS)
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('Printer is not connected'));
      }

      try {
        this.client.write(data, undefined, (error: any) => {
          if (error) reject(error);
          else resolve();
        });
      } catch (writeErr: any) {
        reject(writeErr);
      }
    });
  }

  disconnect(): Promise<void> {
    if (Platform.OS === 'web') {
      this.client = null;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      if (!this.client) return resolve();
      const clientInstance = this.client;
      let isClosed = false;

      const cleanup = () => {
        if (!isClosed) {
          isClosed = true;
          try { clientInstance.destroy(); } catch (err) {}
          this.client = null;
          resolve();
        }
      };

      try {
        clientInstance.end();
        clientInstance.destroy();
      } catch (_) {}
      this.client = null;
      resolve();
    });
  }
}

export const printerService = new PrinterService();
