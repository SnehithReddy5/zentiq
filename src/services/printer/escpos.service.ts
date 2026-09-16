import type { TenantBranding } from '../../types/tenant.types';

export class ESCPOSService {
  static INIT = [0x1B, 0x40];
  static ALIGN_LEFT = [0x1B, 0x61, 0x00];
  static ALIGN_CENTER = [0x1B, 0x61, 0x01];
  static ALIGN_RIGHT = [0x1B, 0x61, 0x02];
  static BOLD_ON = [0x1B, 0x45, 0x01];
  static BOLD_OFF = [0x1B, 0x45, 0x00];
  static DOUBLE_HEIGHT = [0x1B, 0x21, 0x10];
  static DOUBLE_WIDTH = [0x1B, 0x21, 0x20];
  static DOUBLE_HEIGHT_WIDTH = [0x1B, 0x21, 0x30];
  static NORMAL_SIZE = [0x1B, 0x21, 0x00];
  static CUT = [0x1D, 0x56, 0x41, 0x10];
  static NEW_LINE = [0x0A];

  // Standard safe printable width for 80mm thermal paper (prevents edge overflow and ghost blank lines)
  static RECEIPT_WIDTH = 38;

  private static wrapText(text: string, maxLength: number): string[] {
    const words = (text || '').split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length ? lines : [''];
  }

  // Robust 2-column key-value formatter that never exceeds RECEIPT_WIDTH (38 cols)
  private static formatTwoCol(left: string, right: string, width = ESCPOSService.RECEIPT_WIDTH): string {
    const l = (left || '').trim();
    const r = (right || '').trim();
    const spaceCount = Math.max(1, width - l.length - r.length);
    return l + ''.padEnd(spaceCount, ' ') + r + '\n';
  }

  // 4-column itemized line: Item (18) + Qty (4) + Price (8) + Amount (8) = 38 cols
  private static formatRow38(item: string, qty: string, price: string, amount: string): string {
    const col1 = item.substring(0, 18).padEnd(18, ' ');
    const col2 = qty.padStart(4, ' ');
    const col3 = price.padStart(8, ' ');
    const col4 = amount.padStart(8, ' ');
    return `${col1}${col2}${col3}${col4}\n`;
  }

  // 3-column KOT row: Item (20) + Note (12) + Qty (6) = 38 cols
  private static formatKOTRow38(item: string, note: string, qty: string): string {
    const col1 = item.substring(0, 20).padEnd(20, ' ');
    const col2 = note.substring(0, 12).padEnd(12, ' ');
    const col3 = qty.padStart(6, ' ');
    return `${col1}${col2}${col3}\n`;
  }

  private static pushSeparatorLine(buffer: number[], char = '-'): void {
    const lineStr = char.repeat(this.RECEIPT_WIDTH) + '\n';
    buffer.push(...this.stringToBytes(lineStr));
  }

  static buildKOT(
    kotNo: number | string,
    tableNo: number,
    captainName: string,
    items: any[],
    specialNote?: string,
    orderType: string = 'DINE_IN'
  ): Uint8Array {
    let buffer: number[] = [];

    buffer.push(...this.INIT);
    buffer.push(...this.ALIGN_CENTER);
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes('KITCHEN ORDER TICKET\n'));
    buffer.push(...this.BOLD_OFF);

    const date = new Date();
    const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    const cleanType = (orderType || '').toUpperCase().trim();
    let orderTypeStr = (tableNo && tableNo > 0) ? `Table: ${tableNo}` : (cleanType === 'PICKUP' ? 'Pick Up' : 'Takeaway');

    buffer.push(...this.ALIGN_LEFT);
    this.pushSeparatorLine(buffer, '=');
    buffer.push(...this.stringToBytes(this.formatTwoCol(`KOT #: ${kotNo}`, orderTypeStr)));
    buffer.push(...this.stringToBytes(this.formatTwoCol(`Time: ${formattedDate}`, `Staff: ${captainName || 'Staff'}`)));
    this.pushSeparatorLine(buffer, '-');

    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatKOTRow38('Item', 'Special Note', 'Qty.')));
    buffer.push(...this.BOLD_OFF);
    this.pushSeparatorLine(buffer, '-');

    items.forEach(item => {
      let nameStr = (item.itemName || item.name || '');
      if (item.variantName) {
        nameStr += ` (${item.variantName})`;
      }
      let wrappedNameLines = this.wrapText(nameStr, 20);
      let line1Name = wrappedNameLines[0] || '';
      let note = item.note || '--';
      let qty = (item.qty || 1).toString();

      buffer.push(...this.stringToBytes(this.formatKOTRow38(line1Name, note, qty)));

      for (let i = 1; i < wrappedNameLines.length; i++) {
        buffer.push(...this.stringToBytes(wrappedNameLines[i].padEnd(38, ' ') + '\n'));
      }
    });

    this.pushSeparatorLine(buffer, '-');

    if (specialNote) {
      buffer.push(...this.stringToBytes(`Note: ${specialNote}\n`));
      this.pushSeparatorLine(buffer, '-');
    }

    buffer.push(...this.NEW_LINE);
    buffer.push(...this.NEW_LINE);
    buffer.push(...this.NEW_LINE);
    buffer.push(...this.CUT);

    return new Uint8Array(buffer);
  }

  static buildKitchenSlip(tableNo: number, itemName: string, qty: number): Uint8Array {
    return this.buildKOT('NEW ITEM', tableNo, 'POS Terminal', [{ itemName, qty, note: '--' }]);
  }

  static buildBill(
    billNo: number | string,
    tableNo: number,
    cashierName: string,
    items: any[],
    branding?: TenantBranding | null,
    orderType: string = 'DINE_IN',
    payments?: any[]
  ): Uint8Array {
    let buffer: number[] = [];

    buffer.push(...this.INIT);
    buffer.push(...this.ALIGN_CENTER);

    // 1. Dynamic Branding Header (Centered)
    buffer.push(...this.BOLD_ON);
    const headerTitle = branding?.receiptHeader || branding?.displayName || branding?.businessName || 'ZENTIQ POS';
    buffer.push(...this.stringToBytes(`${headerTitle.toUpperCase()}\n`));
    buffer.push(...this.BOLD_OFF);

    if (branding?.address) {
      const wrappedAddress = this.wrapText(branding.address, 34);
      wrappedAddress.forEach(line => buffer.push(...this.stringToBytes(`${line}\n`)));
    }
    if (branding?.phone) {
      buffer.push(...this.stringToBytes(`Phone: ${branding.phone}\n`));
    }
    if (branding?.gstin) {
      buffer.push(...this.stringToBytes(`GSTIN: ${branding.gstin.trim()}\n`));
    }

    // 2. Order Metadata Block (Strict 38 columns, No Overflow)
    buffer.push(...this.ALIGN_LEFT);
    this.pushSeparatorLine(buffer, '=');

    const date = new Date();
    const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
    const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    const rightOrderType = (tableNo === 0 || !tableNo)
      ? (orderType === 'PICKUP' ? 'Pick Up' : 'Takeaway')
      : `Table: ${tableNo}`;

    // Bill # & Table are placed cleanly at the top of the details
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatTwoCol(`Bill No: #${billNo}`, rightOrderType)));
    buffer.push(...this.BOLD_OFF);
    buffer.push(...this.stringToBytes(this.formatTwoCol(`Date: ${formattedDate} ${formattedTime}`, `Staff: ${cashierName || 'Staff'}`)));

    // 3. Itemized Grid Header
    this.pushSeparatorLine(buffer, '-');
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatRow38('Item', 'Qty', 'Price', 'Amount')));
    buffer.push(...this.BOLD_OFF);
    this.pushSeparatorLine(buffer, '-');

    // 4. Dynamic GST Configuration from Branding / Store Settings
    const gstEnabled = branding?.gstEnabled !== false;
    const gstType = branding?.gstType || 'INCLUSIVE';
    const cgstRate = typeof branding?.cgstRate === 'number' ? branding.cgstRate : 2.5;
    const sgstRate = typeof branding?.sgstRate === 'number' ? branding.sgstRate : 2.5;
    const totalTaxRate = (cgstRate + sgstRate) / 100;

    let grandTotalRaw = 0;
    let totalQty = 0;

    items.forEach(item => {
      let qty = (item.qty || 1);
      let price = (item.price || 0);
      grandTotalRaw += price * qty;
      totalQty += qty;

      // Base price computation according to GST mode
      let basePrice = price;
      if (gstEnabled && gstType === 'INCLUSIVE' && totalTaxRate > 0) {
        basePrice = Math.round((price / (1 + totalTaxRate)) * 100) / 100;
      }
      let baseAmount = Math.round((basePrice * qty) * 100) / 100;

      let nameStr = (item.itemName || item.name || '');
      if (item.variantName) {
        nameStr += ` (${item.variantName})`;
      }
      let wrappedNameLines = this.wrapText(nameStr, 18);

      let line1Name = wrappedNameLines[0] || '';
      let qtyStr = qty.toString();
      let priceStr = basePrice.toFixed(2);
      let amtStr = baseAmount.toFixed(2);

      buffer.push(...this.stringToBytes(this.formatRow38(line1Name, qtyStr, priceStr, amtStr)));

      for (let i = 1; i < wrappedNameLines.length; i++) {
        buffer.push(...this.stringToBytes(wrappedNameLines[i].padEnd(38, ' ') + '\n'));
      }
    });

    this.pushSeparatorLine(buffer, '-');

    // 5. Financial Summary & GST Breakdown
    let subTotal = 0;
    let cgst = 0;
    let sgst = 0;
    let finalGrandTotal = 0;
    let roundOff = 0;

    if (!gstEnabled) {
      // GST Disabled: flat bill with no tax lines
      subTotal = grandTotalRaw;
      finalGrandTotal = grandTotalRaw;

      buffer.push(...this.stringToBytes(this.formatTwoCol('Total Items / Qty:', totalQty.toString())));
      buffer.push(...this.stringToBytes(this.formatTwoCol('Subtotal:', subTotal.toFixed(2))));
    } else if (gstType === 'EXCLUSIVE') {
      // Exclusive GST: Tax is charged separately on top of subtotal
      subTotal = grandTotalRaw;
      cgst = Math.round((subTotal * (cgstRate / 100)) * 100) / 100;
      sgst = Math.round((subTotal * (sgstRate / 100)) * 100) / 100;
      const computedTotal = subTotal + cgst + sgst;
      finalGrandTotal = Math.round(computedTotal);
      roundOff = Math.round((finalGrandTotal - computedTotal) * 100) / 100;

      buffer.push(...this.stringToBytes(this.formatTwoCol('Total Items / Qty:', totalQty.toString())));
      buffer.push(...this.stringToBytes(this.formatTwoCol('Subtotal:', subTotal.toFixed(2))));
      buffer.push(...this.stringToBytes(this.formatTwoCol(`CGST (${cgstRate}%):`, cgst.toFixed(2))));
      buffer.push(...this.stringToBytes(this.formatTwoCol(`SGST (${sgstRate}%):`, sgst.toFixed(2))));
      if (roundOff !== 0) {
        buffer.push(...this.stringToBytes(this.formatTwoCol('Round Off:', (roundOff > 0 ? '+' : '') + roundOff.toFixed(2))));
      }
    } else {
      // Inclusive GST: Tax is already included in prices (derived backwards)
      finalGrandTotal = grandTotalRaw;
      subTotal = totalTaxRate > 0 ? Math.round((finalGrandTotal / (1 + totalTaxRate)) * 100) / 100 : finalGrandTotal;
      const totalTax = finalGrandTotal - subTotal;
      const combinedRate = (cgstRate + sgstRate) || 1;
      cgst = Math.round((totalTax * (cgstRate / combinedRate)) * 100) / 100;
      sgst = Math.round((totalTax - cgst) * 100) / 100;
      roundOff = Math.round((finalGrandTotal - (subTotal + cgst + sgst)) * 100) / 100;

      buffer.push(...this.stringToBytes(this.formatTwoCol('Total Items / Qty:', totalQty.toString())));
      buffer.push(...this.stringToBytes(this.formatTwoCol('Subtotal (Excl. Tax):', subTotal.toFixed(2))));
      buffer.push(...this.stringToBytes(this.formatTwoCol(`CGST (${cgstRate}%):`, cgst.toFixed(2))));
      buffer.push(...this.stringToBytes(this.formatTwoCol(`SGST (${sgstRate}%):`, sgst.toFixed(2))));
      if (roundOff !== 0) {
        buffer.push(...this.stringToBytes(this.formatTwoCol('Round Off:', (roundOff > 0 ? '+' : '') + roundOff.toFixed(2))));
      }
    }

    // 6. Grand Total (Bold & Prominent)
    this.pushSeparatorLine(buffer, '=');
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatTwoCol('GRAND TOTAL:', `INR ${finalGrandTotal.toFixed(2)}`)));
    buffer.push(...this.BOLD_OFF);
    this.pushSeparatorLine(buffer, '=');

    // 7. Payment Breakdown (if present)
    if (payments && payments.length > 0) {
      buffer.push(...this.stringToBytes('Payment Breakdown:\n'));
      payments.forEach((p: any) => {
        buffer.push(...this.stringToBytes(this.formatTwoCol(`  ${p.method}:`, `INR ${Number(p.amount).toFixed(2)}`)));
      });
      this.pushSeparatorLine(buffer, '-');
    }

    // 8. Footer Note
    buffer.push(...this.ALIGN_CENTER);
    const footer = branding?.receiptFooter || 'Thank You & Visit Again!!';
    buffer.push(...this.stringToBytes(`${footer}\n`));

    buffer.push(...this.NEW_LINE);
    buffer.push(...this.NEW_LINE);
    buffer.push(...this.NEW_LINE);
    buffer.push(...this.CUT);

    return new Uint8Array(buffer);
  }

  private static stringToBytes(str: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code === 8377) {
        bytes.push(158); // 0x9E: Indian Rupee glyph on thermal firmware
      } else if (code > 255) {
        bytes.push(63);  // '?'
      } else {
        bytes.push(code);
      }
    }
    return bytes;
  }

  static buildKitchenToken(
    billNo: number | string,
    tableNo: number,
    cashierName: string,
    items: any[],
    orderType: string = 'COUNTER'
  ): Uint8Array {
    let buffer: number[] = [];

    buffer.push(...this.INIT);
    buffer.push(...this.ALIGN_CENTER);
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.DOUBLE_HEIGHT);
    buffer.push(...this.stringToBytes('*** KITCHEN TOKEN ***\n'));
    buffer.push(...this.NORMAL_SIZE);
    buffer.push(...this.BOLD_OFF);

    const date = new Date();
    const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    const cleanType = (orderType || '').toUpperCase().trim();
    let orderTypeStr = (tableNo && tableNo > 0) ? `Table: ${tableNo}` : (cleanType === 'PICKUP' ? 'Pick Up' : (cleanType === 'COUNTER' ? 'Counter' : 'Takeaway'));

    buffer.push(...this.ALIGN_LEFT);
    this.pushSeparatorLine(buffer, '=');
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatTwoCol(`BILL #: ${billNo}`, orderTypeStr)));
    buffer.push(...this.BOLD_OFF);
    buffer.push(...this.stringToBytes(this.formatTwoCol(`Time: ${formattedDate}`, `By: ${cashierName || 'Staff'}`)));
    this.pushSeparatorLine(buffer, '-');

    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatTwoCol('ITEMS TO PREPARE', 'QTY')));
    buffer.push(...this.BOLD_OFF);
    this.pushSeparatorLine(buffer, '-');

    items.forEach(item => {
      let nameStr = (item.itemName || item.name || '');
      if (item.variantName) {
        nameStr += ` (${item.variantName})`;
      }
      const qtyStr = `${item.qty || 1}x`;
      buffer.push(...this.BOLD_ON);
      buffer.push(...this.stringToBytes(this.formatTwoCol(nameStr, qtyStr)));
      buffer.push(...this.BOLD_OFF);
      if (item.note) {
        buffer.push(...this.stringToBytes(`  Note: ${item.note}\n`));
      }
    });

    this.pushSeparatorLine(buffer, '=');
    buffer.push(...this.ALIGN_CENTER);
    buffer.push(...this.stringToBytes('Ready for kitchen pickup\n\n\n'));
    buffer.push(...this.CUT);

    return new Uint8Array(buffer);
  }

  static buildCombinedTiffinPrints(
    billNo: number | string,
    tableNo: number,
    cashierName: string,
    items: any[],
    branding?: TenantBranding | null,
    orderType: string = 'DINE_IN',
    payments?: any[]
  ): Uint8Array {
    const billBytes = this.buildBill(billNo, tableNo, cashierName, items, branding, orderType, payments);
    const tokenBytes = this.buildKitchenToken(billNo, tableNo, cashierName, items, orderType);
    
    const combined = new Uint8Array(billBytes.length + tokenBytes.length);
    combined.set(billBytes, 0);
    combined.set(tokenBytes, billBytes.length);
    return combined;
  }
}
