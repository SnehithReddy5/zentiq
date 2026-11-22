import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TenantProfile, TenantBranding, TenantFeatures, Location } from '../types/tenant.types';
import { doc, onSnapshot, collection, query, where, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';

interface TenantState {
  tenant: TenantProfile | null;
  branding: TenantBranding | null;
  tenantFeatures: TenantFeatures;
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
  getEffectiveFeatures: (locationId?: string | null) => TenantFeatures;
  subscribeToActiveTenant: (tenantId: string) => () => void;
}

export const computeEffectiveFeatures = (
  baseFeatures: TenantFeatures,
  location?: Location | null
): TenantFeatures => {
  if (!location || !location.features) {
    return { ...defaultFeatures, ...baseFeatures };
  }
  return {
    ...defaultFeatures,
    ...baseFeatures,
    ...location.features,
  };
};

const defaultFeatures: TenantFeatures = {
  tablesEnabled: true,
  multiLocationEnabled: true,
  kitchenPrinterEnabled: true,
  inventoryEnabled: false,
  splitPaymentsEnabled: true,
  insightsEnabled: true,
  paymentsEnabled: true,
  cashEnabled: true,
  upiEnabled: true,
  cardEnabled: true,
  customPaymentMethods: [],
  gstEnabled: true,
  gstType: 'INCLUSIVE',
  cgstRate: 2.5,
  sgstRate: 2.5,
  autoMenuImagesEnabled: false,
};

const defaultBranding: TenantBranding = {
  businessName: 'Zentiq Restaurant',
  displayName: 'Zentiq POS',
  phone: '',
  email: '',
  address: '',
  receiptHeader: 'ZENTIQ RESTAURANT POS',
  receiptFooter: 'Thank You & Visit Again!!',
  gstEnabled: true,
  gstType: 'INCLUSIVE',
  cgstRate: 2.5,
  sgstRate: 2.5,
  autoMenuImagesEnabled: false,
};

export const useTenantStore = create<TenantState>()(
  persist(
    (set, get) => ({
      tenant: null,
      branding: defaultBranding,
      tenantFeatures: defaultFeatures,
      features: defaultFeatures,
      locations: [],
      activeLocationId: null,
      isLoading: false,

      setTenant: (tenant) => set({ tenant }),
      setBranding: (branding) => set({ branding: branding ? { ...defaultBranding, ...branding } : defaultBranding }),
      setFeatures: (newFeat) => {
        const currentActive = get().activeLocationId;
        const currentFeatures = get().features;
        const mergedFeatures = { ...currentFeatures, ...newFeat };
        if (currentActive) {
          const updatedLocs = get().locations.map(loc =>
            loc.id === currentActive
              ? { ...loc, features: { ...(loc.features || {}), ...newFeat } }
              : loc
          );
          set({ features: mergedFeatures, locations: updatedLocs });
        } else {
          set({
            tenantFeatures: { ...get().tenantFeatures, ...newFeat },
            features: mergedFeatures,
          });
        }
      },
      setLocations: (locations) => {
        const currentActive = get().activeLocationId;
        const validActive = locations.find(l => l.id === currentActive);
        const finalActive = validActive ? currentActive : (locations[0]?.id || null);
        const activeLoc = locations.find(l => l.id === finalActive) || null;
        set({
          locations,
          activeLocationId: finalActive,
          features: computeEffectiveFeatures(get().tenantFeatures, activeLoc),
        });
      },
      setActiveLocationId: (activeLocationId) => {
        const activeLoc = get().locations.find(l => l.id === activeLocationId) || null;
        const effective = computeEffectiveFeatures(get().tenantFeatures, activeLoc);
        set({
          activeLocationId,
          features: effective,
        });
        try {
          const { user } = require('./auth.store').useAuthStore.getState();
          const currentTenantId = get().tenant?.id || user?.tenantId;
          if (user?.id && activeLocationId) {
            if (currentTenantId) {
              setDoc(doc(db, 'tenants', currentTenantId, 'users', user.id), { lastActiveLocationId: activeLocationId }, { merge: true }).catch(() => {});
              const { usePrinterStore } = require('./printer.store');
              usePrinterStore.getState().switchLocation(activeLocationId, currentTenantId);
            }
            setDoc(doc(db, 'users', user.id), { lastActiveLocationId: activeLocationId }, { merge: true }).catch(() => {});
          }
        } catch (e) {}
      },
      setLoading: (isLoading) => set({ isLoading }),
      resetTenant: () => set({
        tenant: null,
        branding: defaultBranding,
        tenantFeatures: defaultFeatures,
        features: defaultFeatures,
        locations: [],
        activeLocationId: null,
      }),
      getActiveLocation: () => {
        const { locations, activeLocationId } = get();
        return locations.find(l => l.id === activeLocationId) || locations[0] || null;
      },
      getEffectiveFeatures: (locationId) => {
        const targetId = locationId || get().activeLocationId;
        const loc = get().locations.find(l => l.id === targetId) || null;
        return computeEffectiveFeatures(get().tenantFeatures, loc);
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
            const updatedTenantFeat = { ...get().tenantFeatures, ...fData };
            const activeLoc = get().getActiveLocation();
            set({
              tenantFeatures: updatedTenantFeat,
              features: computeEffectiveFeatures(updatedTenantFeat, activeLoc),
            });
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
          const userAssigned = user?.assignedLocationId;
          const hasGlobalWildcard = user?.locationIds?.includes('*');
          const isBranchScoped = !!userAssigned && !hasGlobalWildcard;

          let finalActive = currentActive;
          if (isBranchScoped && locs.some(l => l.id === userAssigned)) {
            // Strictly enforce branch assignment for branch-scoped admins and staff
            finalActive = userAssigned;
          } else if (!finalActive && user?.lastActiveLocationId && locs.some(l => l.id === user.lastActiveLocationId)) {
            finalActive = user.lastActiveLocationId;
          } else if (userAssigned && !finalActive && locs.some(l => l.id === userAssigned)) {
            finalActive = userAssigned;
          } else if (!locs.some(l => l.id === finalActive)) {
            finalActive = (user?.lastActiveLocationId && locs.some(l => l.id === user.lastActiveLocationId))
              ? user.lastActiveLocationId
              : (userAssigned && locs.some(l => l.id === userAssigned))
                ? userAssigned
                : (locs[0]?.id || null);
          }

          const activeLoc = locs.find(l => l.id === finalActive) || locs[0] || null;
          const effectiveFeat = computeEffectiveFeatures(get().tenantFeatures, activeLoc);

          set({
            locations: locs,
            activeLocationId: finalActive,
            features: effectiveFeat,
          });

          // Cloud sync printer settings for the active location
          if (finalActive && tenantId) {
            try {
              const { usePrinterStore } = require('./printer.store');
              usePrinterStore.getState().switchLocation(finalActive, tenantId);
            } catch (err) {}
          }
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
