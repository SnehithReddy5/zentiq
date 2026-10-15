import { DBServices } from '../firebase/db';

export interface ParsedAggregatorOrder {
  restaurantEmail: string;
  aggregatorPlatform: 'ZOMATO' | 'SWIGGY';
  aggregatorOrderId: string;
  customerName?: string;
  customerPhone?: string;
  deliveryRiderName?: string;
  deliveryRiderPhone?: string;
  items: Array<{ itemName: string; qty: number; price: number; note?: string }>;
  totalAmount?: number;
  specialNote?: string;
}

/**
 * Parses raw Zomato / Swiggy order email content or structured payload
 * and routes it directly to the matching restaurant POS tenant via email.
 */
export class AggregatorParserService {
  /**
   * Parse email content received from Zomato / Swiggy order notifications.
   */
  static parseEmail(recipientEmail: string, subject: string, bodyText: string): ParsedAggregatorOrder | null {
    const isZomato = /zomato/i.test(subject) || /zomato/i.test(bodyText);
    const isSwiggy = /swiggy/i.test(subject) || /swiggy/i.test(bodyText);

    if (!isZomato && !isSwiggy) {
      return null;
    }

    const platform: 'ZOMATO' | 'SWIGGY' = isZomato ? 'ZOMATO' : 'SWIGGY';

    // 1. Extract Order ID
    let orderId = '';
    const idMatch = bodyText.match(/(?:Order\s*#?|Order\s*ID:?\s*|ID:?\s*)([A-Z0-9-]{4,15})/i) ||
                    subject.match(/(?:Order\s*#?|Order\s*ID:?\s*)([A-Z0-9-]{4,15})/i);
    if (idMatch && idMatch[1]) {
      orderId = idMatch[1].trim();
    } else {
      orderId = (platform === 'ZOMATO' ? 'ZOM-' : 'SWIG-') + Math.floor(1000 + Math.random() * 9000);
    }

    // 2. Extract Customer Name & Phone
    let customerName = 'Online Diner';
    let customerPhone = '';
    const custMatch = bodyText.match(/(?:Customer|Diner|Guest):?\s*([^\n\r,]+)/i);
    if (custMatch && custMatch[1]) {
      customerName = custMatch[1].trim();
    }
    const phoneMatch = bodyText.match(/(?:\+91|91|0)?[6-9]\d{9}/);
    if (phoneMatch) {
      customerPhone = phoneMatch[0];
    }

    // 3. Extract Delivery Rider
    let riderName = platform === 'ZOMATO' ? 'Zomato Delivery Valet' : 'Swiggy Delivery Partner';
    let riderPhone = '';
    const riderMatch = bodyText.match(/(?:Rider|Valet|Delivery Partner):?\s*([^\n\r,]+)/i);
    if (riderMatch && riderMatch[1]) {
      riderName = riderMatch[1].trim();
    }

    // 4. Extract Total Amount
    let totalAmount: number | undefined;
    const amountMatch = bodyText.match(/(?:Total|Bill Amount|Grand Total):?\s*(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d{1,2})?)/i);
    if (amountMatch && amountMatch[1]) {
      totalAmount = parseFloat(amountMatch[1]);
    }

    // 5. Extract Items (Sample heuristic for line-by-line items or fallback starter)
    const items: Array<{ itemName: string; qty: number; price: number; note?: string }> = [];
    const lines = bodyText.split(/\r?\n/);
    for (const line of lines) {
      // Matches pattern: "2 x Butter Chicken ₹560" or "1x Paneer Tikka (400)"
      const itemMatch = line.match(/(\d+)\s*x\s*([^₹\d(]+)(?:[₹(]\s*(\d+))?/i);
      if (itemMatch) {
        const qty = parseInt(itemMatch[1], 10) || 1;
        const itemName = itemMatch[2].trim();
        const price = itemMatch[3] ? parseFloat(itemMatch[3]) : 150;
        if (itemName.length > 2 && !itemName.toLowerCase().includes('order')) {
          items.push({ itemName, qty, price });
        }
      }
    }

    // Fallback if regex didn't extract individual item rows
    if (items.length === 0) {
      items.push({
        itemName: `${platform} Online Placed Meal`,
        qty: 1,
        price: totalAmount || 250,
        note: 'Imported from Order Email'
      });
    }

    return {
      restaurantEmail: recipientEmail.trim().toLowerCase(),
      aggregatorPlatform: platform,
      aggregatorOrderId: orderId,
      customerName,
      customerPhone,
      deliveryRiderName: riderName,
      deliveryRiderPhone: riderPhone,
      items,
      totalAmount,
      specialNote: `Auto-ingested from ${platform} email receipt`,
    };
  }

  /**
   * Process and ingest into restaurant POS using the restaurant's registered email
   */
  static async processAndIngest(emailOrder: ParsedAggregatorOrder) {
    return await DBServices.ingestAggregatorOrder(emailOrder);
  }

  /**
   * 1-Click Test Simulation helper for POS or Admin Demo
   */
  static async fireTestOrder(tenantId: string, platform: 'ZOMATO' | 'SWIGGY', locationId?: string) {
    return await DBServices.simulateTestAggregatorOrder(tenantId, platform, locationId);
  }
}
