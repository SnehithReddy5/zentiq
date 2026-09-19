import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OrderItem } from '../types/order.types';
import { DBServices } from '../services/firebase/db';
import { useTenantStore } from './tenant.store';

export type CartItem = Omit<OrderItem, 'id' | 'orderId'> & { sentQty?: number };

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
  addItem: (tableNo: number, item: Omit<OrderItem, 'id' | 'orderId'>) => void;
  removeItem: (tableNo: number, itemId: string) => void;
  updateQuantity: (tableNo: number, itemId: string, qty: number) => void;
  updateNote: (tableNo: number, itemId: string, note: string) => void;
  markAsSent: (tableNo: number) => void;
  clearCart: (tableNo: number) => void;
  getCart: (tableNo: number) => CartItem[];
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      carts: {},
      getCart: (tableNo) => get().carts[tableNo] || [],
      setCarts: (carts) => {
        const currentCarts = get().carts;
        const updatedCarts = { ...currentCarts };
        let hasChanges = false;

        Object.keys(carts).forEach((tableKey) => {
          const tableNo = Number(tableKey);
          if (!shouldIgnoreFirestoreUpdate(tableNo)) {
            if (JSON.stringify(currentCarts[tableNo] || []) !== JSON.stringify(carts[tableNo] || [])) {
              updatedCarts[tableNo] = carts[tableNo];
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
            const incoming = remoteCarts[tableNo] || [];
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
      addItem: (tableNo, item) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = currentCarts[tableNo] || [];
        const existing = tableCart.find(i => i.itemId === item.itemId);
        let newItems: CartItem[];
        if (existing) {
          newItems = tableCart.map(i => i.itemId === item.itemId ? { ...i, qty: i.qty + 1 } : i);
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
      removeItem: (tableNo, itemId) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = currentCarts[tableNo] || [];
        const newItems = tableCart.filter(i => i.itemId !== itemId);
        set({
          carts: {
            ...currentCarts,
            [tableNo]: newItems
          }
        });
        debounceSyncCart(tableNo, newItems);
      },
      updateQuantity: (tableNo, itemId, qty) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = currentCarts[tableNo] || [];
        // If quantity is 0 or negative, automatically remove the item from the cart
        let newItems: CartItem[];
        if (qty <= 0) {
          newItems = tableCart.filter(i => i.itemId !== itemId);
        } else {
          newItems = tableCart.map(i => i.itemId === itemId ? { ...i, qty } : i);
        }
        set({
          carts: {
            ...currentCarts,
            [tableNo]: newItems
          }
        });
        debounceSyncCart(tableNo, newItems);
      },
      updateNote: (tableNo, itemId, note) => {
        recordLocalWrite(tableNo);
        const currentCarts = get().carts;
        const tableCart = currentCarts[tableNo] || [];
        const newItems = tableCart.map(i => i.itemId === itemId ? { ...i, note } : i);
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
        const tableCart = currentCarts[tableNo] || [];
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
