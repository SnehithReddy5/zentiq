import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrinterSettings } from '../types/printer.types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';

interface PrinterState {
  settings: PrinterSettings;
  locationSettings: Record<string, PrinterSettings>;
  setSettings: (settings: PrinterSettings, locationId?: string | null) => void;
  saveSettingsToCloud: (tenantId: string, locationId?: string | null, userId?: string | null) => Promise<void>;
  fetchSettingsFromCloud: (tenantId: string, locationId?: string | null, userId?: string | null, forceOverwrite?: boolean) => Promise<void>;
  switchLocation: (locationId: string | null, tenantId?: string | null) => void;
}

const defaultPrinterSettings: PrinterSettings = {
  printerType: 'LAN',
  printerWorkflowMode: 'RESTAURANT',
  printerName: 'Billing Thermal Printer',
  ipAddress: '',
  port: 9100,
  kitchenPrinterType: 'LAN',
  kitchenPrinterName: '',
  kitchenIpAddress: '',
  kitchenPort: 9100,
  paperWidth: '80mm_48',
  kotNumberMode: 'CONTINUOUS',
};

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set, get) => ({
      settings: defaultPrinterSettings,
      locationSettings: {},

      setSettings: (settings, locationId) => {
        const activeLocId = locationId;
        if (activeLocId) {
          set((state) => ({
            settings,
            locationSettings: {
              ...state.locationSettings,
              [activeLocId]: settings,
            },
          }));
        } else {
          set({ settings });
        }
      },

      switchLocation: (locationId, tenantId) => {
        if (!locationId) return;
        const locSettings = get().locationSettings[locationId];
        if (locSettings) {
          set({ settings: { ...defaultPrinterSettings, ...locSettings } });
        } else {
          set({ settings: defaultPrinterSettings });
        }
        if (tenantId) {
          try {
            const { user } = require('./auth.store').useAuthStore.getState();
            get().fetchSettingsFromCloud(tenantId, locationId, user?.id);
          } catch (_) {}
        }
      },

      // Persist printer settings to Cloud Firestore scoped per location and user
      saveSettingsToCloud: async (tenantId: string, locationId?: string | null, userId?: string | null) => {
        if (!tenantId) return;
        try {
          const currentSettings = get().settings;
          // 1. Save user-specific printer doc so User A never overwrites User B in the same branch
          if (locationId && userId) {
            const userDocRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'userPrinters', userId);
            await setDoc(userDocRef, currentSettings, { merge: true });
          }
          // 2. Save branch isolation config
          if (locationId) {
            const locDocRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'settings', 'printer');
            await setDoc(locDocRef, currentSettings, { merge: true });
            const locMainRef = doc(db, 'tenants', tenantId, 'locations', locationId);
            await setDoc(locMainRef, { printerSettings: currentSettings }, { merge: true });

            // Store in local per-location map
            set((state) => ({
              locationSettings: {
                ...state.locationSettings,
                [locationId]: currentSettings,
              },
            }));
          } else {
            // 3. Global fallback (only if no location is selected)
            const tenantDocRef = doc(db, 'tenants', tenantId, 'settings', 'printer');
            await setDoc(tenantDocRef, currentSettings, { merge: true });
          }
        } catch (err) {
          console.warn('Could not save printer settings to cloud:', err);
        }
      },

      // Fetch printer settings safely per location without leaking other branch's printers
      fetchSettingsFromCloud: async (tenantId: string, locationId?: string | null, userId?: string | null, forceOverwrite = false) => {
        if (!tenantId) return;
        try {
          let cloudSettings: PrinterSettings | null = null;
          // 1. Try user-specific printer doc first
          if (locationId && userId) {
            const userDocRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'userPrinters', userId);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
              cloudSettings = userSnap.data() as PrinterSettings;
            }
          }
          // 2. Try location-specific printer doc
          if (!cloudSettings && locationId) {
            const locDocRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'settings', 'printer');
            const locSnap = await getDoc(locDocRef);
            if (locSnap.exists()) {
              cloudSettings = locSnap.data() as PrinterSettings;
            } else {
              const locMainRef = doc(db, 'tenants', tenantId, 'locations', locationId);
              const locMainSnap = await getDoc(locMainRef);
              if (locMainSnap.exists() && locMainSnap.data()?.printerSettings) {
                cloudSettings = locMainSnap.data()?.printerSettings as PrinterSettings;
              }
            }
          }
          // 3. Fallback to tenant global printer doc ONLY if no locationId specified
          if (!cloudSettings && !locationId) {
            const tenantDocRef = doc(db, 'tenants', tenantId, 'settings', 'printer');
            const tenantSnap = await getDoc(tenantDocRef);
            if (tenantSnap.exists()) {
              cloudSettings = tenantSnap.data() as PrinterSettings;
            }
          }

          if (cloudSettings) {
            const resolved = {
              ...defaultPrinterSettings,
              ...cloudSettings,
            };
            set((state) => ({
              settings: resolved,
              locationSettings: locationId ? {
                ...state.locationSettings,
                [locationId]: resolved,
              } : state.locationSettings,
            }));
          } else if (locationId && !get().locationSettings[locationId]) {
            // New branch with no printer configured yet - keep clean defaults
            set({ settings: defaultPrinterSettings });
          }
        } catch (err) {
          console.warn('Could not fetch printer settings from cloud:', err);
        }
      },
    }),
    {
      name: 'printer-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
