"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledWhatsAppReports = exports.aggregatorWebhook = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
function parseEmailContent(recipientEmail, subject, bodyText) {
    const isZomato = /zomato/i.test(subject) || /zomato/i.test(bodyText) || /ZOM-/i.test(subject) || /ZOM-/i.test(bodyText);
    const isSwiggy = /swiggy/i.test(subject) || /swiggy/i.test(bodyText) || /SWIG-/i.test(subject) || /SWIG-/i.test(bodyText);
    if (!isZomato && !isSwiggy) {
        return null;
    }
    const platform = isZomato ? 'ZOMATO' : 'SWIGGY';
    const isCancellation = /cancell?ed|cancell?ation/i.test(subject) ||
        /(?:order|delivery|item).*(?:has\s*been\s*cancell?ed|is\s*cancell?ed)/i.test(bodyText) ||
        /cancellation\s*notice/i.test(bodyText);
    // 1. Order ID
    let orderId = '';
    const idMatch = bodyText.match(/(?:Order\s*#?|Order\s*ID:?\s*|ID:?\s*)([A-Z0-9-]{4,15})/i) ||
        subject.match(/(?:Order\s*#?|Order\s*ID:?\s*)([A-Z0-9-]{4,15})/i);
    if (idMatch && idMatch[1]) {
        orderId = idMatch[1].trim();
    }
    else {
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
    let totalAmount;
    const amountMatch = bodyText.match(/(?:Total|Bill Amount|Grand Total):?\s*(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d{1,2})?)/i);
    if (amountMatch && amountMatch[1]) {
        totalAmount = parseFloat(amountMatch[1]);
    }
    // 5. Items Extraction
    const items = [];
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
app.post('/email-order', async (req, res) => {
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
        let matchedTenantId = null;
        let matchedLocationId = 'loc-primary';
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
        }
        catch (_) { }
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
    }
    catch (error) {
        console.error('Aggregator webhook error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * Server-side email dispatcher proxy for Resend (eliminates browser CORS restrictions)
 */
app.post('/send-email', async (req, res) => {
    try {
        const { from, to, bcc, replyTo, subject, text, html, apiKey } = req.body;
        if (!apiKey) {
            return res.status(400).json({ error: 'Missing Resend API Key' });
        }
        const recipients = Array.isArray(to) ? to : (to ? [to] : []);
        const bccRecipients = Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []);
        if (recipients.length === 0 && bccRecipients.length === 0) {
            return res.status(400).json({ error: 'Missing recipient' });
        }
        const payload = {
            from: from || 'Zentiq POS <onboarding@resend.dev>',
            to: recipients.length > 0 ? recipients : [from || 'onboarding@resend.dev'],
            subject: subject || 'Notification',
            text: text || '',
        };
        if (bccRecipients.length > 0)
            payload.bcc = bccRecipients;
        if (replyTo)
            payload.reply_to = replyTo;
        if (html)
            payload.html = html;
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${String(apiKey).trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({ error: data?.message || data?.error || 'Resend API rejected request', details: data });
        }
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        console.error('Server-side send-email error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
});
exports.aggregatorWebhook = functions.https.onRequest(app);
function cleanPhoneNumber(phone) {
    if (!phone)
        return '';
    let cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+'))
        cleaned = cleaned.substring(1);
    if (cleaned.length === 10)
        cleaned = '91' + cleaned;
    return cleaned;
}
function buildWhatsAppReportText(options) {
    const { tenantName, periodLabel, frequency, summary } = options;
    const now = new Date();
    const timestamp = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} 00:00 AM`;
    const badge = frequency === 'MONTHLY' ? '🗓️ MONTHLY AUDIT' : '☀️ DAILY SALES';
    let msg = `📊 *ZENTIQ POS - AUTOMATED SALES REPORT*\n`;
    msg += `🏷️ *Type:* ${badge} (Auto 12:00 AM Schedule)\n`;
    msg += `🏪 *Store:* ${tenantName}\n`;
    msg += `📅 *Period:* ${periodLabel}\n`;
    msg += `⏰ *Generated:* ${timestamp}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 *Total Sales:* ₹${summary.totalRevenue.toFixed(2)}\n`;
    msg += `🧾 *Completed Orders:* ${summary.totalOrders}\n`;
    msg += `📈 *Avg Order Value:* ₹${summary.avgOrderValue.toFixed(2)}\n\n`;
    msg += `💳 *Tender Breakdown:*\n`;
    if (summary.cashTotal > 0)
        msg += `• 💵 *Cash:* ₹${summary.cashTotal.toFixed(2)} (${summary.cashCount} parts)\n`;
    if (summary.upiTotal > 0)
        msg += `• 📱 *UPI:* ₹${summary.upiTotal.toFixed(2)} (${summary.upiCount} parts)\n`;
    if (summary.cardTotal > 0)
        msg += `• 💳 *Card:* ₹${summary.cardTotal.toFixed(2)} (${summary.cardCount} parts)\n`;
    if (summary.cashTotal === 0 && summary.upiTotal === 0 && summary.cardTotal === 0) {
        msg += `• No recorded collections\n`;
    }
    msg += `\n`;
    if (summary.topItems.length > 0) {
        msg += `⭐ *Top Selling Items:*\n`;
        summary.topItems.forEach((it, idx) => {
            msg += `${idx + 1}. *${it.name}* - ${it.qty} sold (₹${it.revenue.toFixed(0)})\n`;
        });
        msg += `\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✨ _Automated via Zentiq POS Server (12:00 AM Auto-Report)_`;
    return msg;
}
exports.scheduledWhatsAppReports = functions.pubsub
    .schedule('0 0 * * *')
    .timeZone('Asia/Kolkata')
    .onRun(async (context) => {
    console.log('⏰ Starting 12:00 AM Automated WhatsApp Sales Report run (Asia/Kolkata)...');
    const now = new Date();
    const isFirstDayOfMonth = now.getDate() === 1;
    // Yesterday Date Range for DAILY reports
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    const yesterdayDateStr = `${yesterdayStart.getDate().toString().padStart(2, '0')}/${(yesterdayStart.getMonth() + 1).toString().padStart(2, '0')}/${yesterdayStart.getFullYear()}`;
    // Last Month Date Range for MONTHLY reports
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const prevMonthName = `${monthNames[prevMonthStart.getMonth()]} ${prevMonthStart.getFullYear()}`;
    try {
        const tenantsSnap = await db.collection('tenants').where('status', '==', 'ACTIVE').get();
        console.log(`Found ${tenantsSnap.size} active tenants.`);
        for (const tenantDoc of tenantsSnap.docs) {
            const tenantId = tenantDoc.id;
            const tenantData = tenantDoc.data();
            // 1. Check Branding & Feature config
            const brandSnap = await db.collection('tenants').doc(tenantId).collection('branding').doc('config').get();
            const brandData = brandSnap.exists ? brandSnap.data() : {};
            const featSnap = await db.collection('tenants').doc(tenantId).collection('features').doc('config').get();
            const featData = featSnap.exists ? featSnap.data() : {};
            const isEnabled = brandData?.whatsappReportsEnabled === true || featData?.whatsappReportsEnabled === true;
            if (!isEnabled) {
                continue;
            }
            const frequency = (brandData?.whatsappReportFrequency || featData?.whatsappReportFrequency || 'DAILY') === 'MONTHLY'
                ? 'MONTHLY'
                : 'DAILY';
            // If MONTHLY schedule, only run on 1st day of month
            if (frequency === 'MONTHLY' && !isFirstDayOfMonth) {
                continue;
            }
            const businessName = brandData?.displayName || brandData?.businessName || tenantData.displayName || tenantData.businessName || 'Restaurant';
            // Determine targets & date boundaries
            const periodLabel = frequency === 'MONTHLY' ? `Month of ${prevMonthName}` : `Yesterday (${yesterdayDateStr})`;
            const startDate = frequency === 'MONTHLY' ? prevMonthStart : yesterdayStart;
            const endDate = frequency === 'MONTHLY' ? prevMonthEnd : yesterdayEnd;
            // 2. Aggregate orders across branches
            const locsSnap = await db.collection('tenants').doc(tenantId).collection('locations').get();
            const allOrders = [];
            for (const locDoc of locsSnap.docs) {
                const ordersSnap = await db
                    .collection('tenants')
                    .doc(tenantId)
                    .collection('locations')
                    .doc(locDoc.id)
                    .collection('orders')
                    .where('status', 'in', ['COMPLETED', 'PAID', 'SERVED', 'RUNNING'])
                    .get();
                ordersSnap.forEach(oDoc => {
                    const o = oDoc.data();
                    let oTime = null;
                    if (o.createdAt?.toMillis)
                        oTime = o.createdAt.toMillis();
                    else if (o.createdAt instanceof Date)
                        oTime = o.createdAt.getTime();
                    else if (typeof o.createdAt === 'string')
                        oTime = new Date(o.createdAt).getTime();
                    if (oTime && oTime >= startDate.getTime() && oTime <= endDate.getTime()) {
                        allOrders.push(o);
                    }
                });
            }
            // 3. Compute Metrics
            const totalOrders = allOrders.length;
            const totalRevenue = allOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            let cashTotal = 0;
            let cashCount = 0;
            let upiTotal = 0;
            let upiCount = 0;
            let cardTotal = 0;
            let cardCount = 0;
            allOrders.forEach(o => {
                if (o.payments && Array.isArray(o.payments) && o.payments.length > 0) {
                    o.payments.forEach((p) => {
                        const m = String(p.method || '').toUpperCase();
                        const amt = Number(p.amount) || 0;
                        if (m.includes('CASH')) {
                            cashTotal += amt;
                            cashCount++;
                        }
                        else if (m.includes('UPI')) {
                            upiTotal += amt;
                            upiCount++;
                        }
                        else if (m.includes('CARD')) {
                            cardTotal += amt;
                            cardCount++;
                        }
                    });
                }
                else {
                    const m = String(o.paymentMethod || 'CASH').toUpperCase();
                    const amt = Number(o.totalAmount) || 0;
                    if (m.includes('CASH')) {
                        cashTotal += amt;
                        cashCount++;
                    }
                    else if (m.includes('UPI')) {
                        upiTotal += amt;
                        upiCount++;
                    }
                    else if (m.includes('CARD')) {
                        cardTotal += amt;
                        cardCount++;
                    }
                }
            });
            // Top items
            const itemMap = new Map();
            allOrders.forEach(o => {
                if (o.items && Array.isArray(o.items)) {
                    o.items.forEach((it) => {
                        const name = String(it.itemName || it.name || 'Item').trim();
                        const qty = Number(it.qty) || 1;
                        const price = Number(it.price) || 0;
                        const curr = itemMap.get(name) || { qty: 0, revenue: 0 };
                        itemMap.set(name, { qty: curr.qty + qty, revenue: curr.revenue + (price * qty) });
                    });
                }
            });
            const topItems = Array.from(itemMap.entries())
                .sort((a, b) => b[1].qty - a[1].qty)
                .slice(0, 5)
                .map(([name, d]) => ({ name, qty: d.qty, revenue: d.revenue }));
            // 4. Build Report Text
            const reportText = buildWhatsAppReportText({
                tenantName: businessName,
                periodLabel,
                frequency,
                summary: {
                    totalRevenue,
                    totalOrders,
                    avgOrderValue,
                    cashTotal,
                    cashCount,
                    upiTotal,
                    upiCount,
                    cardTotal,
                    cardCount,
                    topItems,
                },
            });
            // 5. Parse recipient phone numbers (comma-separated support)
            const rawPhones = brandData?.whatsappReportsPhone || featData?.whatsappReportsPhone || tenantData.adminUsername || tenantData.phone || '';
            const recipientList = rawPhones
                .split(/[,;]/)
                .map((p) => cleanPhoneNumber(p.trim()))
                .filter((p) => p.length >= 10);
            const dispatchId = `dispatch-${frequency.toLowerCase()}-${Date.now()}`;
            const dispatchRecord = {
                id: dispatchId,
                tenantId,
                frequency,
                periodLabel,
                reportText,
                recipientPhones: recipientList,
                senderPhone: cleanPhoneNumber(brandData?.whatsappSenderPhone || tenantData.whatsappSenderPhone || ''),
                metrics: {
                    totalRevenue,
                    totalOrders,
                    avgOrderValue,
                },
                scheduledAt: '12:00 AM',
                status: 'PROCESSED',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            // 6. Save in tenant dispatches
            await db
                .collection('tenants')
                .doc(tenantId)
                .collection('whatsapp_dispatches')
                .doc(dispatchId)
                .set(dispatchRecord);
            // 7. Store in POS notifications
            await db
                .collection('tenants')
                .doc(tenantId)
                .collection('notifications')
                .doc(dispatchId)
                .set({
                title: `🌙 12:00 AM WhatsApp ${frequency === 'MONTHLY' ? 'Monthly' : 'Daily'} Report Generated`,
                message: `Sales summary for ${periodLabel}: ₹${totalRevenue.toFixed(0)} (${totalOrders} orders) scheduled for ${recipientList.length} recipients.`,
                type: 'WHATSAPP_REPORT',
                data: dispatchRecord,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`✅ Dispatched 12:00 AM WhatsApp ${frequency} report for tenant "${businessName}" (${recipientList.length} numbers).`);
        }
        console.log('🏁 12:00 AM Automated WhatsApp Sales Report run completed successfully.');
        return null;
    }
    catch (err) {
        console.error('Error during scheduled WhatsApp report dispatch:', err);
        return null;
    }
});
//# sourceMappingURL=index.js.map