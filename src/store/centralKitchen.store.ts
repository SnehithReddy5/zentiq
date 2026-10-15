import { create } from 'zustand';
import {
  CKProfile,
  CKPartner,
  CKMenuItem,
  CKOrder,
  CKOrderStatus,
  CKPaymentStatus,
  CKPartnerStatus,
  CKDeliveryShift,
} from '../types/centralKitchen.types';
import { DBServices } from '../services/firebase/db';
import { toast } from '../utils/toast';

interface CKCartItem {
  item: CKMenuItem;
  quantity: number;
}

interface CentralKitchenState {
  ckProfile: CKProfile | null;
  menuItems: CKMenuItem[];
  incomingOrders: CKOrder[];
  outgoingOrders: CKOrder[];
  connectedCK: CKProfile | null;
  connectedCKMenuItems: CKMenuItem[];
  cart: CKCartItem[];
  isLoading: boolean;

  // Actions for Central Kitchen Provider (Seller)
  loadCKProfile: (tenantId: string, locationId: string, businessName: string) => Promise<CKProfile>;
  loadCKMenuItems: (ckTenantId: string) => Promise<void>;
  createMenuItem: (ckTenantId: string, itemData: Omit<CKMenuItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateMenuItem: (itemId: string, updates: Partial<CKMenuItem>) => Promise<void>;
  deleteMenuItem: (itemId: string) => Promise<void>;
  updatePartnerStatus: (ckTenantId: string, partnerTenantId: string, status: CKPartnerStatus) => Promise<void>;
  updateOrderStatus: (orderId: string, status: CKOrderStatus, rejectionReason?: string, paymentStatus?: CKPaymentStatus) => Promise<void>;
  subscribeToIncomingOrders: (sellerTenantId: string) => () => void;

  // Actions for Ordering Outlets (Buyer)
  connectWithPartnerCode: (
    partnerCode: string,
    buyerTenantId: string,
    buyerLocationId: string,
    buyerBusinessName: string,
    contact?: string
  ) => Promise<boolean>;
  loadConnectedCKMenu: (ckTenantId: string) => Promise<void>;
  addToCart: (item: CKMenuItem, quantity: number) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  submitCKOrder: (
    sellerProfile: CKProfile,
    buyerTenantId: string,
    buyerLocationId: string,
    buyerBusinessName: string,
    deliveryShift: CKDeliveryShift,
    shiftDate: string,
    notes?: string
  ) => Promise<string | null>;
  subscribeToOutgoingOrders: (buyerTenantId: string) => () => void;
}

export const useCentralKitchenStore = create<CentralKitchenState>((set, get) => ({
  ckProfile: null,
  menuItems: [],
  incomingOrders: [],
  outgoingOrders: [],
  connectedCK: null,
  connectedCKMenuItems: [],
  cart: [],
  isLoading: false,

  // Load / Create Central Kitchen Profile
  loadCKProfile: async (tenantId, locationId, businessName) => {
    set({ isLoading: true });
    try {
      const profile = await DBServices.getOrCreateCKProfile(tenantId, locationId, businessName);
      set({ ckProfile: profile, isLoading: false });
      return profile;
    } catch (e: any) {
      set({ isLoading: false });
      toast.error(e?.message || 'Failed to load Central Kitchen profile', 'Error');
      throw e;
    }
  },

  // Load Menu Items
  loadCKMenuItems: async (ckTenantId) => {
    try {
      const items = await DBServices.getCKMenuItems(ckTenantId);
      set({ menuItems: items });
    } catch (e: any) {
      console.error('Error loading CK menu items:', e);
    }
  },

  createMenuItem: async (ckTenantId, itemData) => {
    try {
      await DBServices.createCKMenuItem(ckTenantId, itemData);
      toast.success(`Added "${itemData.name}" to B2B food catalog!`, 'Item Created');
      await get().loadCKMenuItems(ckTenantId);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add item', 'Error');
      throw e;
    }
  },

  updateMenuItem: async (itemId, updates) => {
    try {
      await DBServices.updateCKMenuItem(itemId, updates);
      const ckProfile = get().ckProfile;
      if (ckProfile) {
        await get().loadCKMenuItems(ckProfile.tenantId);
      }
      toast.success('B2B item updated successfully!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update item', 'Error');
      throw e;
    }
  },

  deleteMenuItem: async (itemId) => {
    try {
      await DBServices.deleteCKMenuItem(itemId);
      const ckProfile = get().ckProfile;
      if (ckProfile) {
        await get().loadCKMenuItems(ckProfile.tenantId);
      }
      toast.success('B2B item removed from catalog');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove item', 'Error');
      throw e;
    }
  },

  updatePartnerStatus: async (ckTenantId, partnerTenantId, status) => {
    try {
      await DBServices.updateCKPartnerStatus(ckTenantId, partnerTenantId, status);
      const profile = await DBServices.getCKProfile(ckTenantId);
      if (profile) set({ ckProfile: profile });
      toast.success(`Partner status updated to ${status}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update partner status', 'Error');
    }
  },

  updateOrderStatus: async (orderId, status, rejectionReason, paymentStatus) => {
    try {
      await DBServices.updateCKOrderStatus(orderId, status, rejectionReason, paymentStatus);
      if (status === 'ACCEPTED') toast.success('✓ Order accepted! Kitchen notified for cooking.');
      else if (status === 'REJECTED') toast.warning('Order has been rejected.');
      else if (status === 'DISPATCHED') toast.success('✓ Order marked as dispatched with delivery slip!');
      else if (status === 'DELIVERED') toast.success('✓ Delivery confirmed!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update order status', 'Error');
      throw e;
    }
  },

  subscribeToIncomingOrders: (sellerTenantId) => {
    return DBServices.subscribeToCKOrdersForSeller(sellerTenantId, (orders) => {
      set({ incomingOrders: orders });
    });
  },

  // Buyer Side: Connect to Central Kitchen via Code
  connectWithPartnerCode: async (partnerCode, buyerTenantId, buyerLocationId, buyerBusinessName, contact) => {
    set({ isLoading: true });
    try {
      const res = await DBServices.connectCKPartnerWithCode(
        partnerCode,
        buyerTenantId,
        buyerLocationId,
        buyerBusinessName,
        contact
      );
      set({ connectedCK: res.profile, isLoading: false });
      await get().loadConnectedCKMenu(res.profile.tenantId);
      toast.success(`Connected to ${res.profile.businessName}!`, 'Partner Connected');
      return true;
    } catch (e: any) {
      set({ isLoading: false });
      toast.error(e?.message || 'Invalid partner code', 'Connection Failed');
      return false;
    }
  },

  loadConnectedCKMenu: async (ckTenantId) => {
    try {
      const items = await DBServices.getCKMenuItems(ckTenantId);
      set({ connectedCKMenuItems: items });
    } catch (e: any) {
      console.error('Error loading connected CK menu:', e);
    }
  },

  addToCart: (item, quantity) => {
    const cart = get().cart;
    const existingIndex = cart.findIndex((c) => c.item.id === item.id);
    if (existingIndex >= 0) {
      const updated = [...cart];
      updated[existingIndex].quantity += quantity;
      set({ cart: updated });
    } else {
      set({ cart: [...cart, { item, quantity }] });
    }
    toast.success(`Added ${quantity} ${item.unit} of ${item.name}`);
  },

  updateCartQuantity: (itemId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(itemId);
      return;
    }
    const cart = get().cart.map((c) => (c.item.id === itemId ? { ...c, quantity } : c));
    set({ cart });
  },

  removeFromCart: (itemId) => {
    set({ cart: get().cart.filter((c) => c.item.id !== itemId) });
  },

  clearCart: () => {
    set({ cart: [] });
  },

  submitCKOrder: async (
    sellerProfile,
    buyerTenantId,
    buyerLocationId,
    buyerBusinessName,
    deliveryShift,
    shiftDate,
    notes
  ) => {
    const cart = get().cart;
    if (cart.length === 0) {
      toast.warning('Cart is empty. Please select food items to order.');
      return null;
    }

    const items = cart.map((c) => ({
      itemId: c.item.id,
      name: c.item.name,
      category: c.item.category,
      unit: c.item.unit,
      quantity: c.quantity,
      ratePerUnit: c.item.pricePerUnit,
      amount: Number((c.quantity * c.item.pricePerUnit).toFixed(2)),
    }));

    const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
    const taxAmount = Number((subtotal * 0.05).toFixed(2)); // 5% GST for B2B food
    const totalAmount = Number((subtotal + taxAmount).toFixed(2));

    const isInternal = sellerProfile.tenantId === buyerTenantId;

    try {
      set({ isLoading: true });
      const { orderId, orderNumber } = await DBServices.placeCKOrder({
        sellerTenantId: sellerProfile.tenantId,
        sellerLocationId: sellerProfile.locationId,
        sellerBusinessName: sellerProfile.businessName,
        buyerTenantId,
        buyerLocationId,
        buyerBusinessName,
        isInternalBranch: isInternal,
        deliveryShift,
        shiftDate,
        notes: notes || '',
        items,
        subtotal,
        taxAmount,
        totalAmount,
      });

      set({ cart: [], isLoading: false });
      toast.success(`Order #${orderNumber} placed with ${sellerProfile.businessName}!`, 'Order Sent');
      return orderId;
    } catch (e: any) {
      set({ isLoading: false });
      toast.error(e?.message || 'Failed to place order', 'Order Error');
      return null;
    }
  },

  subscribeToOutgoingOrders: (buyerTenantId) => {
    return DBServices.subscribeToCKOrdersForBuyer(buyerTenantId, (orders) => {
      set({ outgoingOrders: orders });
    });
  },
}));
