export class PrinterService {
  async connect(ip: string, port: number): Promise<void> {
    console.log(`[Web Mock Printer] Connected to ${ip}:${port}`);
  }

  async print(data: Uint8Array): Promise<void> {
    console.log(`[Web Mock Printer] Printed ${data.length} bytes`);
  }

  async disconnect(): Promise<void> {
    console.log('[Web Mock Printer] Disconnected');
  }
}

export const printerService = new PrinterService();
