export type ItemInteractionType = 'DIRECT_ADD' | 'VARIANT_SELECTION' | 'CUSTOMIZABLE';

export interface CustomizationOption {
  id: string;
  name: string;
  price: number; // Additional price in currency, 0 for free
  isDefault?: boolean;
}

export interface CustomizationGroup {
  id: string;
  name: string; // e.g. "Bread Type", "Spice Level", "Add-on Toppings"
  minSelect?: number; // 0 for optional, 1 for mandatory single-select, >1 for mandatory multi-select
  maxSelect?: number; // 1 for radio single-select, >1 for multi-select checkboxes
  options: CustomizationOption[];
}

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
  interactionType?: ItemInteractionType;
  variants?: MenuItemVariant[];
  customizationGroups?: CustomizationGroup[];
  // Live Inventory Tracking
  trackInventory?: boolean;
  stockQuantity?: number;
  stockUnit?: 'kg' | 'g' | 'pcs' | 'portions' | 'ltr' | 'ml';
  lowStockThreshold?: number;
}

export const getItemInteractionType = (item: MenuItem): ItemInteractionType => {
  if (item.interactionType) return item.interactionType;
  if (item.customizationGroups && item.customizationGroups.length > 0) return 'CUSTOMIZABLE';
  if (item.variants && item.variants.length > 0) return 'VARIANT_SELECTION';
  return 'DIRECT_ADD';
};
