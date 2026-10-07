import { create } from 'zustand';
import { InventoryItem, InventoryLog } from '../types/inventory.types';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from './tenant.store';

interface InventoryState {
  items: InventoryItem[];
  logs: InventoryLog[];
  isLoading: boolean;
  setItems: (items: InventoryItem[]) => void;
  setLogs: (logs: InventoryLog[]) => void;
  subscribeToInventory: () => () => void;
}

let activeInventoryUnsub: (() => void) | null = null;
let currentInventoryKey: string | null = null;
let inventorySubscribersCount = 0;

export const useInventoryStore = create<InventoryState>((set) => ({
  items: [],
  logs: [],
  isLoading: true,
  setItems: (items) => set({ items }),
  setLogs: (logs) => set({ logs }),

  subscribeToInventory: () => {
    const { tenant, activeLocationId } = useTenantStore.getState();
    const locKey = `${tenant?.id || 'none'}_${activeLocationId || 'none'}`;

    if (activeInventoryUnsub && currentInventoryKey === locKey) {
      inventorySubscribersCount++;
      return () => {
        inventorySubscribersCount--;
        if (inventorySubscribersCount <= 0 && activeInventoryUnsub) {
          activeInventoryUnsub();
          activeInventoryUnsub = null;
          currentInventoryKey = null;
          inventorySubscribersCount = 0;
        }
      };
    }

    if (activeInventoryUnsub) {
      activeInventoryUnsub();
      activeInventoryUnsub = null;
      inventorySubscribersCount = 0;
    }

    set({ isLoading: true });
    currentInventoryKey = locKey;
    inventorySubscribersCount = 1;

    let itemsCol;
    let logsCol;

    if (tenant?.id && activeLocationId) {
      itemsCol = collection(db, 'tenants', tenant.id, 'locations', activeLocationId, 'inventoryItems');
      logsCol = collection(db, 'tenants', tenant.id, 'locations', activeLocationId, 'inventoryLogs');
    } else {
      itemsCol = collection(db, 'inventoryItems');
      logsCol = collection(db, 'inventoryLogs');
    }

    const qItems = query(itemsCol, orderBy('name', 'asc'));
    const unsubItems = onSnapshot(
      qItems,
      (snapshot) => {
        const items: InventoryItem[] = [];
        snapshot.forEach((doc) => {
          items.push({ ...doc.data(), id: doc.id } as InventoryItem);
        });
        set({ items, isLoading: false });
      },
      (error) => {
        console.warn('Error fetching inventory items:', error);
        set({ isLoading: false });
      }
    );

    const qLogs = query(logsCol, orderBy('createdAt', 'desc'), limit(100));
    const unsubLogs = onSnapshot(
      qLogs,
      (snapshot) => {
        const logs: InventoryLog[] = [];
        snapshot.forEach((doc) => {
          logs.push({ ...doc.data(), id: doc.id } as InventoryLog);
        });
        set({ logs });
      },
      (error) => {
        console.warn('Error fetching inventory logs:', error);
      }
    );

    activeInventoryUnsub = () => {
      unsubItems();
      unsubLogs();
    };

    return () => {
      inventorySubscribersCount--;
      if (inventorySubscribersCount <= 0 && activeInventoryUnsub) {
        activeInventoryUnsub();
        activeInventoryUnsub = null;
        currentInventoryKey = null;
        inventorySubscribersCount = 0;
      }
    };
  },
}));
