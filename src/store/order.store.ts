import { create } from 'zustand';
import { Order } from '../types/order.types';
import { collection, onSnapshot, query, orderBy, limit, where, getCountFromServer, getAggregateFromServer, count, sum } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from './tenant.store';

const DEFAULT_LIVE_ORDER_LIMIT = 150;

export interface ServerOrderStats {
  totalOrdersCount: number;
  totalRevenue: number;
  dineInCount: number;
  pickupCount: number;
  takeawayCount: number;
  counterCount: number;
  onlineCount: number;
}

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  totalOrdersCount: number | null;
  serverStats: ServerOrderStats | null;
  currentLimit: number;
  setOrders: (orders: Order[]) => void;
  setLoading: (isLoading: boolean) => void;
  subscribeToOrders: (specificLocationId?: string | null, customLimit?: number | null) => () => void;
  loadMoreOrders: () => void;
  fetchTotalOrdersCount: (locationId?: string | null) => Promise<number>;
  resetOrders: () => void;
}

// Singleton listener state to prevent duplicate listeners
let activeOrdersUnsub: (() => void) | null = null;
let currentSubscribedKey: string | null = null;
let currentSubscribedLocId: string | null = null;
let orderSubscribersCount = 0;

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  isLoading: true,
  totalOrdersCount: null,
  serverStats: null,
  currentLimit: DEFAULT_LIVE_ORDER_LIMIT,
  setOrders: (orders) => set({ orders }),
  setLoading: (isLoading) => set({ isLoading }),
  resetOrders: () => {
    if (activeOrdersUnsub) {
      try { activeOrdersUnsub(); } catch (_) {}
      activeOrdersUnsub = null;
    }
    currentSubscribedKey = null;
    currentSubscribedLocId = null;
    orderSubscribersCount = 0;
    set({
      orders: [],
      isLoading: false,
      totalOrdersCount: null,
      serverStats: null,
      currentLimit: DEFAULT_LIVE_ORDER_LIMIT,
    });
  },

  fetchTotalOrdersCount: async (locationId?: string | null) => {
    const { tenant, activeLocationId, locations } = useTenantStore.getState();
    const targetLocId = locationId !== undefined ? locationId : activeLocationId;
    if (!tenant?.id) return 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const fetchColStats = async (colRef: any) => {
      const [
        allAgg,
        cancelC,
        todayC,
        dineUpper,
        dineLower,
        pickUpper,
        pickLower,
        takeC,
        counterC,
        quickC,
        zomC,
        swigC,
      ] = await Promise.all([
        getAggregateFromServer(colRef, { c: count(), r: sum('totalAmount') }).catch(() => null),
        getCountFromServer(query(colRef, where('status', '==', 'CANCELLED'))).catch(() => null),
        getCountFromServer(query(colRef, where('createdAt', '>=', startOfToday))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'DINE_IN'))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'dine-in'))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'PICKUP'))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'pickup'))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'TAKEAWAY'))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'COUNTER'))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'QUICK_SALE'))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'ONLINE_ZOMATO'))).catch(() => null),
        getCountFromServer(query(colRef, where('orderType', '==', 'ONLINE_SWIGGY'))).catch(() => null),
      ]);

      const rawTotal = Number(allAgg?.data()?.c || 0);
      const cancelled = Number(cancelC?.data()?.count || 0);
      const validTotal = Math.max(0, rawTotal - cancelled);
      const totalRevenue = Number(allAgg?.data()?.r || 0);
      const todayCount = Number(todayC?.data()?.count || 0);

      return {
        totalOrdersCount: validTotal,
        totalRevenue,
        todayCount,
        dineInCount: Number(dineUpper?.data()?.count || 0) + Number(dineLower?.data()?.count || 0),
        pickupCount: Number(pickUpper?.data()?.count || 0) + Number(pickLower?.data()?.count || 0),
        takeawayCount: Number(takeC?.data()?.count || 0),
        counterCount: Number(counterC?.data()?.count || 0) + Number(quickC?.data()?.count || 0),
        onlineCount: Number(zomC?.data()?.count || 0) + Number(swigC?.data()?.count || 0),
      };
    };

    try {
      let combined: ServerOrderStats & { todayCount: number };

      if (targetLocId === 'ALL') {
        const activeLocs = locations.filter(l => l.status !== 'DISABLED');
        if (activeLocs.length === 0) {
          set({
            totalOrdersCount: 0,
            serverStats: { totalOrdersCount: 0, totalRevenue: 0, dineInCount: 0, pickupCount: 0, takeawayCount: 0, counterCount: 0, onlineCount: 0 },
          });
          return 0;
        }
        const perLoc = await Promise.all(
          activeLocs.map(loc =>
            fetchColStats(collection(db, 'tenants', tenant.id, 'locations', loc.id, 'orders')).catch(() => ({
              totalOrdersCount: 0, totalRevenue: 0, todayCount: 0,
              dineInCount: 0, pickupCount: 0, takeawayCount: 0, counterCount: 0, onlineCount: 0,
            }))
          )
        );
        combined = perLoc.reduce(
          (acc, cur) => ({
            totalOrdersCount: acc.totalOrdersCount + cur.totalOrdersCount,
            totalRevenue: acc.totalRevenue + cur.totalRevenue,
            todayCount: acc.todayCount + cur.todayCount,
            dineInCount: acc.dineInCount + cur.dineInCount,
            pickupCount: acc.pickupCount + cur.pickupCount,
            takeawayCount: acc.takeawayCount + cur.takeawayCount,
            counterCount: acc.counterCount + cur.counterCount,
            onlineCount: acc.onlineCount + cur.onlineCount,
          }),
          { totalOrdersCount: 0, totalRevenue: 0, todayCount: 0, dineInCount: 0, pickupCount: 0, takeawayCount: 0, counterCount: 0, onlineCount: 0 }
        );
      } else {
        const effectiveLocId = targetLocId || (locations.length > 0 ? locations[0].id : null);
        const colRef = effectiveLocId
          ? collection(db, 'tenants', tenant.id, 'locations', effectiveLocId, 'orders')
          : collection(db, 'tenants', tenant.id, 'orders');
        combined = await fetchColStats(colRef);
      }

      const { todayCount, ...statsOnly } = combined;
      set({
        totalOrdersCount: statsOnly.totalOrdersCount,
        serverStats: statsOnly,
      });

      // Auto-expand live window if a single day has more orders than currentLimit
      const currentLim = get().currentLimit;
      if (todayCount > currentLim) {
        const expandedLimit = todayCount + 40;
        set({ currentLimit: expandedLimit });
        if (activeOrdersUnsub) {
          activeOrdersUnsub();
          activeOrdersUnsub = null;
          orderSubscribersCount = 0;
        }
        get().subscribeToOrders(targetLocId, expandedLimit);
      }

      return statsOnly.totalOrdersCount;
    } catch (e) {
      console.warn('Error fetching total orders count:', e);
      return 0;
    }
  },

  loadMoreOrders: () => {
    const current = get().currentLimit || DEFAULT_LIVE_ORDER_LIMIT;
    const nextLimit = current + 250;
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
    const isNewTenant = Boolean(tenant?.id && currentSubscribedKey && !currentSubscribedKey.startsWith(`${tenant.id}::`));
    const baseLimit = isNewTenant ? DEFAULT_LIVE_ORDER_LIMIT : (get().currentLimit || DEFAULT_LIVE_ORDER_LIMIT);
    const orderLimit = (customLimit && customLimit > 0) ? customLimit : baseLimit;

    if (!tenant?.id) {
      set({ orders: [], isLoading: false, totalOrdersCount: 0, serverStats: null });
      return () => {};
    }

    const subKey = `${tenant.id}::${targetLocId || 'NONE'}::${orderLimit}`;

    // Trigger server-side exact count & aggregates in background
    get().fetchTotalOrdersCount(targetLocId);

    // If already subscribed to this exact tenant + location + limit, increment subscriber count and reuse listener
    if (activeOrdersUnsub && currentSubscribedKey === subKey) {
      orderSubscribersCount++;
      return () => {
        orderSubscribersCount--;
        if (orderSubscribersCount <= 0 && activeOrdersUnsub) {
          activeOrdersUnsub();
          activeOrdersUnsub = null;
          currentSubscribedKey = null;
          currentSubscribedLocId = null;
          orderSubscribersCount = 0;
        }
      };
    }

    // Clean up previous subscription if tenant or location changed
    if (activeOrdersUnsub) {
      activeOrdersUnsub();
      activeOrdersUnsub = null;
      orderSubscribersCount = 0;
    }

    const isSameTenant = currentSubscribedKey?.startsWith(`${tenant.id}::`);
    set({
      isLoading: true,
      ...(isSameTenant ? { currentLimit: orderLimit } : { orders: [], serverStats: null, currentLimit: orderLimit }),
    });
    currentSubscribedKey = subKey;
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

            const getMs = (o: any): number => {
              const raw = o?.createdAt;
              if (!raw) return 0;
              if (raw.seconds !== undefined) return raw.seconds * 1000;
              if (typeof raw === 'number') return raw;
              if (typeof raw.toMillis === 'function') return raw.toMillis();
              const parsed = Date.parse(raw);
              return Number.isNaN(parsed) ? 0 : parsed;
            };
            const allMerged = Object.values(branchOrdersMap).flat().sort((a: any, b: any) => getMs(b) - getMs(a));
            set({ orders: allMerged, isLoading: false });
          },
          (err) => {
            console.warn(`Error fetching orders for ${loc.name}:`, err);
            set({ isLoading: false });
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
          currentSubscribedKey = null;
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
        currentSubscribedKey = null;
        currentSubscribedLocId = null;
        orderSubscribersCount = 0;
      }
    };
  },
}));
