import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

interface ThemeState {
  themeMode: ThemeMode;
  theme?: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeMode: 'dark',
      theme: 'dark',
      setThemeMode: (themeMode: ThemeMode) => set({ themeMode, theme: themeMode }),
      toggleTheme: () => {
        const next = get().themeMode === 'dark' ? 'light' : 'dark';
        set({ themeMode: next, theme: next });
      },
    }),
    {
      name: 'zentiq-theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

