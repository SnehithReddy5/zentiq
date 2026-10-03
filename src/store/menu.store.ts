import { create } from 'zustand';
import { MenuCategory, MenuItem } from '../types/menu.types';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useTenantStore } from './tenant.store';

interface MenuState {
  categories: MenuCategory[];
  items: MenuItem[];
  isLoadingCategories: boolean;
  isLoadingItems: boolean;
  setCategories: (categories: MenuCategory[]) => void;
  setItems: (items: MenuItem[]) => void;
  subscribeToMenu: () => () => void;
}

// Singleton listener state to prevent duplicate listeners
let activeMenuUnsub: (() => void) | null = null;
let currentMenuLocKey: string | null = null;
let menuSubscribersCount = 0;

export const useMenuStore = create<MenuState>((set) => ({
  categories: [],
  items: [],
  isLoadingCategories: true,
  isLoadingItems: true,
  setCategories: (categories) => set({ categories }),
  setItems: (items) => set({ items }),
  subscribeToMenu: () => {
    const { tenant, activeLocationId } = useTenantStore.getState();
    const locKey = `${tenant?.id || 'none'}_${activeLocationId || 'none'}`;

    // Reuse existing listener if already active
    if (activeMenuUnsub && currentMenuLocKey === locKey) {
      menuSubscribersCount++;
      return () => {
        menuSubscribersCount--;
        if (menuSubscribersCount <= 0 && activeMenuUnsub) {
          activeMenuUnsub();
          activeMenuUnsub = null;
          currentMenuLocKey = null;
          menuSubscribersCount = 0;
        }
      };
    }

    if (activeMenuUnsub) {
      activeMenuUnsub();
      activeMenuUnsub = null;
      menuSubscribersCount = 0;
    }

    set({ isLoadingCategories: true, isLoadingItems: true });
    currentMenuLocKey = locKey;
    menuSubscribersCount = 1;

    let catCol;
    let itemsCol;

    if (tenant?.id && activeLocationId) {
      catCol = collection(db, 'tenants', tenant.id, 'locations', activeLocationId, 'menuCategories');
      itemsCol = collection(db, 'tenants', tenant.id, 'locations', activeLocationId, 'menuItems');
    } else {
      catCol = collection(db, 'menuCategories');
      itemsCol = collection(db, 'menuItems');
    }

    const qCat = query(catCol, orderBy('name', 'asc'));
    const unsubCategories = onSnapshot(
      qCat,
      (snapshot) => {
        const categories: MenuCategory[] = [];
        snapshot.forEach((doc) => {
          categories.push({ ...doc.data(), id: doc.id } as MenuCategory);
        });
        set({ categories, isLoadingCategories: false });
      },
      (err) => {
        console.warn("Error fetching categories:", err);
        set({ isLoadingCategories: false });
      }
    );

    const qItems = query(itemsCol, orderBy('name', 'asc'));
    const unsubItems = onSnapshot(
      qItems,
      (snapshot) => {
        const items: MenuItem[] = [];
        snapshot.forEach((doc) => {
          items.push({ ...doc.data(), id: doc.id } as MenuItem);
        });
        set({ items, isLoadingItems: false });
      },
      (err) => {
        console.warn("Error fetching menu items:", err);
        set({ isLoadingItems: false });
      }
    );

    activeMenuUnsub = () => {
      unsubCategories();
      unsubItems();
    };

    return () => {
      menuSubscribersCount--;
      if (menuSubscribersCount <= 0 && activeMenuUnsub) {
        activeMenuUnsub();
        activeMenuUnsub = null;
        currentMenuLocKey = null;
        menuSubscribersCount = 0;
      }
    };
  },
}));
