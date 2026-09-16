export type PrinterWorkflowMode = 'RESTAURANT' | 'CURRY_POINT' | 'TIFFIN_CENTER';

export interface PrinterSettings {
  printerWorkflowMode?: PrinterWorkflowMode;
  printerType: 'LAN' | 'Bluetooth' | 'USB';
  printerName: string;
  ipAddress: string;
  port: number;
  kitchenIpAddress: string;
  kitchenPort: number;
}
