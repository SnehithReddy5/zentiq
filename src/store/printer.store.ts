import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrinterSettings } from '../types/printer.types';

interface PrinterState {
  settings: PrinterSettings;
  setSettings: (settings: PrinterSettings) => void;
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      settings: {
        printerType: 'LAN',
        printerName: 'Billing Thermal Printer',
        ipAddress: '192.168.1.100',
        port: 9100,
        kitchenIpAddress: '192.168.1.101',
        kitchenPort: 9100,
      },
      setSettings: (settings) => set({ settings }),
    }),
    {
      name: 'printer-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
