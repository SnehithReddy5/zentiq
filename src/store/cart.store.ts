import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OrderItem } from '../types/order.types';
import { DBServices } from '../services/firebase/db';
import { useTenantStore } from './tenant.store';

export type CartItem = Omit<OrderItem, 'id' | 'orderId'> & { sentQty?: number };

export const getCartItemKey = (item: {
  itemId?: string;
  variantId?: string | null;
  variantName?: string | null;
  itemName?: string;
  name?: string;
  selectedOptions?: { optionId: string }[];
  customizationKey?: string;
}): string => {
  const variant = (item.variantId || item.variantName || 'base').trim().toLowerCase();
  const rawName = (item.itemName || (item as any).name || '').trim();
  const cleanName = rawName.replace(new RegExp(`\\s*\\(${variant}\\)\\s*$`, 'i'), '').trim().toLowerCase();
  const id = (item.itemId || '').trim();

  let optKey = item.customizationKey || '';
  if (!optKey && item.selectedOptions && item.selectedOptions.length > 0) {
    optKey = item.selectedOptions.map(o => o.optionId).sort().join('_');
  }
  const customSuffix = optKey ? `:::${optKey}` : '';

  if (cleanName) {
    return `${cleanName}:::${variant}${customSuffix}`;
  }
  return `${id}:::${variant}${customSuffix}`;
};

export const consolidateCartItems = (items: CartItem[]): CartItem[] => {
  if (!Array.isArray(items)) return [];
  const map = new Map<string, CartItem>();
  for (const item of items) {
    if (!item) continue;
    const key = getCartItemKey(item);
    if (!key || key === ':::base') continue;
    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key)!;
      existing.qty = (existing.qty || 0) + (item.qty || 0);
      existing.sentQty = (existing.sentQty || 0) + (item.sentQty || 0);
      if (item.note && !existing.note) {
        existing.note = item.note;
      }
      // Prefer master itemId over generic item-0
      if ((!existing.itemId || existing.itemId.startsWith('item-')) && item.itemId && !item.itemId.startsWith('item-')) {
        existing.itemId = item.itemId;
      }
      if (!existing.baseItemId && (item as any).baseItemId) {
        (existing as any).baseItemId = (item as any).baseItemId;
      }
    }
  }
  return Array.from(map.values());
};

const syncTimeouts: Record<number, any> = {};
const lastLocalWriteTime: Record<number, number> = {};

const recordLocalWrite = (tableNo: number) => {
  lastLocalWriteTime[tableNo] = Date.now();
};

const shouldIgnoreFirestoreUpdate = (tableNo: number): boolean => {
  const lastWrite = lastLocalWriteTime[tableNo] || 0;
  // Ignore Firestore echo if we modified locally in the last 3000ms
  return Date.now() - lastWrite < 3000;
};

const debounceSyncCart = (tableNo: number, items: CartItem[]) => {
  if (tableNo === 0) return;
  if (syncTimeouts[tableNo]) {
    clearTimeout(syncTimeouts[tableNo]);
  }
  syncTimeouts[tableNo] = setTimeout(() => {
    const tenantId = useTenantStore.getState().tenant?.id;
    const locationId = useTenantStore.getState().activeLocationId;
    DBServices.updateCart(tableNo, items, tenantId, locationId || undefined).catch(err => 
      console.error(`Failed to sync cart for Table ${tableNo} to Firestore:`, err)
    );
    delete syncTimeouts[tableNo];
  }, 250);
};

const syncRunningOrderToFirestore = (tableNo: number, cartItems: CartItem[]) => {
  if (tableNo === 0) return;
  try {
    const { useOrderStore } = require('./order.store');
    const { useTableStore } = require('./table.store');
    const tenantId = useTenantStore.getState().tenant?.id;
    const locationId = useTenantStore.getState().activeLocationId;
    const runningOrder = useOrderStore.getState().orders.find(
      (o: any) => (o.status === 'RUNNING' || o.status === 'running') && Number(o.tableNo) === Number(tableNo)
    );
    if (runningOrder && runningOrder.id) {
      const firestoreItems = cartItems.map(i => ({
        itemId: i.itemId,
        itemName: i.itemName,
        price: i.price,
        qty: i.qty,
        variantId: i.variantId || null,
        variantName: i.variantName || null,
        selectedOptions: i.selectedOptions || null,
        customizationKey: i.customizationKey || null,
        note: i.note || '',
        sentQty: typeof i.sentQty === 'number' ? Math.min(i.sentQty, i.qty) : 0,
      }));
      const newTotal = firestoreItems.reduce((s, i) => s + (i.price * i.qty), 0);

      // 1. Immediately update local order store optimistically so memory has fresh items
      // When items or quantities change, reset billPrinted to false so a fresh bill can be printed
      const currentOrders = useOrderStore.getState().orders;
      const updatedOrders = currentOrders.map((o: any) =>
        o.id === runningOrder.id
          ? {
              ...o,
              items: firestoreItems,
              totalAmount: newTotal,
              subtotal: newTotal,
              billPrinted: false,
              billNo: null,
            }
          : o
      );
      useOrderStore.setState({ orders: updatedOrders });

      // 2. Persist to Firestore: order items + reset billPrinted
      const { DBServices } = require('../services/firebase/db');
      DBServices.updateOrder(runningOrder.id, {
        items: firestoreItems,
        totalAmount: newTotal,
        subtotal: newTotal,
        billPrinted: false,
        billNo: null,
      }, tenantId, runningOrder.locationId || locationId || undefined).catch((err: any) => {
        console.warn('Failed to sync cart changes to running order:', err);
      });

      // 3. Clear billPrinted on table document in Firestore & tableStore
      DBServices.updateTableBillPrinted(tableNo, false, undefined, tenantId, locationId || undefined).catch(() => {});
      useTableStore.setState({
        tables: useTableStore.getState().tables.map((t: any) =>
          Number(t.tableNo) === Number(tableNo)
            ? { ...t, status: 'running', billPrinted: false, billNo: null }
            : t
        )
      });
    }
  } catch (err) {
    console.warn('Failed to sync cart changes to running order:', err);
  }
};

interface CartState {
  carts: Record<number, CartItem[]>;
  setCarts: (carts: Record<number, CartItem[]>) => void;
  syncRemoteCarts: (remoteCarts: Record<number, CartItem[]>) => void;
  syncRunningOrderItems: (tableNo: number, confirmedItems: CartItem[]) => void;
  addItem: (tableNo: number, item: Omit<OrderItem, 'id' | 'orderId'>) => void;
  removeItem: (tableNo: number, itemId: string, variantId?: string | null, customizationKey?: string | null) => void;
  updateQuantity: (tableNo: number, itemId: string, qty: number, variantId?: string | null, customizationKey?: string | null) => void;
  updateNote: (tableNo: number, itemId: string, note: string, variantId?: string | null, customizationKey?: string | null) => void;
  markAsSent: (tableNo: number) => void;
  clearCart: (tableNo: number) => void;
  getCart: (tableNo: number) => CartItem[];
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      carts: {},
      getCart: (tableNo) => consolidateCartItems(get().carts[tableNo] || []),
      setCarts: (carts) => {
        const currentCarts = get().carts;
        const updatedCarts = { ...currentCarts };
        let hasChanges = false;

        Object.keys(carts).forEach((tableKey) => {
          const tableNo = Number(tableKey);
          if (!shouldIgnoreFirestoreUpdate(tableNo)) {
            const incoming = consolidateCartItems(carts[tableNo] || []);
            if (JSON.stringify(currentCarts[tableNo] || []) !== JSON.stringify(incoming)) {
              updatedCarts[tableNo] = incoming;
              hasChanges = true;
            }
          }
        });

        if (hasChanges) {
          set({ carts: updatedCarts });
        }
      },
      syncRemoteCarts: (remoteCarts) => {
        const currentCarts = get().carts;
        const updatedCarts = { ...currentCarts };
        let hasChanges = false;

        Object.keys(remoteCarts).forEach((tableKey) => {
          const tableNo = Number(tableKey);
          if (!shouldIgnoreFirestoreUpdate(tableNo)) {
            const incoming = consolidateCartItems(remoteCarts[tableNo] || []);
            const current = currentCarts[tableNo] || [];
            if (JSON.stringify(current) !== JSON.stringify(incoming)) {
              updatedCarts[tableNo] = incoming;
              hasChanges = true;
            }
          }
        });

        if (hasChanges) {
          set({ carts: updatedCarts });
        }
      },
      syncRunningOrderItems: (tableNo, confirmedItems) => {
        if (tableNo === 0) return;
        if (shouldIgnoreFirestoreUpdate(tableNo)) return;
        const currentCarts = get().carts;
        const rawTableCart = currentCarts[tableNo] || [];

        // If local cart is currently empty (e.g. freshly opening this table), initialize directly
        if (rawTableCart.length === 0) {
          if (confirmedItems.length > 0) {
            set({
              carts: {
                ...currentCarts,
                [tableNo]: consolidateCartItems(confirmedItems),
              }
            });
          }
          return;
        }

        // 1. First consolidate any duplicate rows that might already exist in tableCart
        const consolidatedLocal = consolidateCartItems(rawTableCart);

        // Map existing local items by composite key (itemId + variant)
        const localMap = new Map<string, CartItem>();
        for (const item of consolidatedLocal) {
          localMap.set(getCartItemKey(item), item);
        }

        // Map confirmed items from running order by composite key
        const confirmedMap = new Map<string, CartItem>();
        for (const item of confirmedItems) {
          if (!item || !item.itemId) continue;
          const key = getCartItemKey(item);
          const confQty = item.qty || 1;
          const confSentQty = typeof item.sentQty === 'number' ? item.sentQty : confQty;

          if (!confirmedMap.has(key)) {
            confirmedMap.set(key, {
              ...item,
              qty: confQty,
              sentQty: confSentQty,
            });
          } else {
            const existing = confirmedMap.get(key)!;
            existing.qty += confQty;
            existing.sentQty = (existing.sentQty || 0) + confSentQty;
          }
        }

        // 2. Build merged cart:
        // Local user edits are authoritative for quantities.
        const merged: CartItem[] = [];

        for (const [key, localItem] of localMap.entries()) {
          const confItem = confirmedMap.get(key);
          if (confItem) {
            // Keep localItem.qty; preserve sentQty from confItem or localItem
            merged.push({
              ...confItem,
              ...localItem,
              qty: localItem.qty,
              sentQty: typeof confItem.sentQty === 'number' ? confItem.sentQty : (localItem.sentQty || 0),
              note: localItem.note || confItem.note || '',
            });
          } else {
            // Unconfirmed draft addition not yet in running order
            merged.push({ ...localItem });
          }
        }

        // Only add items from confirmedMap that were added externally (e.g. from customer QR self-order)
        for (const [key, confItem] of confirmedMap.entries()) {
          if (!localMap.has(key)) {
            if ((confItem as any).isQRItem || (confItem as any).source === 'QR') {
              merged.push({
                ...confItem,
                sentQty: Number(confItem.sentQty ?? 0),
              });
            }
          }
        }

        // Only update if different
        const finalMerged = consolidateCartItems(merged);
        if (JSON.stringify(rawTableCart) !== JSON.stringify(finalMerged)) {
          set({
            carts: {
              ...currentCarts,
              [tableNo]: finalMerged,
            }
          });
        }
      },
      addItem: (tableNo, item) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = consolidateCartItems(currentCarts[tableNo] || []);
        const itemKey = getCartItemKey(item);
        const existingIndex = tableCart.findIndex(i => getCartItemKey(i) === itemKey);
        const addQty = Math.max(1, Number(item.qty || 1));
        let newItems: CartItem[];
        if (existingIndex >= 0) {
          newItems = tableCart.map((i, idx) => 
            idx === existingIndex ? { ...i, qty: (i.qty || 0) + addQty } : i
          );
        } else {
          newItems = [...tableCart, { ...item, qty: addQty, sentQty: 0 }];
        }
        set({
          carts: {
            ...currentCarts,
            [tableNo]: newItems
          }
        });
        debounceSyncCart(tableNo, newItems);
        // Also update the running order in Firestore so added items persist
        syncRunningOrderToFirestore(tableNo, newItems);

        // Ensure table status is set to 'running' in local store and Firestore
        if (tableNo !== 0) {
          try {
            const { useTableStore } = require('./table.store');
            const tables = useTableStore.getState().tables;
            const targetTable = tables.find((t: any) => Number(t.tableNo) === Number(tableNo));
            if (targetTable && targetTable.status !== 'running') {
              useTableStore.setState({
                tables: tables.map((t: any) =>
                  Number(t.tableNo) === Number(tableNo) ? { ...t, status: 'running' } : t
                )
              });
              const tenantId = useTenantStore.getState().tenant?.id;
              const locationId = useTenantStore.getState().activeLocationId;
              DBServices.updateTableStatusByNo(tableNo, 'running', tenantId, locationId || undefined).catch(() => {});
            }
          } catch (_) {}
        }
      },
      removeItem: (tableNo, itemId, variantId, customizationKey) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = consolidateCartItems(currentCarts[tableNo] || []);
        const checkItemMatches = (i: CartItem): boolean => {
          const vMatch = (variantId !== undefined && variantId !== null)
            ? (i.variantId === variantId || i.variantName === variantId)
            : true;
          if (!vMatch) return false;
          const cMatch = (customizationKey !== undefined && customizationKey !== null)
            ? (i.customizationKey === customizationKey)
            : true;
          if (!cMatch) return false;
          if (i.itemId === itemId) return true;
          if ((i as any).baseItemId === itemId) return true;
          if (i.itemName && itemId && i.itemName.trim().toLowerCase() === itemId.trim().toLowerCase()) return true;
          return false;
        };
        const newItems = tableCart.filter(i => !checkItemMatches(i));
        set({
          carts: {
            ...currentCarts,
            [tableNo]: newItems
          }
        });
        debounceSyncCart(tableNo, newItems);
        // Also update the running order in Firestore so the removal persists
        syncRunningOrderToFirestore(tableNo, newItems);
      },
      updateQuantity: (tableNo, itemId, qty, variantId, customizationKey) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = consolidateCartItems(currentCarts[tableNo] || []);

        const checkItemMatches = (i: CartItem): boolean => {
          const vMatch = (variantId !== undefined && variantId !== null)
            ? (i.variantId === variantId || i.variantName === variantId)
            : true;
          if (!vMatch) return false;
          const cMatch = (customizationKey !== undefined && customizationKey !== null)
            ? (i.customizationKey === customizationKey)
            : true;
          if (!cMatch) return false;
          if (i.itemId === itemId) return true;
          if ((i as any).baseItemId === itemId) return true;
          if (i.itemName && itemId && i.itemName.trim().toLowerCase() === itemId.trim().toLowerCase()) return true;
          return false;
        };

        let newItems: CartItem[];
        if (qty <= 0) {
          newItems = tableCart.filter(i => !checkItemMatches(i));
        } else {
          let updated = false;
          newItems = tableCart.map(i => {
            if (checkItemMatches(i) && !updated) {
              updated = true;
              const currentSent = typeof i.sentQty === 'number' ? i.sentQty : 0;
              // Preserve original sentQty baseline so decreasing and increasing does not falsely trigger Send KOT
              return { ...i, qty, sentQty: currentSent };
            }
            return i;
          });
        }

        set({
          carts: {
            ...currentCarts,
            [tableNo]: newItems
          }
        });
        debounceSyncCart(tableNo, newItems);
        // Also update the running order in Firestore so the quantity change persists
        syncRunningOrderToFirestore(tableNo, newItems);
      },
      updateNote: (tableNo, itemId, note, variantId, customizationKey) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = consolidateCartItems(currentCarts[tableNo] || []);
        let updated = false;
        const newItems = tableCart.map(i => {
          const vMatch = (variantId !== undefined && variantId !== null)
            ? (i.variantId === variantId || i.variantName === variantId)
            : true;
          const cMatch = (customizationKey !== undefined && customizationKey !== null)
            ? (i.customizationKey === customizationKey)
            : true;
          const idMatch = i.itemId === itemId || (i as any).baseItemId === itemId;
          if (idMatch && vMatch && cMatch && !updated) {
            updated = true;
            return { ...i, note };
          }
          return i;
        });
        set({
          carts: {
            ...currentCarts,
            [tableNo]: newItems
          }
        });
        debounceSyncCart(tableNo, newItems);
        // Also update the running order in Firestore so added items persist
        syncRunningOrderToFirestore(tableNo, newItems);
      },
      markAsSent: (tableNo) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = consolidateCartItems(currentCarts[tableNo] || []);
        const newItems = tableCart.map(i => ({ ...i, sentQty: i.qty }));
        set({
          carts: {
            ...currentCarts,
            [tableNo]: newItems
          }
        });
        if (syncTimeouts[tableNo]) {
          clearTimeout(syncTimeouts[tableNo]);
          delete syncTimeouts[tableNo];
        }
        const tenantId = useTenantStore.getState().tenant?.id;
        const locationId = useTenantStore.getState().activeLocationId;
        DBServices.updateCart(tableNo, newItems, tenantId, locationId || undefined).catch(err => 
          console.error("Failed to sync markAsSent to Firestore:", err)
        );
        // Persist all items with sentQty = qty to Firestore running order & local orderStore
        syncRunningOrderToFirestore(tableNo, newItems);
      },
      clearCart: (tableNo) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        set({
          carts: {
            ...currentCarts,
            [tableNo]: []
          }
        });
        if (syncTimeouts[tableNo]) {
          clearTimeout(syncTimeouts[tableNo]);
          delete syncTimeouts[tableNo];
        }
        const tenantId = useTenantStore.getState().tenant?.id;
        const locationId = useTenantStore.getState().activeLocationId;

        // 1. Clear remote draft cart in Firestore
        DBServices.updateCart(tableNo, [], tenantId, locationId || undefined).catch(err => 
          console.error("Failed to sync clearCart to Firestore:", err)
        );

        // 2. If tableNo !== 0, cancel all running orders for this table and reset table to available
        if (tableNo !== 0) {
          try {
            const { useOrderStore } = require('./order.store');
            const { useTableStore } = require('./table.store');

            // Cancel all running orders for this table
            const currentOrders = useOrderStore.getState().orders;
            const runningOrders = currentOrders.filter(
              (o: any) => (o.status === 'RUNNING' || o.status === 'running') && Number(o.tableNo) === Number(tableNo)
            );

            for (const ro of runningOrders) {
              if (ro && ro.id) {
                DBServices.updateOrderStatus(ro.id, 'CANCELLED', tenantId, ro.locationId || locationId || undefined).catch((err: any) =>
                  console.warn('Failed to cancel running order on clearCart:', err)
                );
              }
            }

            if (runningOrders.length > 0) {
              useOrderStore.setState({
                orders: currentOrders.filter((o: any) => !runningOrders.some((ro: any) => ro.id === o.id))
              });
            }

            // Reset table to available in local store & Firestore
            const currentTables = useTableStore.getState().tables;
            const targetTable = currentTables.find((t: any) => Number(t.tableNo) === Number(tableNo));
            useTableStore.setState({
              tables: currentTables.map((t: any) =>
                Number(t.tableNo) === Number(tableNo)
                  ? { ...t, status: 'available', billPrinted: false, billNo: null, cartItems: [] }
                  : t
              )
            });

            if (targetTable && targetTable.id) {
              DBServices.updateTableStatus(targetTable.id, 'available', tenantId, locationId || undefined).catch(() => {});
            }
            DBServices.updateTableStatusByNo(tableNo, 'available', tenantId, locationId || undefined).catch((err: any) =>
              console.warn('Failed to reset table status to available on clearCart:', err)
            );
          } catch (tableErr) {
            console.warn('Error resetting table on clearCart:', tableErr);
          }
        }
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
