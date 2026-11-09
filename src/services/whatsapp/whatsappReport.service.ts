import { Linking, Platform } from 'react-native';
import { Order } from '../../types/order.types';
import { OrderSummaryExcelService } from '../excel/orderSummaryExcel.service';
import { getBaseItemName } from '../../utils/itemDisplay';
import { toast } from '../../utils/toast';

export interface WhatsAppReportOptions {
  orders: Order[];
  tenantName?: string;
  locationName?: string;
  periodLabel: string;
  phoneNumber?: string;
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export class WhatsAppReportService {
  /**
   * Sanitizes phone number: strips spaces, dashes, parentheses.
   * If 10-digit Indian number, prepends country code 91.
   */
  static cleanPhoneNumber(phone?: string): string {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }
    // If standard 10-digit mobile number, default to India code +91
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }

  /**
   * Builds an attractive, formatted WhatsApp message summary
   */
  static generateReportMessage(options: WhatsAppReportOptions): string {
    const {
      orders,
      tenantName = 'Our Restaurant',
      locationName = 'Main Branch',
      periodLabel,
      frequency = 'DAILY'
    } = options;

    const isCancelled = (o: any) => String(o.status || '').toUpperCase() === 'CANCELLED';
    const validOrders = orders.filter(o => !isCancelled(o));

    const totalOrders = validOrders.length;
    const totalRevenue = validOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Payment Breakdown
    let cashTotal = 0;
    let cashCount = 0;
    let upiTotal = 0;
    let upiCount = 0;
    let cardTotal = 0;
    let cardCount = 0;
    let otherTotal = 0;
    let otherCount = 0;

    validOrders.forEach(o => {
      if (o.payments && Array.isArray(o.payments) && o.payments.length > 0) {
        o.payments.forEach(p => {
          const method = String(p.method || '').toUpperCase();
          const amt = Number(p.amount) || 0;
          if (method.includes('CASH')) {
            cashTotal += amt;
            cashCount++;
          } else if (method.includes('UPI')) {
            upiTotal += amt;
            upiCount++;
          } else if (method.includes('CARD')) {
            cardTotal += amt;
            cardCount++;
          } else {
            otherTotal += amt;
            otherCount++;
          }
        });
      } else {
        const method = String(o.paymentMethod || 'CASH').toUpperCase();
        const amt = Number(o.totalAmount) || 0;
        if (method.includes('CASH')) {
          cashTotal += amt;
          cashCount++;
        } else if (method.includes('UPI')) {
          upiTotal += amt;
          upiCount++;
        } else if (method.includes('CARD')) {
          cardTotal += amt;
          cardCount++;
        } else {
          otherTotal += amt;
          otherCount++;
        }
      }
    });

    // Order Types
    const dineInCount = validOrders.filter(
      o => o.tableNo && o.orderType !== 'PICKUP' && o.orderType !== 'TAKEAWAY' && !o.orderType?.includes('ONLINE')
    ).length;
    const takeawayCount = validOrders.filter(o => o.orderType === 'TAKEAWAY' || o.orderType === 'PICKUP').length;
    const onlineCount = validOrders.filter(
      o => o.orderType === 'ONLINE_ZOMATO' || o.orderType === 'ONLINE_SWIGGY'
    ).length;

    // Top Selling Items (Aggregate by item name)
    const itemMap = new Map<string, { qty: number; revenue: number }>();
    validOrders.forEach(o => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach(it => {
          const name = getBaseItemName(it.itemName || (it as any).name || 'Item');
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          const curr = itemMap.get(name) || { qty: 0, revenue: 0 };
          itemMap.set(name, { qty: curr.qty + qty, revenue: curr.revenue + (price * qty) });
        });
      }
    });

    const topItems = Array.from(itemMap.entries())
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5);

    const now = new Date();
    const formattedTimestamp = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const freqBadge = frequency === 'MONTHLY' ? '🗓️ MONTHLY AUDIT' : frequency === 'WEEKLY' ? '📅 WEEKLY REVIEW' : '☀️ DAILY SALES';

    let msg = `📊 *ZENTIQ POS - SALES REPORT*\n`;
    msg += `🏷️ *Type:* ${freqBadge}\n`;
    msg += `🏪 *Store:* ${tenantName} (${locationName})\n`;
    msg += `📅 *Period:* ${periodLabel}\n`;
    msg += `⏰ *Generated:* ${formattedTimestamp}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `💰 *Total Sales:* ₹${totalRevenue.toFixed(2)}\n`;
    msg += `🧾 *Completed Orders:* ${totalOrders}\n`;
    msg += `📈 *Avg Order Value:* ₹${avgOrderValue.toFixed(2)}\n\n`;

    msg += `💳 *Tender Breakdown:*\n`;
    if (cashTotal > 0) msg += `• 💵 *Cash:* ₹${cashTotal.toFixed(2)} (${cashCount} parts)\n`;
    if (upiTotal > 0) msg += `• 📱 *UPI:* ₹${upiTotal.toFixed(2)} (${upiCount} parts)\n`;
    if (cardTotal > 0) msg += `• 💳 *Card:* ₹${cardTotal.toFixed(2)} (${cardCount} parts)\n`;
    if (otherTotal > 0) msg += `• 🔄 *Other:* ₹${otherTotal.toFixed(2)} (${otherCount} parts)\n`;
    if (cashTotal === 0 && upiTotal === 0 && cardTotal === 0 && otherTotal === 0) {
      msg += `• None recorded\n`;
    }
    msg += `\n`;

    msg += `🍽️ *Order Distribution:*\n`;
    msg += `• 🪑 Dine-In: ${dineInCount} orders\n`;
    msg += `• 🛍️ Takeaway / Pickup: ${takeawayCount} orders\n`;
    if (onlineCount > 0) {
      msg += `• 🛵 Online (Zomato / Swiggy): ${onlineCount} orders\n`;
    }
    msg += `\n`;

    if (topItems.length > 0) {
      msg += `⭐ *Top Selling Items:*\n`;
      topItems.forEach(([name, data], idx) => {
        msg += `${idx + 1}. *${name}* - ${data.qty} sold (₹${data.revenue.toFixed(0)})\n`;
      });
      msg += `\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✨ _Generated automatically via Zentiq POS_`;

    return msg;
  }

  /**
   * Shares report directly via WhatsApp DeepLink / Web URL.
   * 100% FREE with ZERO API costs, zero monthly fees.
   */
  static async shareReport(options: WhatsAppReportOptions): Promise<boolean> {
    try {
      const message = this.generateReportMessage(options);
      const encodedMessage = encodeURIComponent(message);
      const cleanPhone = this.cleanPhoneNumber(options.phoneNumber);

      // WhatsApp URL targets
      const nativeUrl = cleanPhone
        ? `whatsapp://send?phone=${cleanPhone}&text=${encodedMessage}`
        : `whatsapp://send?text=${encodedMessage}`;

      const webUrl = cleanPhone
        ? `https://wa.me/${cleanPhone}?text=${encodedMessage}`
        : `https://wa.me/?text=${encodedMessage}`;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.open(webUrl, '_blank');
          return true;
        }
      }

      // On Android / iOS, try native WhatsApp scheme first, fallback to web wa.me
      const canOpen = await Linking.canOpenURL(nativeUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(nativeUrl);
        return true;
      } else {
        await Linking.openURL(webUrl);
        return true;
      }
    } catch (err: any) {
      console.warn('WhatsApp share error:', err);
      toast.error(`Could not open WhatsApp: ${err.message}`, 'WhatsApp Error');
      return false;
    }
  }
}

