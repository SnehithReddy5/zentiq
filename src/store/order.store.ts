import { create } from 'zustand';
import { Order } from '../types/order.types';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from './tenant.store';

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  setOrders: (orders: Order[]) => void;
  setLoading: (isLoading: boolean) => void;
  subscribeToOrders: (specificLocationId?: string) => () => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  isLoading: true,
  setOrders: (orders) => set({ orders }),
  setLoading: (isLoading) => set({ isLoading }),
  subscribeToOrders: (specificLocationId?: string) => {
    set({ isLoading: true });
    const { tenant, activeLocationId, locations } = useTenantStore.getState();
    const targetLocId = specificLocationId !== undefined ? specificLocationId : activeLocationId;

    if (!tenant?.id) {
      set({ orders: [], isLoading: false });
      return () => {};
    }

    // If 'ALL' is requested across all locations
    if (targetLocId === 'ALL') {
      const activeLocs = locations.filter(l => l.status !== 'DISABLED');
      if (activeLocs.length === 0) {
        set({ orders: [], isLoading: false });
        return () => {};
      }

      const unsubs: (() => void)[] = [];
      const branchOrdersMap: Record<string, Order[]> = {};

      activeLocs.forEach(loc => {
        const q = query(
          collection(db, 'tenants', tenant.id, 'locations', loc.id, 'orders'),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const locOrders: Order[] = [];
            snapshot.forEach(d => locOrders.push({ ...d.data(), id: d.id, locationName: loc.name } as any));
            branchOrdersMap[loc.id] = locOrders;

            const allMerged = Object.values(branchOrdersMap).flat().sort((a: any, b: any) => {
              const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
              const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
              return timeB - timeA;
            });
            set({ orders: allMerged, isLoading: false });
          },
          (err) => {
            console.warn(`Error fetching orders for ${loc.name}:`, err);
          }
        );
        unsubs.push(unsub);
      });

      return () => {
        unsubs.forEach(u => u());
      };
    }

    // Branch specific subscription
    if (!targetLocId) {
      set({ orders: [], isLoading: false });
      return () => {};
    }

    const locObj = locations.find(l => l.id === targetLocId);
    const q = query(
      collection(db, 'tenants', tenant.id, 'locations', targetLocId, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const orders: Order[] = [];
        snapshot.forEach((doc) => {
          orders.push({ ...doc.data(), id: doc.id, locationName: locObj?.name } as any);
        });
        set({ orders, isLoading: false });
      },
      (error) => {
        console.warn("Error fetching branch orders:", error);
        set({ isLoading: false });
      }
    );

    return unsubscribe;
  },
}));
