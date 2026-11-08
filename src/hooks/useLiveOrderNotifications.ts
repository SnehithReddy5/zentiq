import { useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from '../store/tenant.store';
import { usePrinterStore } from '../store/printer.store';
import { toast } from '../utils/toast';
import { ChimeService } from '../services/sound/chime.service';
import { ESCPOSService } from '../services/printer/escpos.service';
import { printerService } from '../services/printer/printer.service';
import { DBServices } from '../services/firebase/db';

// Module-level singletons persist across screen transitions and navigations
const alertedBillOrderIds = new Set<string>();
const printedItemCounts = new Map<string, number>();
const roundCounts = new Map<string, number>();
const inFlightPrints = new Set<string>();

export const useLiveOrderNotifications = (onPrintBill?: (order: any) => void) => {
  const { tenant, activeLocationId } = useTenantStore();

  // Dynamically resolve kitchen printer target with reliable fallback to main billing printer
  const resolveKitchenPrinter = () => {
    const settings = usePrinterStore.getState().settings;

    // 1. Check if dedicated kitchen printer is explicitly configured
    const hasDedicatedKitchenPrinter =
      (settings.kitchenPrinterType === 'USB' && !!settings.kitchenPrinterName) ||
      (settings.kitchenPrinterType === 'LAN' && !!settings.kitchenIpAddress?.trim());

    if (hasDedicatedKitchenPrinter) {
      const isKitchenUsb = settings.kitchenPrinterType === 'USB';
      const kitchenTarget = isKitchenUsb
        ? settings.kitchenPrinterName!
        : settings.kitchenIpAddress?.trim()!;
      const kitchenPort = Number(settings.kitchenPort || 9100);
      const kitchenType: 'LAN' | 'USB' = isKitchenUsb ? 'USB' : 'LAN';
      return { kitchenTarget, kitchenPort, kitchenType };
    }

    // 2. Reliable Fallback to Main Billing Printer (LAN or USB)
    const isMainUsb = settings.printerType === 'USB';
    const kitchenTarget = isMainUsb
      ? (settings.printerName || 'POS-80')
      : (settings.ipAddress?.trim() || '');
    const kitchenPort = Number(settings.port || 9100);
    const kitchenType: 'LAN' | 'USB' = isMainUsb ? 'USB' : 'LAN';
    return { kitchenTarget, kitchenPort, kitchenType };
  };

  // Helper to reliably print KOT slip through the mutex print queue
  const printKOTSlip = async (orderId: string, kotNo: any, tableNo: any, items: any[], roundTitle?: string) => {
    if (!items || items.length === 0) return;

    const printKey = `${orderId}_${items.length}_${roundTitle || 'kot'}`;
    if (inFlightPrints.has(printKey)) return;
    inFlightPrints.add(printKey);

    const { kitchenTarget, kitchenPort, kitchenType } = resolveKitchenPrinter();
    if (!kitchenTarget) {
      console.log('Kitchen print skipped: No printer IP/USB name configured in settings.');
      inFlightPrints.delete(printKey);
      return;
    }

    try {
      const kotBuffer = ESCPOSService.buildKOT(
        kotNo || 'QR',
        tableNo || 0,
        'Customer QR',
        items,
        roundTitle || 'QR Self-Order',
        'DINE_IN'
      );

      // Direct, safe print via serialized printerService queue
      await printerService.printReceiptOrKOT(
        kotBuffer,
        kitchenTarget,
        kitchenPort,
        kitchenType
      );

      toast.success(`Kitchen KOT printed for Table ${tableNo}!`, 'KOT Printed');

      // Update Firestore permanently so this order will not be re-printed on reload/navigation
      if (orderId && tenant?.id && activeLocationId) {
        DBServices.updateOrder(
          orderId,
          {
            kotPrinted: true,
            hasNewQRItems: false,
            kotPrintedAt: new Date(),
          },
          tenant.id,
          activeLocationId
        ).catch(() => {});
      }
    } catch (e: any) {
      console.warn('Auto Kitchen KOT build/dispatch error:', e?.message);
    } finally {
      // Keep lock for 2 seconds to prevent rapid duplicate triggers
      setTimeout(() => inFlightPrints.delete(printKey), 2000);
    }
  };

  const processIncomingOrder = (order: any) => {
    const orderItems = order.items || [];
    const isQROrder =
      order.orderSource === 'QR_SELF_ORDER' ||
      order.captainId === 'qr-self' ||
      order.hasNewQRItems === true ||
      (typeof order.orderSource === 'string' && order.orderSource.includes('QR')) ||
      orderItems.some((it: any) => it.sentToKitchen === false);

    // 1. Synchronize live running order items into the local Table Cart store
    if (order.tableNo !== undefined && order.tableNo !== null && orderItems.length > 0) {
      try {
        const { useCartStore } = require('../store/cart.store');
        const tableNum = Number(order.tableNo);
        const formatted = orderItems.map((it: any, idx: number) => ({
          itemId: it.itemId || it.id || `item-${idx}`,
          itemName: it.itemName || it.name,
          price: Number(it.price || 0),
          qty: Number(it.qty || 1),
          sentQty: Number(it.sentQty ?? it.qty ?? 1),
          variantId: it.variantId || null,
          variantName: it.variantName || null,
          note: it.note || '',
        }));
        useCartStore.getState().syncRunningOrderItems(tableNum, formatted);
      } catch (syncErr) {
        console.warn('Failed to sync running order items into cart store:', syncErr);
      }
    }

    // 2. Bill Request Alert (Customer requested bill from table QR)
    if (order.billRequested && !alertedBillOrderIds.has(order.id)) {
      alertedBillOrderIds.add(order.id);
      ChimeService.playBillChime();
      toast.warning(
        `Table ${order.tableNo} requested bill! Review items and print bill from POS.`,
        `🛎️ Table ${order.tableNo} Requested Bill!`,
        8000
      );
    }

    if (!isQROrder) return;

    // 3. New QR Order needing Kitchen KOT print:
    // If order has NOT been printed yet (kotPrinted !== true), print Round 1 immediately!
    const isUnprinted = order.kotPrinted !== true;
    const previousItemCount = printedItemCounts.get(order.id) || 0;
    const hasMoreItems = orderItems.length > previousItemCount;

    if (isUnprinted && !printedItemCounts.has(order.id)) {
      printedItemCounts.set(order.id, orderItems.length);
      roundCounts.set(order.id, 1);

      ChimeService.playOrderChime();
      toast.info(
        `Table ${order.tableNo} placed self-order for ${orderItems.length} items (₹${order.totalAmount || 0}).`,
        `🍳 New QR Order: Table ${order.tableNo}`
      );

      printKOTSlip(
        order.id,
        order.kotNo || order.orderNumber || order.id.slice(0, 5),
        order.tableNo || 0,
        orderItems,
        'QR Self-Order (Round 1)'
      );
      return;
    }

    // 4. Multi-Round Additional Items Ordered via QR (Round 2, 3, etc.)
    if (hasMoreItems || order.hasNewQRItems === true) {
      if (orderItems.length > previousItemCount) {
        const newItems = orderItems.slice(previousItemCount);
        printedItemCounts.set(order.id, orderItems.length);

        const nextRound = (roundCounts.get(order.id) || 1) + 1;
        roundCounts.set(order.id, nextRound);

        ChimeService.playOrderChime();
        toast.info(
          `Table ${order.tableNo} added ${newItems.length} more item(s) (Round ${nextRound})!`,
          `🍳 Table ${order.tableNo} (Round ${nextRound})`
        );

        printKOTSlip(
          order.id,
          order.kotNo || order.orderNumber || order.id.slice(0, 5),
          order.tableNo || 0,
          newItems,
          `QR Self-Order (Round ${nextRound})`
        );
      }
    } else {
      // Record item count so later updates only trigger for new items
      if (!printedItemCounts.has(order.id)) {
        printedItemCounts.set(order.id, orderItems.length);
      }
    }
  };

  useEffect(() => {
    if (!tenant?.id || !activeLocationId) return;

    const ordersCol = collection(
      db,
      'tenants',
      tenant.id,
      'locations',
      activeLocationId,
      'orders'
    );
    // Support both uppercase 'RUNNING' and lowercase 'running'
    const q = query(ordersCol, where('status', 'in', ['RUNNING', 'running']));

    // 1. Real-time Firestore onSnapshot listener
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const order = { id: change.doc.id, ...change.doc.data() } as any;
          processIncomingOrder(order);
        });
      },
      (error) => {
        console.warn('Live order notification listener error:', error);
      }
    );

    // 2. Active 4-second polling check as a fallback against background browser tab throttling
    const pollInterval = setInterval(async () => {
      try {
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const ord = { id: d.id, ...d.data() } as any;
          if (ord.kotPrinted !== true || ord.hasNewQRItems === true) {
            processIncomingOrder(ord);
          }
        });
      } catch (_) {}
    }, 4000);

    // 3. Immediate check whenever user switches back to or focuses the POS app
    const handleFocus = async () => {
      try {
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const ord = { id: d.id, ...d.data() } as any;
          if (ord.kotPrinted !== true || ord.hasNewQRItems === true) {
            processIncomingOrder(ord);
          }
        });
      } catch (_) {}
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleFocus);
    }

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleFocus);
      }
    };
  }, [tenant?.id, activeLocationId]);
};
