import TcpSocket from 'react-native-tcp-socket';

export class PrinterService {
  private client: any = null;

  connect(ip: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!ip || !port) {
          return reject(new Error('Invalid IP or Port for printer'));
        }
        this.client = TcpSocket.createConnection({ port, host: ip }, () => {
          resolve();
        });

        this.client.setTimeout(5000);

        this.client.on('error', (error: any) => {
          reject(error);
        });

        this.client.on('timeout', () => {
          reject(new Error('Printer connection timeout (5s)'));
          this.disconnect();
        });
      } catch (error: any) {
        reject(error);
      }
    });
  }

  print(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('Printer is not connected'));
      }

      this.client.write(Buffer.from(data), (error: any) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  disconnect(): Promise<void> {
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

      const safetyTimeout = setTimeout(cleanup, 1500);

      clientInstance.once('close', () => {
        clearTimeout(safetyTimeout);
        cleanup();
      });

      clientInstance.once('error', () => {
        clearTimeout(safetyTimeout);
        cleanup();
      });

      try {
        clientInstance.end();
      } catch (err) {
        clearTimeout(safetyTimeout);
        cleanup();
      }
    });
  }
}

export const printerService = new PrinterService();
