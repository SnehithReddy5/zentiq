import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TenantProfile, TenantBranding, TenantFeatures, Location } from '../types/tenant.types';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../services/firebase/config';

interface TenantState {
  tenant: TenantProfile | null;
  branding: TenantBranding | null;
  features: TenantFeatures;
  locations: Location[];
  activeLocationId: string | null;
  isLoading: boolean;
  setTenant: (tenant: TenantProfile | null) => void;
  setBranding: (branding: TenantBranding | null) => void;
  setFeatures: (features: Partial<TenantFeatures>) => void;
  setLocations: (locations: Location[]) => void;
  setActiveLocationId: (locationId: string | null) => void;
  setLoading: (loading: boolean) => void;
  resetTenant: () => void;
  getActiveLocation: () => Location | null;
  subscribeToActiveTenant: (tenantId: string) => () => void;
}

const defaultFeatures: TenantFeatures = {
  tablesEnabled: true,
  multiLocationEnabled: true,
  kitchenPrinterEnabled: true,
  inventoryEnabled: false,
  splitPaymentsEnabled: true,
  insightsEnabled: true,
};

const defaultBranding: TenantBranding = {
  businessName: 'Zentiq Restaurant',
  displayName: 'Zentiq POS',
  phone: '',
  email: '',
  address: '',
  receiptHeader: 'ZENTIQ RESTAURANT POS',
  receiptFooter: 'Thank You & Visit Again!!',
};

export const useTenantStore = create<TenantState>()(
  persist(
    (set, get) => ({
      tenant: null,
      branding: defaultBranding,
      features: defaultFeatures,
      locations: [],
      activeLocationId: null,
      isLoading: false,

      setTenant: (tenant) => set({ tenant }),
      setBranding: (branding) => set({ branding: branding ? { ...defaultBranding, ...branding } : defaultBranding }),
      setFeatures: (features) => set({ features: { ...get().features, ...features } }),
      setLocations: (locations) => {
        const currentActive = get().activeLocationId;
        const validActive = locations.find(l => l.id === currentActive);
        set({
          locations,
          activeLocationId: validActive ? currentActive : (locations[0]?.id || null)
        });
      },
      setActiveLocationId: (activeLocationId) => set({ activeLocationId }),
      setLoading: (isLoading) => set({ isLoading }),
      resetTenant: () => set({
        tenant: null,
        branding: defaultBranding,
        features: defaultFeatures,
        locations: [],
        activeLocationId: null,
      }),
      getActiveLocation: () => {
        const { locations, activeLocationId } = get();
        return locations.find(l => l.id === activeLocationId) || locations[0] || null;
      },

      // Real-time listener: immediately syncs status changes (DEACTIVATED/ACTIVE), features (tablesEnabled), and branding
      subscribeToActiveTenant: (tenantId: string) => {
        // 1. Tenant profile & status listener
        const unsubProfile = onSnapshot(doc(db, 'tenants', tenantId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as TenantProfile;
            set({ tenant: { ...data, id: docSnap.id } });
          }
        });

        // 2. Features listener (tablesEnabled, multiLocationEnabled)
        const unsubFeatures = onSnapshot(doc(db, 'tenants', tenantId, 'features', 'config'), (featSnap) => {
          if (featSnap.exists()) {
            const fData = featSnap.data() as TenantFeatures;
            set((state) => ({ features: { ...state.features, ...fData } }));
          }
        });

        // 3. Branding listener
        const unsubBranding = onSnapshot(doc(db, 'tenants', tenantId, 'branding', 'config'), (bSnap) => {
          if (bSnap.exists()) {
            const bData = bSnap.data() as TenantBranding;
            set({ branding: bData });
          }
        });

        // 4. Locations listener
        const qLoc = query(collection(db, 'tenants', tenantId, 'locations'), where('status', '==', 'ACTIVE'));
        const unsubLocations = onSnapshot(qLoc, (snap) => {
          const locs: Location[] = [];
          snap.forEach(d => locs.push({ ...d.data(), id: d.id } as Location));
          const currentActive = get().activeLocationId;
          const { user } = require('./auth.store').useAuthStore.getState();
          const isClientAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';
          const assigned = user?.assignedLocationId || (user?.locationIds && user.locationIds[0] !== '*' ? user.locationIds[0] : null);

          let finalActive = currentActive;
          if (!isClientAdmin && assigned) {
            finalActive = assigned;
          } else if (!locs.some(l => l.id === finalActive)) {
            finalActive = locs[0]?.id || null;
          }

          set({
            locations: locs,
            activeLocationId: finalActive
          });
        });

        return () => {
          unsubProfile();
          unsubFeatures();
          unsubBranding();
          unsubLocations();
        };
      },
    }),
    {
      name: 'tenant-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
