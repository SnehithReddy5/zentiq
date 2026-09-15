export type TableStatus = 'available' | 'running' | 'AVAILABLE' | 'OCCUPIED';

export interface Table {
  id: string;
  tenantId?: string;
  locationId?: string;
  tableNo: number;
  capacity?: number;
  section?: string;
  status: TableStatus;
  currentOrderId?: string | null;
  active?: boolean;
  cartItems?: any[];
  updatedAt?: any;
}
