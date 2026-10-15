import { collection, doc, setDoc, serverTimestamp, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../firebase';

export async function simulateAdminTestOrder(
  tenantId: string,
  platform: 'ZOMATO' | 'SWIGGY' = 'ZOMATO',
  locationId: string = 'loc-primary'
): Promise<{ success: boolean; orderId: string; kotNo: number }> {
  // 1. Get next sequence / KOT number
  let kotNo = Math.floor(100 + Math.random() * 900);
  try {
    const seqRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'settings', 'sequence');
    // If sequence exists, can increment or fallback to random 3-digit
  } catch (_) {}

  const isZomato = platform === 'ZOMATO';
  const randSuffix = Math.floor(1000 + Math.random() * 9000);

  const sampleItems = isZomato
    ? [
        { itemId: 'sim-z1', itemName: 'Special Chicken Dum Biryani', qty: 2, price: 320, note: 'Extra Raita & Salan' },
        { itemId: 'sim-z2', itemName: 'Butter Garlic Naan', qty: 3, price: 55 },
        { itemId: 'sim-z3', itemName: 'Gulab Jamun (2 pcs)', qty: 1, price: 90 },
      ]
    : [
        { itemId: 'sim-s1', itemName: 'Paneer Butter Masala', qty: 1, price: 260, note: 'Medium Spicy' },
        { itemId: 'sim-s2', itemName: 'Jeera Fried Rice', qty: 1, price: 180 },
        { itemId: 'sim-s3', itemName: 'Masala Chaas (Spiced Buttermilk)', qty: 2, price: 40 },
      ];

  const totalAmount = sampleItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const orderRef = doc(collection(db, 'tenants', tenantId, 'locations', locationId, 'orders'));

  const sampleOrder = {
    id: orderRef.id,
    orderNumber: kotNo,
    kotNo,
    tenantId,
    locationId,
    orderType: isZomato ? 'ONLINE_ZOMATO' : 'ONLINE_SWIGGY',
    tableId: null,
    tableNo: 0,
    captainId: 'sim-aggregator',
    captainName: isZomato ? 'Zomato Online' : 'Swiggy Online',
    status: 'RUNNING',
    paymentStatus: 'PAID',
    paymentMethod: 'OTHER',
    payments: [
      {
        id: `pay-sim-${Date.now()}`,
        method: 'OTHER',
        amount: totalAmount,
        timestamp: new Date().toISOString(),
        reference: `${platform} Paid #${isZomato ? 'ZOM-' : 'SWIG-'}${randSuffix}`,
      },
    ],
    items: sampleItems,
    subtotal: totalAmount,
    totalAmount,
    specialNote: isZomato ? "Online Delivery - Please don't ring bell, baby is sleeping" : 'Pack cutlery & extra paper napkins',
    aggregatorOrderId: `${isZomato ? 'ZOM-' : 'SWIG-'}${randSuffix}`,
    aggregatorPlatform: platform,
    customerName: isZomato ? 'Rahul Sharma' : 'Deepika Rao',
    customerPhone: isZomato ? '+91 98765 43210' : '+91 98490 12345',
    deliveryRiderName: isZomato ? 'Suresh Kumar (Zomato Valet)' : 'Mahesh Gowda (Swiggy Rider)',
    deliveryRiderPhone: '+91 91234 56789',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(orderRef, sampleOrder);
  return { success: true, orderId: orderRef.id, kotNo };
}
