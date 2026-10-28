export type CKDeliveryShift = 'MORNING_PREP_6AM' | 'LUNCH_PREP_11AM' | 'DINNER_PREP_6PM';

export type CKOrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'DISPATCHED'
  | 'DELIVERED';

export type CKPaymentStatus = 'UNPAID' | 'PAID' | 'ON_CREDIT';

export type CKPartnerStatus = 'APPROVED' | 'PENDING' | 'BLOCKED';

export interface CKPartner {
  tenantId: string;
  locationId?: string;
  businessName: string;
  contactNumber?: string;
  status: CKPartnerStatus;
  isInternalBranch?: boolean;
  approvedAt?: any;
  createdAt: any;
}

export interface CKProfile {
  id: string; // tenantId
  tenantId: string;
  locationId: string;
  businessName: string;
  partnerCode: string; // e.g. "VSD-CK-88"
  fssaiNumber?: string;
  gstin?: string;
  whitelistedPartners: CKPartner[];
  updatedAt?: any;
  createdAt?: any;
}

export interface CKMenuItem {
  id: string;
  ckTenantId: string;
  name: string; // e.g. "Special Butter Chicken Gravy", "Dum Biryani Base (10 kg Deg)"
  category: string; // e.g. "Gravies & Curries", "Rice & Biryani", "Marinated Meats", "Bakery & Breads"
  unit: string; // "kg", "litres", "deg", "portions", "pcs"
  pricePerUnit: number; // Wholesale B2B rate ₹
  minOrderQty: number; // MOQ, e.g. 5 kg
  isAvailable: boolean; // Out of stock toggle
  description?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CKOrderItem {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  ratePerUnit: number;
  amount: number;
}

export interface CKOrder {
  id: string;
  orderNumber: string; // e.g. "CK-2026-0001"
  sellerTenantId: string;
  sellerLocationId: string;
  sellerBusinessName: string;
  buyerTenantId: string;
  buyerLocationId: string;
  buyerBusinessName: string;
  isInternalBranch: boolean; // true if same tenant/brand group
  deliveryShift: CKDeliveryShift;
  shiftDate: string; // e.g. "2026-10-11"
  notes?: string;
  items: CKOrderItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: CKOrderStatus;
  rejectionReason?: string;
  paymentStatus: CKPaymentStatus;
  paymentMode?: 'UPI' | 'NEFT' | 'CASH' | 'LEDGER';
  invoiceNumber?: string;
  paidAt?: any;
  cancelledAt?: any;
  cancellationReason?: string;
  dispatchedAt?: any;
  deliveredAt?: any;
  createdAt: any;
  updatedAt: any;
}
