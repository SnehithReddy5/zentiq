import { Platform } from 'react-native';

export class PrinterService {
  private client: any = null;
  private currentIp: string = '';
  private currentPort: number = 9100;

  connect(ip: string, port: number): Promise<void> {
    this.currentIp = (ip || '').trim();
    this.currentPort = Number(port) || 9100;

    if (!this.currentIp) {
      return Promise.reject(new Error('Invalid IP address for printer'));
    }

    // Web & Windows Electron environments
    if (Platform.OS === 'web') {
      // In Web/Electron, connections are managed on demand via native IPC/HTTP bridge
      return Promise.resolve();
    }

    // Native Mobile (Android & iOS) via react-native-tcp-socket
    return new Promise((resolve, reject) => {
      try {
        const { NativeModules } = require('react-native');
        if (!NativeModules || !NativeModules.TcpSockets) {
          return reject(
            new Error(
              'Thermal printing over raw TCP sockets is not supported in Expo Go. You must build an APK (eas build -p android --profile preview) to print on physical Android devices.'
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
          () => {
            resolve();
          }
        );

        this.client.setTimeout(6000);

        this.client.on('error', (error: any) => {
          reject(error);
        });

        this.client.on('timeout', () => {
          reject(new Error('Printer connection timeout (6s)'));
          this.disconnect();
        });
      } catch (error: any) {
        if (error instanceof TypeError && error.message.includes('null')) {
          reject(
            new Error(
              'Thermal printing over raw TCP sockets is not supported in Expo Go. You must build an APK (eas build -p android --profile preview) to print on physical Android devices.'
            )
          );
        } else {
          reject(error);
        }
      }
    });
  }

  print(data: Uint8Array): Promise<void> {
    // 1. Windows / Web Bridge (Electron IPC or local HTTP /api/print proxy)
    if (Platform.OS === 'web') {
      const dataArray = Array.from(data);
      const electronBridge = typeof window !== 'undefined' ? (window as any).electronPrinter : null;

      if (electronBridge && typeof electronBridge.printRaw === 'function') {
        return electronBridge.printRaw(this.currentIp, this.currentPort, dataArray).then((res: any) => {
          if (res && res.success === false) {
            throw new Error(res.error || 'Failed to print on Windows');
          }
        });
      }

      // HTTP Proxy fallback (served by electron/main.js local server)
      return fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: this.currentIp,
          port: this.currentPort,
          data: dataArray,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || ('Printer server responded with HTTP ' + res.status));
          }
          return res.json();
        })
        .then((resJson) => {
          if (resJson && resJson.success === false) {
            throw new Error(resJson.error || 'Desktop printer dispatch failed');
          }
        })
        .catch((err) => {
          console.warn('Windows print bridge error:', err);
          throw new Error('Printer connection failed to ' + this.currentIp + ':' + this.currentPort + ' (' + err.message + ')');
        });
    }

    // 2. Native Mobile (Android & iOS)
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('Printer is not connected'));
      }

      // DO NOT call Buffer.from(data) because Buffer is not globally defined in Hermes on Android
      // react-native-tcp-socket natively accepts Uint8Array directly
      try {
        this.client.write(data, undefined, (error: any) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
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
      if (!this.client) {
        return resolve();
      }

      const clientInstance = this.client;
      let isClosed = false;

      const cleanup = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            clientInstance.destroy();
          } catch (err) {}
          this.client = null;
          resolve();
        }
      };

      // 400ms pause to ensure data packets have drained from socket before closing connection
      setTimeout(() => {
        try {
          clientInstance.once('close', cleanup);
          clientInstance.once('error', cleanup);
          clientInstance.end();
          setTimeout(cleanup, 800);
        } catch (err) {
          cleanup();
        }
      }, 400);
    });
  }
}

export const printerService = new PrinterService();
