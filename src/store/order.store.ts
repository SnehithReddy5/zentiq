import { create } from 'zustand';
import { Order } from '../types/order.types';
import { collection, onSnapshot, query, orderBy, limit, getCountFromServer } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from './tenant.store';

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  totalOrdersCount: number | null;
  currentLimit: number | null;
  setOrders: (orders: Order[]) => void;
  setLoading: (isLoading: boolean) => void;
  subscribeToOrders: (specificLocationId?: string | null, customLimit?: number | null) => () => void;
  loadMoreOrders: () => void;
  fetchTotalOrdersCount: (locationId?: string | null) => Promise<number>;
}

// Singleton listener state to prevent duplicate listeners
let activeOrdersUnsub: (() => void) | null = null;
let currentSubscribedLocId: string | null = null;
let orderSubscribersCount = 0;

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  isLoading: true,
  totalOrdersCount: null,
  currentLimit: null, // Dynamic / unlimited by default (no hardcoded limits)
  setOrders: (orders) => set({ orders }),
  setLoading: (isLoading) => set({ isLoading }),

  fetchTotalOrdersCount: async (locationId?: string | null) => {
    const { tenant, activeLocationId, locations } = useTenantStore.getState();
    const targetLocId = locationId !== undefined ? locationId : activeLocationId;
    if (!tenant?.id) return 0;

    try {
      if (targetLocId === 'ALL') {
        const activeLocs = locations.filter(l => l.status !== 'DISABLED');
        if (activeLocs.length === 0) {
          set({ totalOrdersCount: 0 });
          return 0;
        }
        const counts = await Promise.all(
          activeLocs.map(async (loc) => {
            try {
              const snap = await getCountFromServer(
                collection(db, 'tenants', tenant.id, 'locations', loc.id, 'orders')
              );
              return snap.data().count;
            } catch (err) {
              console.warn(`Error counting orders for ${loc.name}:`, err);
              return 0;
            }
          })
        );
        const total = counts.reduce((sum, c) => sum + c, 0);
        set({ totalOrdersCount: total });
        return total;
      }

      const effectiveLocId = targetLocId || (locations.length > 0 ? locations[0].id : null);
      if (!effectiveLocId) {
        try {
          const snap = await getCountFromServer(
            collection(db, 'tenants', tenant.id, 'orders')
          );
          const total = snap.data().count;
          set({ totalOrdersCount: total });
          return total;
        } catch (_) {
          return 0;
        }
      }

      const snap = await getCountFromServer(
        collection(db, 'tenants', tenant.id, 'locations', effectiveLocId, 'orders')
      );
      const total = snap.data().count;
      set({ totalOrdersCount: total });
      return total;
    } catch (e) {
      console.warn('Error fetching total orders count:', e);
      return 0;
    }
  },

  loadMoreOrders: () => {
    const current = get().currentLimit;
    if (!current) return;
    const nextLimit = current + 500;
    set({ currentLimit: nextLimit });
    if (activeOrdersUnsub) {
      activeOrdersUnsub();
      activeOrdersUnsub = null;
      orderSubscribersCount = 0;
    }
    const loc = currentSubscribedLocId === 'NONE' ? undefined : (currentSubscribedLocId || undefined);
    get().subscribeToOrders(loc, nextLimit);
  },

  subscribeToOrders: (specificLocationId?: string | null, customLimit?: number | null) => {
    const { tenant, activeLocationId, locations } = useTenantStore.getState();
    const targetLocId = specificLocationId !== undefined ? specificLocationId : activeLocationId;
    const orderLimit = customLimit !== undefined ? customLimit : get().currentLimit;

    if (!tenant?.id) {
      set({ orders: [], isLoading: false, totalOrdersCount: 0 });
      return () => {};
    }

    // Trigger server-side exact count in background
    get().fetchTotalOrdersCount(targetLocId);

    // If already subscribed to this exact location & limit, increment subscriber count and reuse listener
    if (activeOrdersUnsub && currentSubscribedLocId === (targetLocId || 'NONE')) {
      orderSubscribersCount++;
      return () => {
        orderSubscribersCount--;
        if (orderSubscribersCount <= 0 && activeOrdersUnsub) {
          activeOrdersUnsub();
          activeOrdersUnsub = null;
          currentSubscribedLocId = null;
          orderSubscribersCount = 0;
        }
      };
    }

    // Clean up previous subscription if location changed
    if (activeOrdersUnsub) {
      activeOrdersUnsub();
      activeOrdersUnsub = null;
      orderSubscribersCount = 0;
    }

    set({ isLoading: true });
    currentSubscribedLocId = targetLocId || 'NONE';
    orderSubscribersCount = 1;

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
        const queryConstraints: any[] = [orderBy('createdAt', 'desc')];
        if (orderLimit && orderLimit > 0) {
          const branchLimit = Math.max(100, Math.floor(orderLimit / activeLocs.length));
          queryConstraints.push(limit(branchLimit));
        }

        const q = query(
          collection(db, 'tenants', tenant.id, 'locations', loc.id, 'orders'),
          ...queryConstraints
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

      const cleanupAll = () => {
        unsubs.forEach(u => u());
      };
      activeOrdersUnsub = cleanupAll;

      return () => {
        orderSubscribersCount--;
        if (orderSubscribersCount <= 0 && activeOrdersUnsub) {
          activeOrdersUnsub();
          activeOrdersUnsub = null;
          currentSubscribedLocId = null;
          orderSubscribersCount = 0;
        }
      };
    }

    // Branch specific subscription
    if (!targetLocId) {
      set({ orders: [], isLoading: false });
      return () => {};
    }

    const locObj = locations.find(l => l.id === targetLocId);
    const queryConstraints: any[] = [orderBy('createdAt', 'desc')];
    if (orderLimit && orderLimit > 0) {
      queryConstraints.push(limit(orderLimit));
    }

    const q = query(
      collection(db, 'tenants', tenant.id, 'locations', targetLocId, 'orders'),
      ...queryConstraints
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

    activeOrdersUnsub = unsubscribe;

    return () => {
      orderSubscribersCount--;
      if (orderSubscribersCount <= 0 && activeOrdersUnsub) {
        activeOrdersUnsub();
        activeOrdersUnsub = null;
        currentSubscribedLocId = null;
        orderSubscribersCount = 0;
      }
    };
  },
}));
