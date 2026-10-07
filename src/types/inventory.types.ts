export interface InventoryItem {
  id: string;
  name: string;              // e.g. "Basmati Rice", "Sunflower Cooking Oil", "Kitchen Spices"
  category: string;          // e.g. "Grains & Rice", "Oils & Ghee", "Spices & Seasoning", "Dairy", "Produce"
  unit: string;              // e.g. "kg", "packets", "litres", "grams", "cans", "boxes", "pcs"
  currentStock: number;      // Current active balance available in storage
  totalReceived: number;     // Cumulative load received from suppliers
  totalIssued: number;       // Cumulative taken / issued to kitchen
  minThreshold: number;      // Low stock alert trigger (e.g. 10 kg)
  costPerUnit?: number;      // Purchase cost per unit (e.g. ₹50)
  supplier?: string;         // Default vendor / supplier
  lastRestockedAt?: any;
  lastIssuedAt?: any;
  createdAt: any;
  updatedAt: any;
}

export type InventoryLogType = 'STOCK_IN' | 'KITCHEN_ISSUE' | 'WASTAGE' | 'ADJUSTMENT';

export interface InventoryLog {
  id: string;
  itemId: string;
  itemName: string;
  type: InventoryLogType;
  quantity: number;
  unit: string;
  previousStock: number;
  newStock: number;
  notes?: string;            // e.g. "Received from Metro Vendor", "Issued for lunch shift prep"
  recordedBy?: string;       // Staff / Chef / Manager name
  createdAt: any;
}
