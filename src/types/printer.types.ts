export type PrinterWorkflowMode =
  | 'DUAL_PRINTER'       // Counter Bill + Separate Kitchen KOT (Send KOT button enabled)
  | 'SINGLE_COMBINED'    // Single Printer: Bill + Kitchen Slip Together (Send KOT button hidden)
  | 'SINGLE_BILL_ONLY'   // Single Printer: Bill Only - Quick Service (Send KOT button hidden)
  | 'RESTAURANT'         // Legacy alias for DUAL_PRINTER
  | 'TIFFIN_CENTER'      // Legacy alias for SINGLE_COMBINED
  | 'CURRY_POINT';       // Legacy alias for SINGLE_BILL_ONLY

export interface PrinterSettings {
  printerWorkflowMode?: PrinterWorkflowMode;
  printerType: 'LAN' | 'Bluetooth' | 'USB';
  printerName: string;
  ipAddress: string;
  port: number;
  kitchenPrinterType?: 'LAN' | 'USB';
  kitchenPrinterName?: string;
  kitchenIpAddress: string;
  kitchenPort: number;
  paperWidth?: '80mm_48' | '80mm_42' | '58mm_32';
}
