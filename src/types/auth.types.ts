export type UserRole =
  | 'PLATFORM_ADMIN'      // Zentiq Provider (You)
  | 'CLIENT_ADMIN'        // Onboarded Restaurant Owner / Tenant Admin
  | 'ADMIN'               // Alias for Client Admin
  | 'TENANT_SUPER_ADMIN'  // Alias for Client Admin
  | 'MANAGER'             // Restaurant Manager
  | 'BILLER'              // Cashier / Billing Counter
  | 'WAITER'              // Waiter / Captain
  | 'CASHIER'
  // Legacy aliases
  | 'admin'
  | 'manager'
  | 'captain';

export interface User {
  id: string;
  name: string;
  mobile?: string;
  email?: string;
  role: UserRole;
  tenantId?: string;
  locationIds?: string[];
  assignedLocationId?: string;
  active?: boolean;
  password?: string;
}
