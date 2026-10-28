import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrinterSettings } from '../types/printer.types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';

interface PrinterState {
  settings: PrinterSettings;
  setSettings: (settings: PrinterSettings) => void;
  saveSettingsToCloud: (tenantId: string, locationId?: string | null, userId?: string | null) => Promise<void>;
  fetchSettingsFromCloud: (tenantId: string, locationId?: string | null, userId?: string | null, forceOverwrite?: boolean) => Promise<void>;
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set, get) => ({
      settings: {
        printerType: 'LAN',
        printerWorkflowMode: 'RESTAURANT',
        printerName: 'Billing Thermal Printer',
        ipAddress: '',
        port: 9100,
        kitchenIpAddress: '',
        kitchenPort: 9100,
      },
      setSettings: (settings) => set({ settings }),

      // Persist printer settings to Cloud Firestore scoped per user/station so users never disturb each other
      saveSettingsToCloud: async (tenantId: string, locationId?: string | null, userId?: string | null) => {
        if (!tenantId) return;
        try {
          const currentSettings = get().settings;
          // 1. Save user-specific printer doc so User A never overwrites User B in the same branch
          if (locationId && userId) {
            const userDocRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'userPrinters', userId);
            await setDoc(userDocRef, currentSettings, { merge: true });
          }
          // 2. Save branch fallback
          if (locationId) {
            const locDocRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'settings', 'printer');
            await setDoc(locDocRef, currentSettings, { merge: true });
          }
          // 3. Global fallback
          const tenantDocRef = doc(db, 'tenants', tenantId, 'settings', 'printer');
          await setDoc(tenantDocRef, currentSettings, { merge: true });
        } catch (err) {
          console.warn('Could not save printer settings to cloud:', err);
        }
      },

      // Fetch printer settings safely without disturbing active device-level settings
      fetchSettingsFromCloud: async (tenantId: string, locationId?: string | null, userId?: string | null, forceOverwrite = false) => {
        if (!tenantId) return;
        try {
          // Device-level protection: If this physical device ALREADY has its own working printer configured in AsyncStorage,
          // DO NOT overwrite or disturb it with another user's cloud settings!
          const current = get().settings;
          const hasLocalPrinter = (current.printerType === 'USB' && current.printerName) ||
                                  (current.ipAddress && current.ipAddress.trim().length > 0);
          if (hasLocalPrinter && !forceOverwrite) {
            return;
          }

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
            }
          }
          // 3. Fallback to tenant global printer doc
          if (!cloudSettings || (!cloudSettings.ipAddress && cloudSettings.printerType !== 'USB')) {
            const tenantDocRef = doc(db, 'tenants', tenantId, 'settings', 'printer');
            const tenantSnap = await getDoc(tenantDocRef);
            if (tenantSnap.exists()) {
              cloudSettings = tenantSnap.data() as PrinterSettings;
            }
          }

          if (cloudSettings && (cloudSettings.ipAddress || cloudSettings.printerType === 'USB')) {
            set((state) => ({
              settings: {
                ...state.settings,
                ...cloudSettings,
                ipAddress: cloudSettings.ipAddress || state.settings.ipAddress,
                port: cloudSettings.port || state.settings.port,
                kitchenIpAddress: cloudSettings.kitchenIpAddress !== undefined ? cloudSettings.kitchenIpAddress : state.settings.kitchenIpAddress,
                kitchenPort: cloudSettings.kitchenPort || state.settings.kitchenPort,
                printerWorkflowMode: cloudSettings.printerWorkflowMode || state.settings.printerWorkflowMode,
              },
            }));
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
