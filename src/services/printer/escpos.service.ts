import type { TenantBranding } from '../../types/tenant.types';

export class ESCPOSService {
  static INIT = [
    0x1B, 0x40,             // ESC @: Initialize printer
    0x1D, 0x4C, 0x00, 0x00, // GS L 0 0: Set left margin to 0 dots (removes unwanted left indentation)
    0x1D, 0x57, 0x40, 0x02, // GS W 576 dots: Set printable area to full 80mm width (eliminates right empty space)
    0x1B, 0x20, 0x00,       // ESC SP 0: Character spacing 0
    0x1B, 0x4D, 0x00        // ESC M 0: Select Font A (12x24 dots standard)
  ];
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

  // Full 48-column printable width for standard 80mm thermal paper (eliminates ugly right whitespace)
  static RECEIPT_WIDTH = 48;

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

  // Robust 2-column key-value formatter that stretches across full receipt width without wrapping
  private static formatTwoCol(left: string, right: string, width = ESCPOSService.RECEIPT_WIDTH): string {
    const l = (left || '').trim();
    const r = (right || '').trim();
    const maxLeftLen = Math.max(1, width - r.length - 1);
    const cleanL = l.length > maxLeftLen ? l.substring(0, maxLeftLen) : l;
    const spaceCount = Math.max(1, width - cleanL.length - r.length);
    return cleanL + ''.padEnd(spaceCount, ' ') + r + '\n';
  }

  // 4-column itemized line across full 48 columns: Item (22) + Qty (5) + Price (10) + Amount (11) = 48
  private static formatRow48(item: string, qty: string, price: string, amount: string): string {
    const col1 = item.substring(0, 22).padEnd(22, ' ');
    const col2 = qty.padStart(5, ' ');
    const col3 = price.padStart(10, ' ');
    const col4 = amount.padStart(11, ' ');
    return `${col1}${col2}${col3}${col4}\n`;
  }

  // 3-column KOT row across 48 columns: Item (26) + Note (14) + Qty (8) = 48
  private static formatKOTRow48(item: string, note: string, qty: string): string {
    const col1 = item.substring(0, 26).padEnd(26, ' ');
    const col2 = note.substring(0, 14).padEnd(14, ' ');
    const col3 = qty.padStart(8, ' ');
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
    const cleanStaff = (captainName || 'Staff').slice(0, 24);

    buffer.push(...this.ALIGN_LEFT);
    this.pushSeparatorLine(buffer, '=');
    buffer.push(...this.stringToBytes(this.formatTwoCol(`KOT #: ${kotNo}`, orderTypeStr, 48)));
    buffer.push(...this.stringToBytes(this.formatTwoCol(`Time: ${formattedDate}`, `Staff: ${cleanStaff}`, 48)));
    this.pushSeparatorLine(buffer, '-');

    // 48-character KOT header
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatKOTRow48('Item', 'Special Note', 'Qty')));
    buffer.push(...this.BOLD_OFF);
    this.pushSeparatorLine(buffer, '-');

    items.forEach(item => {
      let nameStr = item.itemName || item.name || '';
      if (item.variantName) {
        nameStr += ` (${item.variantName})`;
      }
      const wrappedNameLines = this.wrapText(nameStr, 26);
      const line1Name = wrappedNameLines[0] || '';
      const note = (item.note || '--').substring(0, 14);
      const qty = (item.qty || 1).toString();

      buffer.push(...this.stringToBytes(this.formatKOTRow48(line1Name, note, qty)));

      for (let i = 1; i < wrappedNameLines.length; i++) {
        buffer.push(...this.stringToBytes(wrappedNameLines[i].padEnd(48, ' ') + '\n'));
      }
    });

    this.pushSeparatorLine(buffer, '-');

    if (specialNote && specialNote.trim()) {
      buffer.push(...this.stringToBytes(`Note: ${specialNote.trim()}\n`));
      this.pushSeparatorLine(buffer, '-');
    }

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
      const wrappedAddress = this.wrapText(branding.address, 42);
      wrappedAddress.forEach(line => buffer.push(...this.stringToBytes(`${line}\n`)));
    }
    if (branding?.phone) {
      buffer.push(...this.stringToBytes(`Phone: ${branding.phone}\n`));
    }
    if (branding?.gstin) {
      buffer.push(...this.stringToBytes(`GSTIN: ${branding.gstin.trim()}\n`));
    }

    // 2. Order Metadata Block (Full 48 columns with graceful Cashier name handling)
    buffer.push(...this.ALIGN_LEFT);
    this.pushSeparatorLine(buffer, '=');

    const date = new Date();
    const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
    const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    const rightOrderType = (tableNo === 0 || !tableNo)
      ? (orderType === 'PICKUP' ? 'Pick Up' : 'Takeaway')
      : `Table: ${tableNo}`;

    const cleanCashier = (cashierName || 'Staff').slice(0, 22);

    // Row 1: Date/Time (Left) & Order Type / Table (Right)
    buffer.push(...this.stringToBytes(this.formatTwoCol(`Date: ${formattedDate} ${formattedTime}`, rightOrderType, 48)));
    // Row 2: Cashier Name (Left) & Bill No (Right)
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatTwoCol(`Cashier: ${cleanCashier}`, `Bill No: #${billNo}`, 48)));
    buffer.push(...this.BOLD_OFF);

    // 3. Itemized Grid Header (Full 48 Columns)
    this.pushSeparatorLine(buffer, '-');
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatRow48('Item', 'Qty', 'Price', 'Amount')));
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
      const qty = item.qty || 1;
      const price = Number(item.price) || 0;
      const lineTotal = price * qty;
      grandTotalRaw += lineTotal;
      totalQty += qty;

      let displayUnitPrice = price;
      let displayLineTotal = lineTotal;

      // Reverse calculate base price if GST is INCLUSIVE
      if (gstEnabled && gstType === 'INCLUSIVE' && totalTaxRate > 0) {
        displayUnitPrice = Math.round((price / (1 + totalTaxRate)) * 100) / 100;
        displayLineTotal = Math.round((displayUnitPrice * qty) * 100) / 100;
      }

      let nameStr = item.itemName || item.name || 'Item';
      if (item.variantName) {
        nameStr += ` (${item.variantName})`;
      }
      const wrappedNameLines = this.wrapText(nameStr, 22);
      const line1Name = wrappedNameLines[0] || '';

      buffer.push(
        ...this.stringToBytes(
          this.formatRow48(
            line1Name,
            qty.toString(),
            displayUnitPrice.toFixed(2),
            displayLineTotal.toFixed(2)
          )
        )
      );

      for (let i = 1; i < wrappedNameLines.length; i++) {
        buffer.push(...this.stringToBytes(wrappedNameLines[i].padEnd(48, ' ') + '\n'));
      }
    });

    this.pushSeparatorLine(buffer, '-');

    // 5. Financial Summary & GST Breakdown (Full 48 Columns)
    let subTotal = 0;
    let cgst = 0;
    let sgst = 0;
    let finalGrandTotal = 0;
    let roundOff = 0;

    if (!gstEnabled) {
      subTotal = grandTotalRaw;
      finalGrandTotal = grandTotalRaw;

      buffer.push(...this.stringToBytes(this.formatTwoCol('Total Items / Qty:', totalQty.toString(), 48)));
      buffer.push(...this.stringToBytes(this.formatTwoCol('Subtotal:', subTotal.toFixed(2), 48)));
    } else if (gstType === 'EXCLUSIVE') {
      subTotal = grandTotalRaw;
      cgst = Math.round((subTotal * (cgstRate / 100)) * 100) / 100;
      sgst = Math.round((subTotal * (sgstRate / 100)) * 100) / 100;
      const computedTotal = subTotal + cgst + sgst;
      finalGrandTotal = Math.round(computedTotal);
      roundOff = Math.round((finalGrandTotal - computedTotal) * 100) / 100;

      buffer.push(...this.stringToBytes(this.formatTwoCol('Total Items / Qty:', totalQty.toString(), 48)));
      buffer.push(...this.stringToBytes(this.formatTwoCol('Subtotal:', subTotal.toFixed(2), 48)));
      buffer.push(...this.stringToBytes(this.formatTwoCol(`CGST (${cgstRate}%):`, cgst.toFixed(2), 48)));
      buffer.push(...this.stringToBytes(this.formatTwoCol(`SGST (${sgstRate}%):`, sgst.toFixed(2), 48)));
      if (roundOff !== 0) {
        buffer.push(...this.stringToBytes(this.formatTwoCol('Round Off:', (roundOff > 0 ? '+' : '') + roundOff.toFixed(2), 48)));
      }
    } else {
      finalGrandTotal = grandTotalRaw;
      subTotal = totalTaxRate > 0 ? Math.round((finalGrandTotal / (1 + totalTaxRate)) * 100) / 100 : finalGrandTotal;
      const totalTax = finalGrandTotal - subTotal;
      const combinedRate = (cgstRate + sgstRate) || 1;
      cgst = Math.round((totalTax * (cgstRate / combinedRate)) * 100) / 100;
      sgst = Math.round((totalTax - cgst) * 100) / 100;
      roundOff = Math.round((finalGrandTotal - (subTotal + cgst + sgst)) * 100) / 100;

      buffer.push(...this.stringToBytes(this.formatTwoCol('Total Items / Qty:', totalQty.toString(), 48)));
      buffer.push(...this.stringToBytes(this.formatTwoCol('Subtotal (Excl. Tax):', subTotal.toFixed(2), 48)));
      buffer.push(...this.stringToBytes(this.formatTwoCol(`CGST (${cgstRate}%):`, cgst.toFixed(2), 48)));
      buffer.push(...this.stringToBytes(this.formatTwoCol(`SGST (${sgstRate}%):`, sgst.toFixed(2), 48)));
      if (roundOff !== 0) {
        buffer.push(...this.stringToBytes(this.formatTwoCol('Round Off:', (roundOff > 0 ? '+' : '') + roundOff.toFixed(2), 48)));
      }
    }

    // 6. Grand Total (Bold & Edge-to-Edge)
    this.pushSeparatorLine(buffer, '=');
    buffer.push(...this.BOLD_ON);
    buffer.push(...this.stringToBytes(this.formatTwoCol('GRAND TOTAL:', `INR ${finalGrandTotal.toFixed(2)}`, 48)));
    buffer.push(...this.BOLD_OFF);
    this.pushSeparatorLine(buffer, '=');

    // 7. Payment Breakdown (if present)
    if (payments && payments.length > 0) {
      buffer.push(...this.stringToBytes('Payment Breakdown:\n'));
      payments.forEach((p: any) => {
        buffer.push(...this.stringToBytes(this.formatTwoCol(`  ${p.method}:`, `INR ${Number(p.amount).toFixed(2)}`, 48)));
      });
      this.pushSeparatorLine(buffer, '-');
    }

    // 8. Footer Note
    buffer.push(...this.ALIGN_CENTER);
    const footer = branding?.receiptFooter || 'Thank You & Visit Again!!';
    buffer.push(...this.stringToBytes(`${footer}\n`));

    buffer.push(...this.NEW_LINE);
    buffer.push(...this.NEW_LINE);
    buffer.push(...this.CUT);

    return new Uint8Array(buffer);
  }

  // Mode 3: Tiffin Center combined prints (Bill + Kitchen Token slip)
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

    let tokenBuffer: number[] = [];
    tokenBuffer.push(...this.INIT);
    tokenBuffer.push(...this.ALIGN_CENTER);
    tokenBuffer.push(...this.BOLD_ON);
    tokenBuffer.push(...this.DOUBLE_HEIGHT_WIDTH);
    tokenBuffer.push(...this.stringToBytes(`TOKEN #${billNo}\n`));
    tokenBuffer.push(...this.NORMAL_SIZE);
    tokenBuffer.push(...this.BOLD_OFF);

    const orderTypeLabel = (tableNo && tableNo > 0) ? `Table: ${tableNo}` : (orderType === 'PICKUP' ? 'Pick Up' : 'Takeaway');
    tokenBuffer.push(...this.stringToBytes(`${orderTypeLabel} • Kitchen Copy\n`));
    this.pushSeparatorLine(tokenBuffer, '-');

    tokenBuffer.push(...this.ALIGN_LEFT);
    items.forEach((item: any) => {
      const q = (item.qty || 1).toString();
      const n = item.itemName || item.name || 'Item';
      const v = item.variantName ? ` (${item.variantName})` : '';
      tokenBuffer.push(...this.BOLD_ON);
      tokenBuffer.push(...this.stringToBytes(`  ${q}x ${n}${v}\n`));
      tokenBuffer.push(...this.BOLD_OFF);
      if (item.note && item.note !== '--') {
        tokenBuffer.push(...this.stringToBytes(`     Note: ${item.note}\n`));
      }
    });

    this.pushSeparatorLine(tokenBuffer, '-');
    tokenBuffer.push(...this.NEW_LINE);
    tokenBuffer.push(...this.NEW_LINE);
    tokenBuffer.push(...this.CUT);

    const combined = new Uint8Array(billBytes.length + tokenBuffer.length);
    combined.set(billBytes, 0);
    combined.set(tokenBuffer, billBytes.length);
    return combined;
  }

  private static stringToBytes(str: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code === 8377) { // Rupee Symbol ₹
        bytes.push(158); // 0x9E Rupee symbol in standard ESC/POS Indian fonts
      } else if (code > 255) {
        bytes.push(63); // '?'
      } else {
        bytes.push(code);
      }
    }
    return bytes;
  }
}
