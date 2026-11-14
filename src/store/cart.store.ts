import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OrderItem } from '../types/order.types';
import { DBServices } from '../services/firebase/db';
import { useTenantStore } from './tenant.store';

export type CartItem = Omit<OrderItem, 'id' | 'orderId'> & { sentQty?: number };

export const getCartItemKey = (item: { itemId?: string; variantId?: string | null; variantName?: string | null; itemName?: string; name?: string }): string => {
  const variant = (item.variantId || item.variantName || 'base').trim().toLowerCase();
  const rawName = (item.itemName || (item as any).name || '').trim();
  const cleanName = rawName.replace(new RegExp(`\\s*\\(${variant}\\)\\s*$`, 'i'), '').trim().toLowerCase();
  const id = (item.itemId || '').trim();
  if (cleanName) {
    return `${cleanName}:::${variant}`;
  }
  return `${id}:::${variant}`;
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
  // Ignore Firestore echo if we modified locally in the last 2500ms
  return Date.now() - lastWrite < 800;
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

interface CartState {
  carts: Record<number, CartItem[]>;
  setCarts: (carts: Record<number, CartItem[]>) => void;
  syncRemoteCarts: (remoteCarts: Record<number, CartItem[]>) => void;
  syncRunningOrderItems: (tableNo: number, confirmedItems: CartItem[]) => void;
  addItem: (tableNo: number, item: Omit<OrderItem, 'id' | 'orderId'>) => void;
  removeItem: (tableNo: number, itemId: string, variantId?: string | null) => void;
  updateQuantity: (tableNo: number, itemId: string, qty: number, variantId?: string | null) => void;
  updateNote: (tableNo: number, itemId: string, note: string, variantId?: string | null) => void;
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
        const currentCarts = get().carts;
        const rawTableCart = currentCarts[tableNo] || [];

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
          const confSentQty = item.sentQty ?? confQty;

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

        // 2. Build merged cart: exactly ONE entry per item/variant
        const merged: CartItem[] = [];

        // Add confirmed items (merging in any unsent local additions)
        for (const [key, confItem] of confirmedMap.entries()) {
          const localItem = localMap.get(key);
          if (localItem) {
            // Unsent additions the waiter added locally beyond what was sent
            const localDraftQty = Math.max(0, (localItem.qty || 0) - (localItem.sentQty || 0));
            // Final total quantity is confirmed quantity + draft additions (at least confItem.qty)
            const finalQty = Math.max(confItem.qty, confItem.qty + localDraftQty);
            merged.push({
              ...localItem,
              ...confItem,
              qty: finalQty,
              sentQty: confItem.qty,
              note: localItem.note || confItem.note || '',
            });
          } else {
            merged.push({
              ...confItem,
              sentQty: confItem.qty,
            });
          }
        }

        // Add pure draft items that have not yet been placed into the confirmed order
        for (const [key, localItem] of localMap.entries()) {
          if (!confirmedMap.has(key)) {
            merged.push({
              ...localItem,
              sentQty: 0,
            });
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
        let newItems: CartItem[];
        if (existingIndex >= 0) {
          newItems = tableCart.map((i, idx) => 
            idx === existingIndex ? { ...i, qty: (i.qty || 0) + 1 } : i
          );
        } else {
          newItems = [...tableCart, { ...item, qty: 1 }];
        }
        set({
          carts: {
            ...currentCarts,
            [tableNo]: newItems
          }
        });
        debounceSyncCart(tableNo, newItems);
      },
      removeItem: (tableNo, itemId, variantId) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = consolidateCartItems(currentCarts[tableNo] || []);
        const checkItemMatches = (i: CartItem): boolean => {
          const vMatch = (variantId !== undefined && variantId !== null)
            ? (i.variantId === variantId || i.variantName === variantId)
            : true;
          if (!vMatch) return false;
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
      },
      updateQuantity: (tableNo, itemId, qty, variantId) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = consolidateCartItems(currentCarts[tableNo] || []);

        const checkItemMatches = (i: CartItem): boolean => {
          const vMatch = (variantId !== undefined && variantId !== null)
            ? (i.variantId === variantId || i.variantName === variantId)
            : true;
          if (!vMatch) return false;
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
              return { ...i, qty };
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
      },
      updateNote: (tableNo, itemId, note, variantId) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = consolidateCartItems(currentCarts[tableNo] || []);
        let updated = false;
        const newItems = tableCart.map(i => {
          const matches = (variantId !== undefined && variantId !== null)
            ? (i.itemId === itemId && (i.variantId === variantId || i.variantName === variantId))
            : (i.itemId === itemId);
          if (matches && !updated) {
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
        DBServices.updateCart(tableNo, [], tenantId, locationId || undefined).catch(err => 
          console.error("Failed to sync clearCart to Firestore:", err)
        );
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
