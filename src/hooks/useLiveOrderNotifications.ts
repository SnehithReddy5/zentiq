import { useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from '../store/tenant.store';
import { usePrinterStore } from '../store/printer.store';
import { toast } from '../utils/toast';
import { ChimeService } from '../services/sound/chime.service';
import { ESCPOSService } from '../services/printer/escpos.service';
import { printerService } from '../services/printer/printer.service';

// Module-level singletons persist across component mounts, screen transitions, and navigations.
// This guarantees that switching tabs or screens in the POS app never resets printed item counts,
// which previously caused duplicate Kitchen KOT prints when a customer requested their bill or navigated.
const alertedBillOrderIds = new Set<string>();
const seenOrderIds = new Set<string>();
const printedItemCounts = new Map<string, number>();
const roundCounts = new Map<string, number>();
const syncedLocations = new Set<string>();

export const useLiveOrderNotifications = (onPrintBill?: (order: any) => void) => {
  const { tenant, activeLocationId } = useTenantStore();

  // Dynamically resolve kitchen printer target using latest store settings
  const resolveKitchenPrinter = () => {
    const settings = usePrinterStore.getState().settings;
    const isKitchenUsb = settings.kitchenPrinterType === 'USB';
    const kitchenTarget = isKitchenUsb
      ? (settings.kitchenPrinterName || settings.printerName || 'POS-80')
      : (settings.kitchenIpAddress?.trim() || (settings.printerType === 'LAN' ? settings.ipAddress?.trim() : ''));
    const kitchenPort = Number(settings.kitchenPort || settings.port || 9100);
    const kitchenType: 'LAN' | 'USB' = isKitchenUsb ? 'USB' : 'LAN';
    return { kitchenTarget, kitchenPort, kitchenType };
  };

  // Helper to reliably print KOT slip through the mutex print queue
  // Safe for Android (native TCP socket), Windows (Electron/Bridge), and Web
  const printKOTSlip = async (kotNo: any, tableNo: any, items: any[], roundTitle?: string) => {
    if (!items || items.length === 0) return;

    const { kitchenTarget, kitchenPort, kitchenType } = resolveKitchenPrinter();
    if (!kitchenTarget) {
      console.log('Kitchen print skipped: No printer IP/USB name configured in settings.');
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
    } catch (e: any) {
      console.warn('Auto Kitchen KOT build/dispatch error:', e?.message);
    }
  };

  useEffect(() => {
    if (!tenant?.id || !activeLocationId) return;

    const locationKey = `${tenant.id}_${activeLocationId}`;
    const isFirstLocationLoad = !syncedLocations.has(locationKey);
    let isInitialSnapshot = isFirstLocationLoad;

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

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const order = { id: change.doc.id, ...change.doc.data() } as any;
          const orderItems = order.items || [];
          const isQROrder =
            order.orderSource === 'QR_SELF_ORDER' ||
            order.captainId === 'qr-self' ||
            (typeof order.orderSource === 'string' && order.orderSource.includes('QR'));

          // On first connection to this location, record all existing running orders
          // so we don't spam print historical orders already in progress
          if (isInitialSnapshot) {
            seenOrderIds.add(order.id);
            printedItemCounts.set(order.id, orderItems.length);
            if (order.billRequested) {
              alertedBillOrderIds.add(order.id);
            }
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
              } catch (_) {}
            }
            return;
          }

          // 1. Bill Request Alert (Customer requested bill from table QR - Alert biller/cashier only)
          if (order.billRequested && !alertedBillOrderIds.has(order.id)) {
            alertedBillOrderIds.add(order.id);

            // Play Ding-Dong Bell Alert Sound for Cashier
            ChimeService.playBillChime();

            // Alert Cashier / Biller with Banner
            toast.warning(
              `Table ${order.tableNo} requested bill! Review items and print bill from POS.`,
              `🛎️ Table ${order.tableNo} Requested Bill!`,
              8000
            );
          }

          // 2. New QR Self-Order Arrival Alert & Automated Kitchen KOT Print (Round 1)
          if (
            change.type === 'added' &&
            !seenOrderIds.has(order.id) &&
            isQROrder
          ) {
            seenOrderIds.add(order.id);
            printedItemCounts.set(order.id, orderItems.length);
            roundCounts.set(order.id, 1);

            // Play Loud Kitchen Order Chime
            ChimeService.playOrderChime();

            toast.info(
              `Table ${order.tableNo} placed self-order for ${orderItems.length} items (₹${order.totalAmount || 0}).`,
              `🍳 New QR Order: Table ${order.tableNo}`
            );

            // Dispatch Kitchen KOT immediately via native printer service
            printKOTSlip(
              order.kotNo || order.orderNumber || order.id.slice(0, 5),
              order.tableNo || 0,
              orderItems,
              'QR Self-Order (Round 1)'
            );
          }

          // 3. Multi-Round Additional Items Ordered via QR (Round 2, 3, 4 ... N times)
          if (
            change.type === 'modified' &&
            isQROrder
          ) {
            // If this order wasn't tracked yet, initialize it so an unrelated doc update
            // (such as billRequested, status change, etc.) does NOT cause duplicate prints
            if (!printedItemCounts.has(order.id)) {
              printedItemCounts.set(order.id, orderItems.length);
            } else {
              const previousCount = printedItemCounts.get(order.id) || 0;
              if (orderItems.length > previousCount) {
                const newItems = orderItems.slice(previousCount);
                printedItemCounts.set(order.id, orderItems.length);

                const nextRound = (roundCounts.get(order.id) || 1) + 1;
                roundCounts.set(order.id, nextRound);

                // Play Order Chime
                ChimeService.playOrderChime();

                toast.info(
                  `Table ${order.tableNo} added ${newItems.length} more item(s) (Round ${nextRound})!`,
                  `🍳 Table ${order.tableNo} (Round ${nextRound})`
                );

                // Print ONLY the newly added items on this specific round to the Kitchen Printer
                printKOTSlip(
                  order.kotNo || order.orderNumber || order.id.slice(0, 5),
                  order.tableNo || 0,
                  newItems,
                  `QR Self-Order (Round ${nextRound})`
                );
              }
            }
          }

          // 4. Synchronize live running order items into the local Table Cart store
          // Ensures waiter/cashier terminals instantly reflect items ordered via customer QR
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

          if (change.type === 'added') {
            seenOrderIds.add(order.id);
            if (!printedItemCounts.has(order.id)) {
              printedItemCounts.set(order.id, orderItems.length);
            }
          }
        });

        if (isInitialSnapshot) {
          isInitialSnapshot = false;
          syncedLocations.add(locationKey);
        }
      },
      (error) => {
        console.warn('Live order notification listener error:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [tenant?.id, activeLocationId]);
};
