import { create } from 'zustand';
import { Table } from '../types/table.types';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from './tenant.store';

interface TableState {
  tables: Table[];
  isLoading: boolean;
  setTables: (tables: Table[]) => void;
  setLoading: (isLoading: boolean) => void;
  subscribeToTables: () => () => void;
}

export const useTableStore = create<TableState>((set) => ({
  tables: [],
  isLoading: true,
  setTables: (tables) => set({ tables }),
  setLoading: (isLoading) => set({ isLoading }),
  subscribeToTables: () => {
    set({ isLoading: true });
    const { tenant, activeLocationId } = useTenantStore.getState();

    // Tables are strictly branch/location-wise.
    if (!tenant?.id || !activeLocationId) {
      set({ tables: [], isLoading: false });
      return () => {};
    }

    const q = query(
      collection(db, 'tenants', tenant.id, 'locations', activeLocationId, 'tables'),
      orderBy('tableNo', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const tables: Table[] = [];
        const syncedCarts: Record<number, any[]> = {};

        snapshot.forEach((doc) => {
          const data = doc.data() as Table;
          tables.push({ ...data, id: doc.id });
          syncedCarts[data.tableNo] = (data as any).cartItems || [];
        });

        set({ tables, isLoading: false });

        // Synchronize remote table carts into useCartStore for real-time multi-device occupancy
        try {
          const { useCartStore } = require('./cart.store');
          useCartStore.getState().syncRemoteCarts(syncedCarts);
        } catch (e) {
          console.warn("Could not sync remote carts into cart store:", e);
        }
      },
      (error) => {
        console.warn("Error fetching tables:", error);
        set({ isLoading: false });
      }
    );

    return unsubscribe;
  },
}));
