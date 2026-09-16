export type BusinessType = 'RESTAURANT' | 'CURRY_POINT' | 'TIFFIN_CENTER' | 'CAFE' | 'OTHER';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface TenantProfile {
  id: string;
  businessName: string;
  displayName: string;
  businessType: BusinessType;
  status: TenantStatus;
  multiLocationEnabled?: boolean;
  adminUsername?: string;
  adminPassword?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface TenantBranding {
  logoUrl?: string;
  businessName: string;
  displayName: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  state?: string;
  gstin?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  gstEnabled?: boolean;
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE';
  cgstRate?: number;
  sgstRate?: number;
}

export interface TenantFeatures {
  tablesEnabled: boolean;
  dineInEnabled?: boolean;
  pickupEnabled?: boolean;
  multiLocationEnabled: boolean;
  kitchenPrinterEnabled: boolean;
  inventoryEnabled: boolean;
  splitPaymentsEnabled: boolean;
  insightsEnabled: boolean;
  paymentsEnabled?: boolean;
  cashEnabled?: boolean;
  upiEnabled?: boolean;
  cardEnabled?: boolean;
  customPaymentMethods?: string[];
  gstEnabled?: boolean;
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE';
  cgstRate?: number;
  sgstRate?: number;
}

export type LocationStatus = 'REQUESTED' | 'APPROVED' | 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'DEACTIVATED';

export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  phone: string;
  status: LocationStatus;
  createdAt?: any;
  updatedAt?: any;
}

export type LocationRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED';

export interface LocationRequest {
  id: string;
  tenantId: string;
  requestedByUserId: string;
  requestedByName?: string;
  locationName: string;
  address: string;
  phone: string;
  status: LocationRequestStatus;
  rejectionReason?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface PrinterConfig {
  id: string;
  locationId: string;
  name: string;
  type: 'LAN' | 'BLUETOOTH' | 'USB';
  ipAddress: string;
  port: number;
  purpose: 'BILLING' | 'KITCHEN' | 'BOTH';
  active: boolean;
  updatedAt?: any;
}
