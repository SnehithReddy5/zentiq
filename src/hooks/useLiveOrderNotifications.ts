import { useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from '../store/tenant.store';
import { usePrinterStore } from '../store/printer.store';
import { toast } from '../utils/toast';
import { ChimeService } from '../services/sound/chime.service';
import { ESCPOSService } from '../services/printer/escpos.service';

/**
 * Fire-and-forget Kitchen KOT print via the local Print Bridge HTTP API.
 * This does NOT touch the shared printerService singleton, so it can never
 * corrupt the billing printer's connection state or cause "timed out" errors
 * on subsequent bill / manual-KOT prints.
 */
const printViaBridge = (
  buffer: Uint8Array,
  printerType: 'LAN' | 'USB',
  target: string,
  port: number
): void => {
  const payload: any = {
    printerType,
    data: Array.from(buffer),
  };
  if (printerType === 'USB') {
    payload.printerName = target;
  } else {
    payload.ip = target;
    payload.port = port;
  }

  // Non-blocking: fire HTTP request to the print bridge; no await, no blocking UI
  fetch('http://127.0.0.1:9123/api/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.warn('QR KOT print bridge error (non-blocking):', err?.message);
  });
};

export const useLiveOrderNotifications = (onPrintBill?: (order: any) => void) => {
  const { tenant, activeLocationId } = useTenantStore();
  const { settings } = usePrinterStore();

  const alertedBillOrderIds = useRef<Set<string>>(new Set());
  const seenOrderIds = useRef<Set<string>>(new Set());
  const printedItemCounts = useRef<Map<string, number>>(new Map());
  const roundCounts = useRef<Map<string, number>>(new Map());
  const isInitialLoad = useRef(true);

    // Resolve kitchen printer target once per render cycle
    const resolveKitchenPrinter = () => {
      const isKitchenUsb = settings.kitchenPrinterType === 'USB';
      const kitchenTarget = isKitchenUsb
        ? (settings.kitchenPrinterName || settings.printerName || 'POS-80')
        : (settings.kitchenIpAddress?.trim() || (settings.printerType === 'LAN' ? settings.ipAddress?.trim() : ''));
      const kitchenPort = Number(settings.kitchenPort || settings.port || 9100);
      const kitchenType: 'LAN' | 'USB' = isKitchenUsb ? 'USB' : 'LAN';
      return { kitchenTarget, kitchenPort, kitchenType };
    };

    // Helper to print KOT slip without touching the shared printerService singleton
    const printKOTSlip = (kotNo: any, tableNo: any, items: any[], roundTitle?: string) => {
      if (!items || items.length === 0) return;

      const { kitchenTarget, kitchenPort, kitchenType } = resolveKitchenPrinter();
      if (!kitchenTarget) {
        console.log('Kitchen print skipped: No printer IP/USB name configured.');
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

        // Fire-and-forget via Print Bridge HTTP API (never blocks UI, never corrupts printerService state)
        printViaBridge(kotBuffer, kitchenType, kitchenTarget, kitchenPort);
        toast.success(`Kitchen KOT printed for Table ${tableNo}!`, 'KOT Printed');
      } catch (e: any) {
        console.warn('Auto Kitchen KOT build error:', e?.message);
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
      const q = query(ordersCol, where('status', '==', 'RUNNING'));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const order = { id: change.doc.id, ...change.doc.data() } as any;
            const orderItems = order.items || [];

            // On initial load, record all existing running orders so we don't spam print historical orders
            if (isInitialLoad.current) {
              seenOrderIds.current.add(order.id);
              printedItemCounts.current.set(order.id, orderItems.length);
              if (order.billRequested) {
                alertedBillOrderIds.current.add(order.id);
              }
              return;
            }

            // 1. Bill Request Alert (Customer requested bill from table QR - Alert biller/cashier only)
            if (order.billRequested && !alertedBillOrderIds.current.has(order.id)) {
              alertedBillOrderIds.current.add(order.id);

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
              !seenOrderIds.current.has(order.id) &&
              order.orderSource === 'QR_SELF_ORDER'
            ) {
              seenOrderIds.current.add(order.id);
              printedItemCounts.current.set(order.id, orderItems.length);
              roundCounts.current.set(order.id, 1);

              // Play Loud Kitchen Order Chime
              ChimeService.playOrderChime();

              toast.info(
                `Table ${order.tableNo} placed self-order for ${orderItems.length} items (₹${order.totalAmount || 0}).`,
                `🍳 New QR Order: Table ${order.tableNo}`
              );

              // Dispatch Kitchen KOT via Print Bridge (non-blocking, isolated from billing printer)
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
              order.orderSource === 'QR_SELF_ORDER'
            ) {
              const previousCount = printedItemCounts.current.get(order.id) || 0;
              if (orderItems.length > previousCount) {
                const newItems = orderItems.slice(previousCount);
                printedItemCounts.current.set(order.id, orderItems.length);

                const nextRound = (roundCounts.current.get(order.id) || 1) + 1;
                roundCounts.current.set(order.id, nextRound);

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

            if (change.type === 'added') {
              seenOrderIds.current.add(order.id);
            }
          });

          isInitialLoad.current = false;
        },
        (error) => {
          console.warn('Live order notification listener error:', error);
        }
      );

      return () => {
        unsubscribe();
      };
    }, [tenant?.id, activeLocationId, settings]);
  };
