import { CartItem, consolidateCartItems, useCartStore } from '../../store/cart.store';
import { useMenuStore } from '../../store/menu.store';
import { useOrderStore } from '../../store/order.store';
import { useToastStore } from '../../store/toast.store';
import { DBServices } from '../firebase/db';
import { ESCPOSService } from '../printer/escpos.service';
import { printerService } from '../printer/printer.service';
import { PrinterSettings } from '../../types/printer.types';
import { Table } from '../../types/table.types';
import { Location, TenantBranding, TenantFeatures } from '../../types/tenant.types';
import { getBaseItemName } from '../../utils/itemDisplay';
import { toast } from '../../utils/toast';

export type TableVisualState = 'BLANK' | 'RUNNING' | 'RUNNING_KOT' | 'PRINTED' | 'BILL_REQ';

export interface OrderTotalsSummary {
  rawItemsSum: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  cartTotal: number;
}

/**
 * Pure calculation matching CartScreen GST & discount math cleanly in one place.
 */
export const calculateOrderTotals = (
  items: Pick<CartItem, 'price' | 'qty'>[],
  features: Partial<TenantFeatures>,
  discountAmount: number = 0
): OrderTotalsSummary => {
  const rawItemsSum = items.reduce((sum, i) => sum + (Number(i.price || 0) * Number(i.qty || 0)), 0);
  const safeDiscount = Math.min(Math.max(0, discountAmount), rawItemsSum);
  const discountedSum = Math.max(0, rawItemsSum - safeDiscount);

  const gstEnabled = features.gstEnabled !== false;
  const gstType = features.gstType || 'INCLUSIVE';
  const cgstRate = typeof features.cgstRate === 'number' ? features.cgstRate : 2.5;
  const sgstRate = typeof features.sgstRate === 'number' ? features.sgstRate : 2.5;
  const totalTaxRate = (cgstRate + sgstRate) / 100;

  if (!gstEnabled) {
    return {
      rawItemsSum,
      subtotal: rawItemsSum,
      cgst: 0,
      sgst: 0,
      totalTax: 0,
      cartTotal: discountedSum,
    };
  }

  if (gstType === 'EXCLUSIVE') {
    const sub = rawItemsSum;
    const taxable = discountedSum;
    const cgst = Math.round((taxable * (cgstRate / 100)) * 100) / 100;
    const sgst = Math.round((taxable * (sgstRate / 100)) * 100) / 100;
    const totalTax = cgst + sgst;
    const cartTotal = Math.round(taxable + totalTax);
    return { rawItemsSum, subtotal: sub, cgst, sgst, totalTax, cartTotal };
  }

  const cartTotal = discountedSum;
  const subtotal = totalTaxRate > 0 ? Math.round((cartTotal / (1 + totalTaxRate)) * 100) / 100 : cartTotal;
  const totalTax = cartTotal - subtotal;
  const cgst = Math.round((totalTax * (cgstRate / ((cgstRate + sgstRate) || 1))) * 100) / 100;
  const sgst = Math.round((totalTax - cgst) * 100) / 100;
  return { rawItemsSum, subtotal, cgst, sgst, totalTax, cartTotal };
};

export const resolveActivePaymentMethods = (features: Partial<TenantFeatures>): string[] => {
  if (features.paymentsEnabled === false) return [];
  const methods: string[] = [];
  if (features.cashEnabled !== false) methods.push('CASH');
  if (features.upiEnabled !== false) methods.push('UPI');
  if (features.cardEnabled !== false) methods.push('CARD');
  if (features.customPaymentMethods && features.customPaymentMethods.length > 0) {
    features.customPaymentMethods.forEach(m => {
      if (!methods.includes(m)) methods.push(m);
    });
  }
  return methods;
};

/**
 * Normalizes items from a running order or remote table cart into CartItem[] shape.
 */
export const normalizeOrderItemsToCart = (rawItems: any[]): CartItem[] => {
  if (!rawItems || rawItems.length === 0) return [];
  const menuItems = useMenuStore.getState().items;
  return consolidateCartItems(
    rawItems.map((it: any, idx: number) => {
      const rawName = (it.itemName || it.name || '').trim().toLowerCase();
      const matchedMaster = menuItems.find(
        m => m.id === it.itemId || (m.name && m.name.trim().toLowerCase() === rawName)
      );
      return {
        itemId: matchedMaster?.id || it.itemId || it.id || `item-${idx}`,
        baseItemId: matchedMaster?.id || it.baseItemId || undefined,
        itemName: matchedMaster?.name || it.itemName || it.name || 'Item',
        price: Number(it.price ?? matchedMaster?.price ?? 0),
        qty: Number(it.qty || 1),
        sentQty: Number(it.sentQty ?? 0),
        variantId: it.variantId || undefined,
        variantName: it.variantName || undefined,
        note: it.note || '',
      };
    })
  );
};

export interface TableOrderContext {
  visualState: TableVisualState;
  isOccupied: boolean;
  isBillPrinted: boolean;
  isBillRequested: boolean;
  isQrOrder: boolean;
  runningOrder: any | null;
  items: CartItem[];
  itemCount: number;
  billNo: number | null;
  displayAmount: number;
  waiterName: string | null;
}

export const resolveTableOrderContext = (
  table: Table,
  localCart: CartItem[] | undefined,
  runningOrder: any | null,
  features: Partial<TenantFeatures>
): TableOrderContext => {
  const safeLocalCart = localCart || [];
  const remoteCart = (table as any).cartItems || [];
  const isBillRequested = (table as any).billRequested === true || runningOrder?.billRequested === true;
  const isBillPrinted = (table as any).billPrinted === true || runningOrder?.billPrinted === true;
  const isQrOrder = runningOrder?.orderSource === 'QR_SELF_ORDER';

  const rawItems = runningOrder?.items?.length
    ? runningOrder.items
    : safeLocalCart.length > 0
      ? safeLocalCart
      : remoteCart;

  const items = rawItems.length > 0 ? normalizeOrderItemsToCart(rawItems) : [];
  const itemCount = items.reduce((s, i) => s + (i.qty || 0), 0);

  const isOccupied =
    safeLocalCart.length > 0 ||
    remoteCart.length > 0 ||
    table.status === 'running' ||
    table.status === 'OCCUPIED' ||
    Boolean(runningOrder);

  const billNo: number | null =
    Number((table as any).billNo || runningOrder?.billNo || runningOrder?.orderNumber || runningOrder?.kotNo) || null;

  const displayAmount = runningOrder?.totalAmount !== undefined
    ? Number(runningOrder.totalAmount || 0)
    : items.length > 0
      ? calculateOrderTotals(items, features, 0).cartTotal
      : 0;

  let visualState: TableVisualState = 'BLANK';
  if (isBillPrinted) {
    visualState = 'PRINTED';
  } else if (isBillRequested) {
    visualState = 'BILL_REQ';
  } else if (runningOrder) {
    visualState = 'RUNNING_KOT';
  } else if (isOccupied) {
    visualState = 'RUNNING';
  }

  const waiterName = isQrOrder
    ? 'QR Order'
    : runningOrder?.captainName || (table as any).activeWaiterName || null;

  return {
    visualState,
    isOccupied,
    isBillPrinted,
    isBillRequested,
    isQrOrder,
    runningOrder,
    items,
    itemCount,
    billNo,
    displayAmount,
    waiterName,
  };
};

interface PrintTableBillParams {
  tableNo: number;
  orderType?: string;
  cartItems: CartItem[];
  printedBillNo?: number | null;
  existingRunningOrder?: any | null;
  provisionalPayments?: { method: string; amount: number }[];
  discountAmount?: number;
  settings: PrinterSettings;
  branding: TenantBranding | null;
  features: Partial<TenantFeatures>;
  tenantId?: string;
  locationId?: string | null;
  staffName?: string;
}

/**
 * Dispatches a provisional thermal bill/token and persists billPrinted state to Firestore.
 */
export const printTableBillAction = async ({
  tableNo,
  orderType = 'DINE_IN',
  cartItems,
  printedBillNo,
  existingRunningOrder: providedRunningOrder,
  provisionalPayments,
  discountAmount = 0,
  settings,
  branding,
  features,
  tenantId,
  locationId,
  staffName = 'Staff',
}: PrintTableBillParams): Promise<{ success: boolean; billNo?: number }> => {
  if (!cartItems || cartItems.length === 0) {
    toast.warning('Cart is empty. Add items first.', 'Empty Cart');
    return { success: false };
  }

  const isUsb = settings.printerType === 'USB';
  const mainTarget = isUsb ? (settings.printerName || 'POS-80') : (settings.ipAddress?.trim() || '');
  const mainPort = settings.port || 9100;
  const mainType = isUsb ? 'USB' : 'LAN';

  if (!mainTarget) {
    toast.warning('Please configure Billing Printer in Settings first.', 'Printer Required');
    return { success: false };
  }

  try {
    let existingRunningOrder = providedRunningOrder || null;
    if (!existingRunningOrder && tableNo !== 0) {
      existingRunningOrder = useOrderStore.getState().orders.find(
        (o: any) => Number(o.tableNo) === Number(tableNo) && (o.status === 'RUNNING' || o.status === 'running')
      ) || null;
    }

    let billNo: number = printedBillNo || 0;
    if (!billNo && existingRunningOrder) {
      billNo = Number(existingRunningOrder.billNo || existingRunningOrder.orderNumber || existingRunningOrder.kotNo || 0);
    }
    if (!billNo) {
      billNo = await DBServices.getNextSequenceNumber(tenantId, locationId || undefined);
    }

    const gstEnabled = features.gstEnabled !== false;
    const gstType = features.gstType || 'INCLUSIVE';
    const cgstRate = typeof features.cgstRate === 'number' ? features.cgstRate : 2.5;
    const sgstRate = typeof features.sgstRate === 'number' ? features.sgstRate : 2.5;
    const brandPayload = branding ? { ...branding, gstEnabled, gstType, cgstRate, sgstRate } : null;

    const totals = calculateOrderTotals(cartItems, features, discountAmount);
    const activeMethods = resolveActivePaymentMethods(features);
    const paymentsPayload = provisionalPayments && provisionalPayments.length > 0
      ? provisionalPayments
      : [{ method: activeMethods[0] || 'CASH', amount: totals.cartTotal }];

    const workflowMode = settings.printerWorkflowMode || 'RESTAURANT';
    const isCombinedMode = workflowMode === 'SINGLE_COMBINED' || workflowMode === 'TIFFIN_CENTER';
    const isSingleKot = workflowMode === 'SINGLE_KOT_ONLY' || workflowMode === 'TOKEN_ONLY';

    const billBuffer = isSingleKot
      ? ESCPOSService.buildTokenSlip(billNo, tableNo, staffName, cartItems, brandPayload, 'TOKEN DISPATCH', orderType)
      : isCombinedMode
        ? ESCPOSService.buildCombinedTiffinPrints(billNo, tableNo, staffName, cartItems, brandPayload, orderType, paymentsPayload, discountAmount)
        : ESCPOSService.buildBill(billNo, tableNo, staffName, cartItems, brandPayload, orderType, paymentsPayload, discountAmount);

    await printerService.printReceiptOrKOT(billBuffer, mainTarget, mainPort, mainType);

    if (existingRunningOrder && existingRunningOrder.id) {
      DBServices.updateOrder(existingRunningOrder.id, {
        billPrinted: true,
        billPrintedAt: new Date(),
        billNo,
      }, tenantId, existingRunningOrder.locationId || locationId || undefined).catch(() => { });
    }

    if (tableNo !== 0) {
      DBServices.updateTableBillPrinted(tableNo, true, billNo, tenantId, locationId || undefined).catch(() => { });
    }

    toast.success(
      `${isSingleKot ? `Token #${billNo}` : `Bill #${billNo}`} printed successfully for ${tableNo !== 0 ? `Table ${tableNo}` : 'Order'}!`,
      isSingleKot ? 'Token Printed' : 'Bill Printed'
    );
    return { success: true, billNo };
  } catch (err: any) {
    const isExpoGoSocketError = err?.message?.includes('Thermal printing over raw TCP sockets is not supported in Expo Go');
    if (isExpoGoSocketError) {
      toast.info('Expo Go detected: Raw TCP socket simulated.', 'Printer Notice');
    } else {
      toast.error(`Thermal printer (${settings.ipAddress || 'LAN'}) error: ${err.message || 'offline'}. Check Wi-Fi.`, 'Print Failed');
    }
    return { success: false };
  }
};

interface SettleTableOrderParams {
  tableNo: number;
  orderType?: string;
  cartItems: CartItem[];
  finalPayments: { method: string; amount: number }[];
  shouldPrint?: boolean;
  printedBillNo?: number | null;
  existingRunningOrder?: any | null;
  discountAmount?: number;
  user: { id?: string; name?: string; role?: string } | null;
  tenantId?: string;
  locationId?: string | null;
  locations: Location[];
  settings: PrinterSettings;
  branding: TenantBranding | null;
  features: Partial<TenantFeatures>;
}

/**
 * Finalizes payment, updates or creates the COMPLETED order, frees the table, clears cart,
 * and optionally dispatches thermal print in the background.
 */
export const settleTableOrderAction = async ({
  tableNo,
  orderType = 'DINE_IN',
  cartItems,
  finalPayments,
  shouldPrint = false,
  printedBillNo,
  existingRunningOrder: providedRunningOrder,
  discountAmount = 0,
  user,
  tenantId,
  locationId,
  locations,
  settings,
  branding,
  features,
}: SettleTableOrderParams): Promise<{ success: boolean; billNo?: number }> => {
  if (user?.role === 'WAITER' || user?.role === 'captain') {
    toast.warning(
      'Bill settlement requires Biller or Manager authorization. Please hand over this table order to the billing counter.',
      'Action Restricted'
    );
    return { success: false };
  }

  if (!cartItems || cartItems.length === 0) {
    toast.warning('No items found to settle for this order.', 'Empty Order');
    return { success: false };
  }

  if (!locationId && locations && locations.length > 0) {
    toast.warning('Please select an active operating branch on the home screen before completing orders.', 'Branch Required');
    return { success: false };
  }

  try {
    let existingRunningOrder = providedRunningOrder || null;
    if (!existingRunningOrder && tableNo !== 0) {
      existingRunningOrder = useOrderStore.getState().orders.find(
        (o: any) => Number(o.tableNo) === Number(tableNo) && (o.status === 'RUNNING' || o.status === 'running')
      ) || null;
    }

    const billNo =
      printedBillNo ||
      Number(existingRunningOrder?.billNo || existingRunningOrder?.orderNumber || existingRunningOrder?.kotNo || 0) ||
      await DBServices.getNextSequenceNumber(tenantId, locationId || undefined);

    const { subtotal, totalTax, cartTotal } = calculateOrderTotals(cartItems, features, discountAmount);
    const cleanedItems = cartItems.map(i => ({ ...i, itemName: getBaseItemName(i.itemName, i.variantName) }));

    const paymentRows = finalPayments.map(p => ({
      id: 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      method: p.method as any,
      amount: p.amount,
      timestamp: new Date().toISOString(),
    }));

    let orderPromise: Promise<any>;
    if (existingRunningOrder && existingRunningOrder.id) {
      orderPromise = DBServices.updateOrderToSettled(
        existingRunningOrder.id,
        {
          billNo,
          payments: paymentRows,
          totalAmount: cartTotal,
          subtotal,
          tax: totalTax,
          discount: discountAmount,
          captainId: user?.id || 'staff',
          captainName: user?.name || 'Staff',
          items: cleanedItems,
          orderType,
          tableNo,
        },
        tenantId,
        existingRunningOrder.locationId || locationId || undefined
      );
    } else {
      orderPromise = DBServices.createOrder({
        orderNumber: billNo,
        kotNo: billNo,
        orderType: orderType as any,
        tableNo,
        captainId: user?.id || 'staff',
        captainName: user?.name || 'Staff',
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        payments: paymentRows,
        items: cleanedItems,
        discount: discountAmount,
        subtotal,
        tax: totalTax,
        totalAmount: cartTotal,
        createdAt: new Date(),
      }, tenantId, locationId || undefined);
    }

    const tablePromise = tableNo !== 0
      ? DBServices.updateTableStatusByNo(tableNo, 'available', tenantId, locationId || undefined)
      : Promise.resolve();

    if (shouldPrint) {
      const gstEnabled = features.gstEnabled !== false;
      const gstType = features.gstType || 'INCLUSIVE';
      const cgstRate = typeof features.cgstRate === 'number' ? features.cgstRate : 2.5;
      const sgstRate = typeof features.sgstRate === 'number' ? features.sgstRate : 2.5;
      const brandPayload = branding ? { ...branding, gstEnabled, gstType, cgstRate, sgstRate } : null;
      const workflowMode = settings.printerWorkflowMode || 'RESTAURANT';

      const dispatchPrints = async () => {
        const isUsb = settings.printerType === 'USB';
        const mainTarget = isUsb ? (settings.printerName || 'POS-80') : (settings.ipAddress || '127.0.0.1');
        const mainPort = settings.port || 9100;
        const mainType = isUsb ? 'USB' : 'LAN';

        const isCombinedMode = workflowMode === 'SINGLE_COMBINED' || workflowMode === 'TIFFIN_CENTER';
        const isSingleKot = workflowMode === 'SINGLE_KOT_ONLY' || workflowMode === 'TOKEN_ONLY';

        try {
          const billBuffer = isSingleKot
            ? ESCPOSService.buildTokenSlip(billNo, tableNo, user?.name || 'Staff', cartItems, brandPayload, 'TOKEN DISPATCH (PAID)', orderType)
            : isCombinedMode
              ? ESCPOSService.buildCombinedTiffinPrints(billNo, tableNo, user?.name || 'Staff', cartItems, brandPayload, orderType, finalPayments, discountAmount)
              : ESCPOSService.buildBill(billNo, tableNo, user?.name || 'Staff', cartItems, brandPayload, orderType, finalPayments, discountAmount);

          await printerService.printReceiptOrKOT(billBuffer, mainTarget, mainPort, mainType);
        } catch (printErr: any) {
          const isExpoGoSocketError = printErr?.message?.includes('Thermal printing over raw TCP sockets is not supported in Expo Go');
          if (!isExpoGoSocketError) {
            console.warn('Thermal print background dispatch error:', printErr);
            useToastStore.getState().showToast({
              type: 'error',
              title: 'Print Failed (Saved to Cloud)',
              message: `Bill #${billNo} recorded, but thermal printer (${settings.ipAddress || 'LAN'}) did not respond: ${printErr?.message || 'offline'}. Check Wi-Fi.`,
              duration: 7000,
            });
          }
        }
      };

      dispatchPrints();
    }

    await Promise.all([orderPromise, tablePromise]);

    useToastStore.getState().showToast({
      type: 'success',
      title: 'Order Settled',
      message: tableNo !== 0
        ? `Table ${tableNo} settled & freed successfully.`
        : `Bill #${billNo} settled successfully.`,
      duration: 3500,
    });

    useCartStore.getState().clearCart(tableNo);
    return { success: true, billNo };
  } catch (e: any) {
    toast.error(e.message || 'Settlement failed', 'Checkout Error');
    return { success: false };
  }
};
