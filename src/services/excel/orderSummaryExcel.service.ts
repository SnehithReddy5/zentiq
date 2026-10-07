import { getItemDisplayName, getBaseItemName } from '../../utils/itemDisplay';
import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Order } from '../../types/order.types';

export interface OrderSummaryExportOptions {
  orders: Order[];
  tenantName?: string;
  locationName?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  periodLabel: string;
}

export class OrderSummaryExcelService {
  /**
   * Safe parser for Firestore timestamp, ISO string, or number
   */
  static parseOrderDate(rawDate: any): Date {
    if (!rawDate) return new Date();
    if (typeof rawDate.toDate === 'function') {
      try { return rawDate.toDate(); } catch (e) { /* fallback */ }
    }
    if (rawDate.seconds) {
      return new Date(rawDate.seconds * 1000);
    }
    if (typeof rawDate === 'string' || typeof rawDate === 'number') {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) return d;
    }
    if (rawDate instanceof Date) return rawDate;
    return new Date();
  }

  /**
   * Format date as YYYY-MM-DD HH:mm:ss
   */
  static formatDateTime(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }

  /**
   * Generate and trigger download of Vasudha Order Summary Excel sheet
   */
  static async exportOrderSummary(options: OrderSummaryExportOptions): Promise<{ count: number; filename: string }> {
    const { orders, tenantName = 'Vasudha Restaurant', locationName = 'Main Branch', startDate, endDate, periodLabel } = options;

    // Filter orders by date range if provided
    const filteredOrders = orders.filter((o) => {
      const oDate = this.parseOrderDate(o.createdAt);
      if (startDate && oDate < startDate) return false;
      if (endDate && oDate > endDate) return false;
      return true;
    });

    if (filteredOrders.length === 0) {
      throw new Error('No orders found for the selected date range.');
    }

    // Sort chronologically (oldest to newest)
    const sortedOrders = [...filteredOrders].sort((a, b) => {
      return this.parseOrderDate(a.createdAt).getTime() - this.parseOrderDate(b.createdAt).getTime();
    });

    // Find highest and lowest orders by totalAmount
    let highestIndex = -1;
    let lowestIndex = -1;
    let highestAmount = -Infinity;
    let lowestAmount = Infinity;

    sortedOrders.forEach((o, idx) => {
      const amt = Number(o.totalAmount) || 0;
      if (amt > highestAmount) {
        highestAmount = amt;
        highestIndex = idx;
      }
      if (amt < lowestAmount) {
        lowestAmount = amt;
        lowestIndex = idx;
      }
    });

    const totalRevenue = sortedOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const avgOrder = totalRevenue / sortedOrders.length;

    // Payment Methods Aggregation
    let cashTotal = 0;
    let upiTotal = 0;
    let cardTotal = 0;
    let otherTotal = 0;

    // Item Frequency Aggregation
    const itemFreqMap: Record<string, { itemName: string; variantName: string; qty: number; orderCount: number; totalSales: number }> = {};

    sortedOrders.forEach((o) => {
      // Payment collection
      if (o.payments && Array.isArray(o.payments) && o.payments.length > 0) {
        o.payments.forEach((p: any) => {
          const m = String(p.method || 'CASH').toUpperCase();
          const amt = Number(p.amount) || 0;
          if (m === 'CASH') cashTotal += amt;
          else if (m === 'UPI') upiTotal += amt;
          else if (m === 'CARD') cardTotal += amt;
          else otherTotal += amt;
        });
      } else {
        const m = String(o.paymentMethod || 'CASH').toUpperCase();
        const amt = Number(o.totalAmount) || 0;
        if (m === 'CASH') cashTotal += amt;
        else if (m === 'UPI') upiTotal += amt;
        else if (m === 'CARD') cardTotal += amt;
        else otherTotal += amt;
      }

      // Item frequency
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((it: any) => {
          const baseName = getBaseItemName(it.itemName || it.name || 'Item', it.variantName);
          const variant = it.variantName ? String(it.variantName).trim() : '';
          const key = getItemDisplayName(baseName, variant);
          const q = Number(it.qty) || 1;
          const price = Number(it.price) || 0;

          if (!itemFreqMap[key]) {
            itemFreqMap[key] = { itemName: baseName, variantName: variant, qty: 0, orderCount: 0, totalSales: 0 };
          }
          itemFreqMap[key].qty += q;
          itemFreqMap[key].orderCount += 1;
          itemFreqMap[key].totalSales += q * price;
        });
      }
    });

    const sortedItems = Object.values(itemFreqMap).sort((a, b) => b.qty - a.qty);

    // Build worksheet data (AOA)
    const sheetData: any[][] = [];

    // Header Banner
    sheetData.push([`${tenantName.toUpperCase()} - ORDER SUMMARY REPORT`]);
    sheetData.push([`Branch: ${locationName} | Filter Period: ${periodLabel}`]);
    sheetData.push([`Generated On: ${this.formatDateTime(new Date())}`]);
    sheetData.push([]); // blank

    // KPI Summary Section
    sheetData.push(['--- SALES SUMMARY & KEY METRICS ---']);
    sheetData.push(['Total Completed Orders', sortedOrders.length]);
    sheetData.push(['Total Sales Revenue', `INR ${totalRevenue.toFixed(2)}`]);
    sheetData.push(['Average Order Value', `INR ${avgOrder.toFixed(2)}`]);
    if (highestIndex >= 0) {
      const hOrder = sortedOrders[highestIndex];
      const hLabel = hOrder.orderNumber ? `Bill #${hOrder.orderNumber}` : `KOT #${hOrder.kotNo}`;
      sheetData.push(['Highest Sale Order (Peak 🟢)', `${hLabel} - INR ${highestAmount.toFixed(2)}`]);
    }
    if (lowestIndex >= 0) {
      const lOrder = sortedOrders[lowestIndex];
      const lLabel = lOrder.orderNumber ? `Bill #${lOrder.orderNumber}` : `KOT #${lOrder.kotNo}`;
      sheetData.push(['Lowest Sale Order (Min 🔴)', `${lLabel} - INR ${lowestAmount.toFixed(2)}`]);
    }
    sheetData.push([]);

    // Payment Methods Breakdown Section
    sheetData.push(['--- PAYMENT METHODS BREAKDOWN ---']);
    sheetData.push(['Cash Collections', `INR ${cashTotal.toFixed(2)}`]);
    sheetData.push(['UPI / QR Collections', `INR ${upiTotal.toFixed(2)}`]);
    if (cardTotal > 0) {
      sheetData.push(['Card Collections', `INR ${cardTotal.toFixed(2)}`]);
    }
    if (otherTotal > 0) {
      sheetData.push(['Other / Custom Tender Collections', `INR ${otherTotal.toFixed(2)}`]);
    }
    sheetData.push(['Total Collected', `INR ${(cashTotal + upiTotal + cardTotal + otherTotal).toFixed(2)}`]);
    sheetData.push([]); // blank

    // Top Selling Items Section (Top 10 by Frequency & Sales)
    sheetData.push(['--- TOP SELLING ITEMS (BY FREQUENCY / QUANTITY) ---']);
    sheetData.push(['Rank', 'Item Name', 'Variant / Portion', 'Quantity Sold', 'Revenue Generated']);
    const topItemsSlice = sortedItems.slice(0, 10);
    if (topItemsSlice.length === 0) {
      sheetData.push(['-', 'No items sold', '-', '0 portions', 'INR 0.00']);
    } else {
      topItemsSlice.forEach((it, idx) => {
        sheetData.push([
          `#${idx + 1}`,
          it.itemName,
          it.variantName || 'Standard',
          `${it.qty} portions`,
          `INR ${it.totalSales.toFixed(2)}`
        ]);
      });
    }
    sheetData.push([]); // blank

    // Table Column Headers
    sheetData.push([
      'S.No',
      'Date & Time',
      'Bill #',
      'KOT #',
      'Order Type',
      'Table #',
      'Cashier / Captain',
      'Items Ordered (Qty)',
      'Payment Mode',
      'Subtotal (₹)',
      'Taxes (₹)',
      'Total Amount (₹)',
      'Peak Indicator'
    ]);

    // Table Data Rows
    sortedOrders.forEach((o, idx) => {
      const oDate = this.parseOrderDate(o.createdAt);
      const itemsList = (o.items || [])
        .map((i) => `${i.itemName || 'Item'} (x${i.qty || 1})`)
        .join(', ');

      const billNo = o.orderNumber ? `#${o.orderNumber}` : (o.id ? `#${o.id.slice(0, 6).toUpperCase()}` : '-');
      const kotNo = o.kotNo ? `KOT-${o.kotNo}` : '-';
      const orderType = (o.orderType || 'Dine-In').toUpperCase();
      const table = o.tableNo ? `Table ${o.tableNo}` : '-';
      const cashier = o.captainName || 'Staff';

      let payMode = 'CASH';
      if (o.payments && o.payments.length > 0) {
        payMode = o.payments.map((p: any) => p.method).join(' + ');
      } else if (o.paymentMethod) {
        payMode = String(o.paymentMethod).toUpperCase();
      }

      const totalAmt = Number(o.totalAmount) || 0;
      const subtotal = totalAmt > 0 ? (totalAmt / 1.05) : 0;
      const taxes = totalAmt - subtotal;

      let indicator = '';
      if (idx === highestIndex) {
        indicator = '🟢 HIGHEST SALE (PEAK)';
      } else if (idx === lowestIndex) {
        indicator = '🔴 LOWEST SALE';
      }

      sheetData.push([
        idx + 1,
        this.formatDateTime(oDate),
        billNo,
        kotNo,
        orderType,
        table,
        cashier,
        itemsList,
        payMode,
        Number(subtotal.toFixed(2)),
        Number(taxes.toFixed(2)),
        Number(totalAmt.toFixed(2)),
        indicator
      ]);
    });

    // Create Worksheet & Set Column Widths
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 6 },  // S.No
      { wch: 20 }, // Date & Time
      { wch: 14 }, // Bill #
      { wch: 12 }, // KOT #
      { wch: 12 }, // Order Type
      { wch: 10 }, // Table #
      { wch: 18 }, // Cashier
      { wch: 45 }, // Items Ordered
      { wch: 16 }, // Payment Mode
      { wch: 14 }, // Subtotal
      { wch: 12 }, // Taxes
      { wch: 16 }, // Total Amount
      { wch: 26 }  // Peak Indicator
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Order Summary');

    // Sheet 2: Item Sales Frequency & Quantity
    const itemSheetData: any[][] = [];
    itemSheetData.push([`${tenantName.toUpperCase()} - ITEM SALES FREQUENCY & RANKING REPORT`]);
    itemSheetData.push([`Branch: ${locationName} | Filter Period: ${periodLabel}`]);
    itemSheetData.push([`Generated On: ${this.formatDateTime(new Date())}`]);
    itemSheetData.push([]);
    itemSheetData.push(['Rank', 'Item Name', 'Variant / Portion', 'Quantity Sold (Frequency)', 'Total Orders Appeared In', 'Total Revenue Generated (₹)']);

    sortedItems.forEach((it, idx) => {
      itemSheetData.push([
        idx + 1,
        it.itemName,
        it.variantName || 'Standard',
        it.qty,
        it.orderCount,
        Number(it.totalSales.toFixed(2))
      ]);
    });

    const wsItems = XLSX.utils.aoa_to_sheet(itemSheetData);
    wsItems['!cols'] = [
      { wch: 8 },  // Rank
      { wch: 32 }, // Item Name
      { wch: 20 }, // Variant
      { wch: 26 }, // Quantity Sold
      { wch: 26 }, // Total Orders Appeared In
      { wch: 28 }  // Total Revenue
    ];
    XLSX.utils.book_append_sheet(wb, wsItems, 'Item Sales Frequency');

    const cleanTenant = (tenantName || 'Vasudha').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanPeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${cleanTenant}_Order_Summary_${cleanPeriod}.xlsx`;

    // Download / Save Handling
    if (Platform.OS === 'web' || (typeof window !== 'undefined' && (window as any).document)) {
      const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      // Native Mobile (Android / iOS)
      const base64Data = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Vasudha Order Summary Excel',
          UTI: 'com.microsoft.excel.xlsx',
        });
      }
    }

    return { count: sortedOrders.length, filename };
  }
}
