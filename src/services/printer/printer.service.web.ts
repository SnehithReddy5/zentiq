export class PrinterService {
  private currentIp: string = '';
  private currentPort: number = 9100;
  private currentPrinterName: string = '';
  private currentPrinterType: 'LAN' | 'USB' = 'LAN';

  async connect(target: string, port: number = 9100, printerType?: 'LAN' | 'USB'): Promise<void> {
    const cleanTarget = (target || '').trim();
    if (!cleanTarget) {
      throw new Error('Printer target (IP address or Printer Name) is required');
    }

    this.currentPrinterType = printerType || (cleanTarget.includes('.') ? 'LAN' : 'USB');
    if (this.currentPrinterType === 'USB') {
      this.currentPrinterName = cleanTarget;
    } else {
      this.currentIp = cleanTarget;
      this.currentPort = Number(port) || 9100;
    }
  }

  async getInstalledPrinters(): Promise<string[]> {
    try {
      const res = await fetch('http://127.0.0.1:9123/api/printers');
      const data = await res.json();
      return (data && Array.isArray(data.printers)) ? data.printers : [];
    } catch (_) {
      return [];
    }
  }

  async print(
    data: Uint8Array,
    overrideOptions?: { printerType?: 'LAN' | 'USB'; printerName?: string; ip?: string; port?: number }
  ): Promise<void> {
    const dataArray = Array.from(data);
    const pType = overrideOptions?.printerType || this.currentPrinterType;
    const pName = overrideOptions?.printerName || this.currentPrinterName;
    const pIp = overrideOptions?.ip || this.currentIp;
    const pPort = overrideOptions?.port || this.currentPort;

    // 1. If running inside Electron desktop app with IPC for LAN
    const electronBridge = typeof window !== 'undefined' ? (window as any).electronPrinter : null;
    if (electronBridge && typeof electronBridge.printRaw === 'function' && pType === 'LAN') {
      const res = await electronBridge.printRaw(pIp, pPort, dataArray);
      if (res && res.success === false) {
        throw new Error(res.error || 'Electron thermal printer dispatch failed');
      }
      return;
    }

    // 2. Dispatch to Zentiq Local Print Bridge (port 9123)
    try {
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

      const response = await fetch('http://127.0.0.1:9123/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resJson = await response.json().catch(() => ({}));
      if (!response.ok || (resJson && resJson.success === false)) {
        throw new Error(resJson.error || ('Printer bridge error (HTTP ' + response.status + ')'));
      }
      return;
    } catch (bridgeErr: any) {
      if (bridgeErr.message && (bridgeErr.message.includes('Failed to fetch') || bridgeErr.message.includes('NetworkError'))) {
        throw new Error(
          'Thermal Print Bridge not running on this PC. Please run: "npm run print-bridge" in terminal to enable Windows USB / LAN printing.'
        );
      }
      throw bridgeErr;
    }
  }

  async disconnect(): Promise<void> {}
}

export const printerService = new PrinterService();
