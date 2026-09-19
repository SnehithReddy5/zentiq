import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrinterSettings } from '../types/printer.types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';

interface PrinterState {
  settings: PrinterSettings;
  setSettings: (settings: PrinterSettings) => void;
  saveSettingsToCloud: (tenantId: string, locationId?: string | null) => Promise<void>;
  fetchSettingsFromCloud: (tenantId: string, locationId?: string | null) => Promise<void>;
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

      // Persist printer settings to Cloud Firestore so they survive app reinstallation
      saveSettingsToCloud: async (tenantId: string, locationId?: string | null) => {
        if (!tenantId) return;
        try {
          const currentSettings = get().settings;
          // 1. Save under location doc if locationId is given
          if (locationId) {
            const locDocRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'settings', 'printer');
            await setDoc(locDocRef, currentSettings, { merge: true });
          }
          // 2. Also save to tenant global printer fallback
          const tenantDocRef = doc(db, 'tenants', tenantId, 'settings', 'printer');
          await setDoc(tenantDocRef, currentSettings, { merge: true });
        } catch (err) {
          console.warn('Could not save printer settings to cloud:', err);
        }
      },

      // Fetch printer settings from Cloud Firestore on login or app reinstall
      fetchSettingsFromCloud: async (tenantId: string, locationId?: string | null) => {
        if (!tenantId) return;
        try {
          let cloudSettings: PrinterSettings | null = null;
          // 1. Try location-specific printer doc first
          if (locationId) {
            const locDocRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'settings', 'printer');
            const locSnap = await getDoc(locDocRef);
            if (locSnap.exists()) {
              cloudSettings = locSnap.data() as PrinterSettings;
            }
          }
          // 2. Fallback to tenant global printer doc
          if (!cloudSettings || !cloudSettings.ipAddress) {
            const tenantDocRef = doc(db, 'tenants', tenantId, 'settings', 'printer');
            const tenantSnap = await getDoc(tenantDocRef);
            if (tenantSnap.exists()) {
              cloudSettings = tenantSnap.data() as PrinterSettings;
            }
          }

          if (cloudSettings && cloudSettings.ipAddress) {
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
