export interface MenuItemVariant {
  id: string;
  menuItemId?: string;
  name: string;
  price: number;
  active?: boolean;
  recipeId?: string;
  portionDeduction?: number; // Amount deducted from root item stock per unit sold (e.g. 0.5 kg for 500gm)
}

export interface MenuCategory {
  id: string;
  tenantId?: string;
  locationId?: string;
  name: string;
  sortOrder?: number;
  active?: boolean;
}

export interface MenuItem {
  id: string;
  tenantId?: string;
  locationId?: string;
  categoryId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  active?: boolean;
  isFavorite?: boolean;
  sku?: string;
  description?: string;
  variants?: MenuItemVariant[];
  // Live Inventory Tracking
  trackInventory?: boolean;
  stockQuantity?: number;
  stockUnit?: 'kg' | 'g' | 'pcs' | 'portions' | 'ltr' | 'ml';
  lowStockThreshold?: number;
}
