import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types/auth.types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        try {
          require('./order.store').useOrderStore.getState().resetOrders();
          require('./table.store').useTableStore.getState().resetTables();
          require('./menu.store').useMenuStore.getState().resetMenu();
          require('./cart.store').useCartStore.getState().resetLocalCarts();
          require('./tenant.store').useTenantStore.getState().resetTenant();
        } catch (e) {
          console.warn('Error resetting stores on logout:', e);
        }
        set({ user: null, isLoading: false });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
