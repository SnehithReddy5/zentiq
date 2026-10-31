import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

interface ParsedAggregatorOrder {
  restaurantEmail: string;
  aggregatorPlatform: 'ZOMATO' | 'SWIGGY';
  aggregatorOrderId: string;
  isCancellation?: boolean;
  cancellationReason?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryRiderName?: string;
  deliveryRiderPhone?: string;
  items: Array<{ itemName: string; qty: number; price: number; note?: string }>;
  totalAmount?: number;
  specialNote?: string;
}

function parseEmailContent(recipientEmail: string, subject: string, bodyText: string): ParsedAggregatorOrder | null {
  const isZomato = /zomato/i.test(subject) || /zomato/i.test(bodyText) || /ZOM-/i.test(subject) || /ZOM-/i.test(bodyText);
  const isSwiggy = /swiggy/i.test(subject) || /swiggy/i.test(bodyText) || /SWIG-/i.test(subject) || /SWIG-/i.test(bodyText);

  if (!isZomato && !isSwiggy) {
    return null;
  }

  const platform: 'ZOMATO' | 'SWIGGY' = isZomato ? 'ZOMATO' : 'SWIGGY';

  const isCancellation = /cancell?ed|cancell?ation/i.test(subject) ||
    /(?:order|delivery|item).*(?:has\s*been\s*cancell?ed|is\s*cancell?ed)/i.test(bodyText) ||
    /cancellation\s*notice/i.test(bodyText);

  // 1. Order ID
  let orderId = '';
  const idMatch = bodyText.match(/(?:Order\s*#?|Order\s*ID:?\s*|ID:?\s*)([A-Z0-9-]{4,15})/i) ||
                  subject.match(/(?:Order\s*#?|Order\s*ID:?\s*)([A-Z0-9-]{4,15})/i);
  if (idMatch && idMatch[1]) {
    orderId = idMatch[1].trim();
  } else {
    orderId = (platform === 'ZOMATO' ? 'ZOM-' : 'SWIG-') + Math.floor(1000 + Math.random() * 9000);
  }

  // 2. Customer
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

  // 3. Delivery Rider
  let riderName = platform === 'ZOMATO' ? 'Zomato Delivery Valet' : 'Swiggy Delivery Partner';
  let riderPhone = '';
  const riderMatch = bodyText.match(/(?:Rider|Valet|Delivery Partner):?\s*([^\n\r,]+)/i);
  if (riderMatch && riderMatch[1]) {
    riderName = riderMatch[1].trim();
  }

  // 4. Total Amount
  let totalAmount: number | undefined;
  const amountMatch = bodyText.match(/(?:Total|Bill Amount|Grand Total):?\s*(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d{1,2})?)/i);
  if (amountMatch && amountMatch[1]) {
    totalAmount = parseFloat(amountMatch[1]);
  }

  // 5. Items Extraction
  const items: Array<{ itemName: string; qty: number; price: number; note?: string }> = [];
  const lines = bodyText.split(/\r?\n/);
  for (const line of lines) {
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

  if (items.length === 0) {
    items.push({
      itemName: `${platform} Online Meal`,
      qty: 1,
      price: totalAmount || 250,
      note: 'Auto-imported from notification email'
    });
  }

  return {
    restaurantEmail: recipientEmail.trim().toLowerCase(),
    aggregatorPlatform: platform,
    aggregatorOrderId: orderId,
    isCancellation,
    cancellationReason: isCancellation ? `Cancelled by ${platform} (${subject.slice(0, 40)})` : undefined,
    customerName,
    customerPhone,
    deliveryRiderName: riderName,
    deliveryRiderPhone: riderPhone,
    items,
    totalAmount,
    specialNote: `Auto-ingested from ${platform} email`,
  };
}

/**
 * Webhook endpoint for inbound email parsers (CloudMailin, SendGrid, Mailgun)
 */
app.post('/email-order', async (req: express.Request, res: express.Response) => {
  try {
    const payload = req.body || {};
    
    // Support multiple inbound email parser formats (CloudMailin, SendGrid, Mailgun)
    const recipient = payload.to || (payload.envelope && payload.envelope.to) || payload.recipient || '';
    const subject = payload.subject || (payload.headers && payload.headers.Subject) || '';
    const bodyText = payload.plain || payload.text || payload.html || payload['body-plain'] || '';

    if (!bodyText && !subject) {
      return res.status(400).json({ error: 'Missing email subject or body text' });
    }

    const parsedOrder = parseEmailContent(recipient, subject, bodyText);
    if (!parsedOrder) {
      return res.status(200).json({ status: 'ignored', message: 'Email does not match Zomato or Swiggy patterns' });
    }

    // 1. Locate tenant by restaurant email
    let matchedTenantId: string | null = null;
    let matchedLocationId: string = 'loc-primary';
    let businessName = 'Restaurant';

    const cleanEmail = parsedOrder.restaurantEmail.trim().toLowerCase();
    const tenantsSnap = await db.collection('tenants').get();

    for (const tDoc of tenantsSnap.docs) {
      const tData = tDoc.data();
      const tEmail = (tData.email || tData.adminEmail || '').trim().toLowerCase();
      if (tEmail === cleanEmail) {
        matchedTenantId = tDoc.id;
        businessName = tData.displayName || tData.businessName || tDoc.id;
        break;
      }
    }

    // Fallback: match first active tenant if single-tenant or default
    if (!matchedTenantId && !tenantsSnap.empty) {
      matchedTenantId = tenantsSnap.docs[0].id;
      businessName = tenantsSnap.docs[0].data().displayName || tenantsSnap.docs[0].id;
    }

    if (!matchedTenantId) {
      return res.status(404).json({ error: `No active restaurant tenant found for email ${cleanEmail}` });
    }

    // Find location
    try {
      const locSnap = await db.collection('tenants').doc(matchedTenantId).collection('locations').limit(1).get();
      if (!locSnap.empty) {
        matchedLocationId = locSnap.docs[0].id;
      }
    } catch (_) {}

    // Handle cancellation
    if (parsedOrder.isCancellation) {
      const ordersRef = db.collection('tenants').doc(matchedTenantId).collection('locations').doc(matchedLocationId).collection('orders');
      const cancelQ = await ordersRef.where('aggregatorOrderId', '==', parsedOrder.aggregatorOrderId).limit(1).get();
      if (!cancelQ.empty) {
        const orderDoc = cancelQ.docs[0];
        await orderDoc.ref.update({
          status: 'CANCELLED',
          specialNote: parsedOrder.cancellationReason || `Cancelled by ${parsedOrder.aggregatorPlatform}`,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.status(200).json({ success: true, message: `Marked order #${parsedOrder.aggregatorOrderId} CANCELLED` });
      }
    }

    // Sequence number (KOT)
    const seqRef = db.collection('tenants').doc(matchedTenantId).collection('locations').doc(matchedLocationId).collection('counters').doc('orders');
    const seqSnap = await seqRef.get();
    const kotNo = (seqSnap.exists ? (seqSnap.data()?.lastNumber || 0) : 0) + 1;
    await seqRef.set({ lastNumber: kotNo }, { merge: true });

    const computedTotal = parsedOrder.totalAmount ?? parsedOrder.items.reduce((sum, it) => sum + (it.price * it.qty), 0);

    // Create Order Document in Firestore
    const orderRef = db.collection('tenants').doc(matchedTenantId).collection('locations').doc(matchedLocationId).collection('orders').doc();

    const orderDocData = {
      id: orderRef.id,
      orderNumber: kotNo,
      kotNo,
      orderType: parsedOrder.aggregatorPlatform === 'ZOMATO' ? 'ONLINE_ZOMATO' : 'ONLINE_SWIGGY',
      tableId: null,
      tableNo: 0,
      captainId: 'email-webhook',
      captainName: parsedOrder.aggregatorPlatform === 'ZOMATO' ? 'Zomato Online' : 'Swiggy Online',
      status: 'RUNNING',
      paymentStatus: 'PAID',
      paymentMethod: parsedOrder.aggregatorPlatform === 'ZOMATO' ? 'ZOMATO_PAY' : 'SWIGGY_PAY',
      payments: [
        {
          id: `pay-${Date.now()}`,
          method: parsedOrder.aggregatorPlatform === 'ZOMATO' ? 'ZOMATO_PAY' : 'SWIGGY_PAY',
          amount: computedTotal,
          timestamp: new Date().toISOString(),
          reference: `${parsedOrder.aggregatorPlatform} Paid #${parsedOrder.aggregatorOrderId}`,
        },
      ],
      items: parsedOrder.items.map(it => ({
        itemId: `online-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        itemName: it.itemName,
        qty: it.qty,
        price: it.price,
        note: it.note || ''
      })),
      subtotal: computedTotal,
      totalAmount: computedTotal,
      specialNote: parsedOrder.specialNote || `Online Order from ${parsedOrder.aggregatorPlatform}`,
      aggregatorOrderId: parsedOrder.aggregatorOrderId,
      aggregatorPlatform: parsedOrder.aggregatorPlatform,
      customerName: parsedOrder.customerName || 'Online Diner',
      customerPhone: parsedOrder.customerPhone || '',
      deliveryRiderName: parsedOrder.deliveryRiderName || 'Valet Assigned',
      deliveryRiderPhone: parsedOrder.deliveryRiderPhone || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await orderRef.set(orderDocData);

    return res.status(200).json({
      success: true,
      orderId: orderRef.id,
      kotNo,
      businessName,
      message: `Successfully ingested ${parsedOrder.aggregatorPlatform} Order #${parsedOrder.aggregatorOrderId} into ${businessName} POS!`
    });
  } catch (error: any) {
    console.error('Aggregator webhook error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export const aggregatorWebhook = functions.https.onRequest(app);

