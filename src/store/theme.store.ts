import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

interface ThemeState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeMode: 'dark',
      setThemeMode: (themeMode: ThemeMode) => set({ themeMode }),
      toggleTheme: () => set({ themeMode: get().themeMode === 'dark' ? 'light' : 'dark' }),
    }),
    {
      name: 'zentiq-theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

