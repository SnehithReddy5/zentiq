export interface MenuItemVariant {
  id: string;
  menuItemId?: string;
  name: string;
  price: number;
  active?: boolean;
  recipeId?: string;
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
}
