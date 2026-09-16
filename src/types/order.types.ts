export type OrderType = 'DINE_IN' | 'PICKUP' | 'TAKEAWAY' | 'dine-in' | 'pickup';

export type OrderStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'running' | 'completed' | 'cancelled';

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'OTHER';

export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  timestamp: any;
  reference?: string;
}

export interface OrderItem {
  id?: string;
  orderId?: string;
  itemId: string;
  variantId?: string;
  itemName: string;
  variantName?: string;
  qty: number;
  sentQty?: number;
  price: number;
  note?: string;
  baseItemId?: string; // Links variant cart item back to master inventory item
  portionDeduction?: number; // Stock deduction per 1 unit sold (e.g. 0.5 kg)
}

export interface Order {
  id: string;
  orderNumber?: number;
  kotNo: number;
  tenantId?: string;
  locationId?: string;
  locationName?: string;
  orderType: OrderType;
  tableId?: string | null;
  tableNo: number; // 0 for pickup/takeaway or table-free dine-in
  captainId: string;
  captainName: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  payments?: OrderPayment[];
  items: OrderItem[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  totalAmount: number;
  specialNote?: string;
  createdBy?: string;
  createdAt: any;
  updatedAt?: any;
}
