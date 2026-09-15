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

export const useMenuStore = create<MenuState>((set) => ({
  categories: [],
  items: [],
  isLoadingCategories: true,
  isLoadingItems: true,
  setCategories: (categories) => set({ categories }),
  setItems: (items) => set({ items }),
  subscribeToMenu: () => {
    set({ isLoadingCategories: true, isLoadingItems: true });
    const { tenant, activeLocationId } = useTenantStore.getState();

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

    return () => {
      unsubCategories();
      unsubItems();
    };
  },
}));
