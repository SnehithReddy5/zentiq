import { useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from '../store/tenant.store';
import { usePrinterStore } from '../store/printer.store';
import { toast } from '../utils/toast';
import { ChimeService } from '../services/sound/chime.service';
import { ESCPOSService } from '../services/printer/escpos.service';
import { printerService } from '../services/printer/printer.service';

export const useLiveOrderNotifications = (onPrintBill?: (order: any) => void) => {
  const { tenant, activeLocationId } = useTenantStore();
  const { settings } = usePrinterStore();

  const alertedBillOrderIds = useRef<Set<string>>(new Set());
  const seenOrderIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

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

          // 2. New QR Self-Order Arrival Alert & Automated Kitchen KOT Print
          if (
            change.type === 'added' &&
            !isInitialLoad.current &&
            !seenOrderIds.current.has(order.id) &&
            order.orderSource === 'QR_SELF_ORDER'
          ) {
            seenOrderIds.current.add(order.id);

            // Play Loud Kitchen Order Chime
            ChimeService.playOrderChime();

            toast.info(
              `Table ${order.tableNo} placed self-order for ${order.items?.length || 0} items (₹${order.totalAmount || 0}).`,
              `🍳 New QR Order: Table ${order.tableNo}`
            );

            // Automatically Dispatch ESC/POS KOT to Kitchen Printer
            (async () => {
              try {
                const isUsb = settings.printerType === 'USB';
                const mainTarget = isUsb ? (settings.printerName || 'POS-80') : settings.ipAddress?.trim();
                if (!mainTarget) return;

                const kotBuffer = ESCPOSService.buildKOT(
                  order.kotNo || order.orderNumber || order.id.slice(0, 5),
                  order.tableNo || 0,
                  'Customer QR',
                  order.items || [],
                  order.specialNote || 'Self-Order from Table QR',
                  'DINE_IN'
                );

                await printerService.print(kotBuffer, {
                  printerType: settings.printerType as any,
                  printerName: settings.printerName,
                  ip: settings.ipAddress,
                  port: Number(settings.port) || 9100,
                });

                toast.success(`Kitchen KOT printed for Table ${order.tableNo}!`);
              } catch (e: any) {
                console.warn('Auto KOT print failed:', e?.message);
              }
            })();
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
