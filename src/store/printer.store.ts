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
        printerWorkflowMode: 'RESTAURANT',
        printerName: 'Billing Thermal Printer',
        ipAddress: '',
        port: 9100,
        kitchenIpAddress: '',
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
