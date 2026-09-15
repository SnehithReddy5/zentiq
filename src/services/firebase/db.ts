import {
  collection,
  addDoc,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  deleteDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
function cleanFirestoreData<T extends Record<string, any>>(data: T): Partial<T> {
  const clean: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  return clean;
}

import { Table } from '../../types/table.types';
import { MenuCategory, MenuItem } from '../../types/menu.types';
import { Order } from '../../types/order.types';
import { TenantProfile, TenantBranding, TenantFeatures, Location } from '../../types/tenant.types';

export const DBServices = {
  // Scoped path helpers
  getTenantRef(tenantId: string) {
    return doc(db, 'tenants', tenantId);
  },

  getLocationRef(tenantId: string, locationId: string) {
    return doc(db, 'tenants', tenantId, 'locations', locationId);
  },

  // 1. Tenant & Profile
  async getTenantProfile(tenantId: string): Promise<TenantProfile | null> {
    const snap = await getDoc(this.getTenantRef(tenantId));
    if (snap.exists()) {
      return { ...snap.data(), id: snap.id } as TenantProfile;
    }
    return null;
  },

  async updateTenantBranding(tenantId: string, branding: Partial<TenantBranding>): Promise<void> {
    const brandingRef = doc(db, 'tenants', tenantId, 'branding', 'config');
    await setDoc(brandingRef, branding, { merge: true });
  },

  async getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
    const brandingRef = doc(db, 'tenants', tenantId, 'branding', 'config');
    const snap = await getDoc(brandingRef);
    if (snap.exists()) {
      return snap.data() as TenantBranding;
    }
    return null;
  },

  async getTenantFeatures(tenantId: string): Promise<TenantFeatures | null> {
    const featRef = doc(db, 'tenants', tenantId, 'features', 'config');
    const snap = await getDoc(featRef);
    if (snap.exists()) {
      return snap.data() as TenantFeatures;
    }
    return null;
  },

  async updateTenantFeatures(tenantId: string, features: Partial<TenantFeatures>): Promise<void> {
    const featRef = doc(db, 'tenants', tenantId, 'features', 'config');
    await setDoc(featRef, features, { merge: true });
  },

  // 2. Locations & Licensing
  async requestLocation(tenantId: string, requestData: { locationName: string; address: string; phone: string; requestedByUserId: string }): Promise<void> {
    const reqRef = doc(collection(db, 'tenants', tenantId, 'locationRequests'));
    await setDoc(reqRef, {
      ...requestData,
      id: reqRef.id,
      tenantId,
      status: 'REQUESTED',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  async getApprovedLocations(tenantId: string): Promise<Location[]> {
    const q = query(
      collection(db, 'tenants', tenantId, 'locations'),
      where('status', '==', 'ACTIVE')
    );
    const snap = await getDocs(q);
    const locations: Location[] = [];
    snap.forEach((d) => locations.push({ ...d.data(), id: d.id } as Location));
    return locations;
  },

  // 3. Monotonic Sequence Counter (Scoped)
  async getNextSequenceNumber(tenantId?: string, locationId?: string): Promise<number> {
    let seqRef;
    if (tenantId && locationId) {
      seqRef = doc(db, 'tenants', tenantId, 'locations', locationId, 'settings', 'sequence');
    } else {
      seqRef = doc(db, 'settings', 'sequence');
    }

    const docSnap = await getDoc(seqRef);
    let nextSeq = 1;
    if (docSnap.exists()) {
      nextSeq = (docSnap.data().value || 0) + 1;
    }
    await setDoc(seqRef, { value: nextSeq }, { merge: true });
    return nextSeq;
  },

  // 4. Tables with Concurrency Locking
  async claimTableTransaction(
    tableId: string,
    orderId: string,
    tenantId?: string,
    locationId?: string
  ): Promise<{ success: boolean; message?: string }> {
    let tableRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'tables', tableId)
      : doc(db, 'tables', tableId);

    try {
      await runTransaction(db, async (transaction) => {
        const tableDoc = await transaction.get(tableRef);
        if (!tableDoc.exists()) {
          throw new Error('Table does not exist');
        }
        const data = tableDoc.data();
        if (data.status === 'running' || data.status === 'OCCUPIED') {
          throw new Error('Table is already occupied by another staff member');
        }
        transaction.update(tableRef, {
          status: 'running',
          currentOrderId: orderId,
          updatedAt: serverTimestamp(),
        });
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  },

  async addTable(tableNo: number, tenantId?: string, locationId?: string): Promise<void> {
    const tableRef = (tenantId && locationId)
      ? doc(collection(db, 'tenants', tenantId, 'locations', locationId, 'tables'))
      : doc(collection(db, 'tables'));

    await setDoc(tableRef, {
      id: tableRef.id,
      tableNo,
      status: 'available',
      currentOrderId: null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  async updateTableStatus(id: string, status: Table['status'], tenantId?: string, locationId?: string): Promise<void> {
    const tableRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'tables', id)
      : doc(db, 'tables', id);
    await updateDoc(tableRef, { status, updatedAt: serverTimestamp() });
  },

  async updateTableStatusByNo(tableNo: number | string, status: Table['status'], tenantId?: string, locationId?: string): Promise<void> {
    const numericTableNo = Number(tableNo);
    const colRef = (tenantId && locationId)
      ? collection(db, 'tenants', tenantId, 'locations', locationId, 'tables')
      : collection(db, 'tables');

    const q = query(colRef, where('tableNo', '==', numericTableNo));
    const snapshot = await getDocs(q);
    const updatePromises = snapshot.docs.map(d =>
      updateDoc(d.ref, {
        status,
        ...(status === 'available' ? { cartItems: [], activeWaiterName: null, activeWaiterId: null, currentOrderId: null } : {}),
        updatedAt: serverTimestamp()
      })
    );
    await Promise.all(updatePromises);
  },

  async deleteTable(id: string, tenantId?: string, locationId?: string): Promise<void> {
    const tableRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'tables', id)
      : doc(db, 'tables', id);
    await deleteDoc(tableRef);
  },

  // 5. Menu Categories & Items
  async addMenuCategory(name: string, tenantId?: string, locationId?: string): Promise<void> {
    const colRef = (tenantId && locationId)
      ? collection(db, 'tenants', tenantId, 'locations', locationId, 'menuCategories')
      : collection(db, 'menuCategories');
    const categoryRef = doc(colRef);
    await setDoc(categoryRef, { id: categoryRef.id, name, active: true });
  },

  async updateMenuCategory(id: string, name: string, tenantId?: string, locationId?: string): Promise<void> {
    const catRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'menuCategories', id)
      : doc(db, 'menuCategories', id);
    await updateDoc(catRef, { name });
  },

  async deleteMenuCategory(id: string, tenantId?: string, locationId?: string): Promise<void> {
    const itemsCol = (tenantId && locationId)
      ? collection(db, 'tenants', tenantId, 'locations', locationId, 'menuItems')
      : collection(db, 'menuItems');
    const q = query(itemsCol, where('categoryId', '==', id));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);

    const catRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'menuCategories', id)
      : doc(db, 'menuCategories', id);
    await deleteDoc(catRef);
  },

  async addMenuItem(item: Omit<MenuItem, 'id'>, tenantId?: string, locationId?: string): Promise<void> {
    const itemsCol = (tenantId && locationId)
      ? collection(db, 'tenants', tenantId, 'locations', locationId, 'menuItems')
      : collection(db, 'menuItems');
    const itemRef = doc(itemsCol);
    const sanitized = cleanFirestoreData({ ...item, id: itemRef.id, active: true });
    await setDoc(itemRef, sanitized);
  },

  async updateMenuItem(id: string, updates: Partial<MenuItem>, tenantId?: string, locationId?: string): Promise<void> {
    const itemRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'menuItems', id)
      : doc(db, 'menuItems', id);
    const sanitized = cleanFirestoreData(updates);
    await updateDoc(itemRef, sanitized);
  },

  async deleteMenuItem(id: string, tenantId?: string, locationId?: string): Promise<void> {
    const itemRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'menuItems', id)
      : doc(db, 'menuItems', id);
    await deleteDoc(itemRef);
  },

  // Bulk upsert for Excel Menu Import
  async bulkUpsertMenuItems(
    items: {
      categoryName: string;
      itemName: string;
      variantName: string;
      price: number;
      active: boolean;
      sku?: string;
    }[],
    tenantId?: string,
    locationId?: string
  ): Promise<void> {
    const catCol = (tenantId && locationId)
      ? collection(db, 'tenants', tenantId, 'locations', locationId, 'menuCategories')
      : collection(db, 'menuCategories');
    const itemsCol = (tenantId && locationId)
      ? collection(db, 'tenants', tenantId, 'locations', locationId, 'menuItems')
      : collection(db, 'menuItems');

    // 1. Fetch existing categories
    const catSnap = await getDocs(catCol);
    const catMap: Record<string, string> = {};
    catSnap.forEach(d => {
      catMap[d.data().name.toLowerCase().trim()] = d.id;
    });

    // 2. Fetch existing items
    const itemSnap = await getDocs(itemsCol);
    const itemMap: Record<string, any> = {};
    itemSnap.forEach(d => {
      itemMap[d.data().name.toLowerCase().trim()] = { id: d.id, ...d.data() };
    });

    const batch = writeBatch(db);

    for (const item of items) {
      const catKey = item.categoryName.toLowerCase().trim();
      let categoryId = catMap[catKey];

      if (!categoryId) {
        const newCatRef = doc(catCol);
        batch.set(newCatRef, { id: newCatRef.id, name: item.categoryName, active: true });
        categoryId = newCatRef.id;
        catMap[catKey] = categoryId;
      }

      const itemKey = item.itemName.toLowerCase().trim();
      const existingItem = itemMap[itemKey];

      if (existingItem) {
        const itemRef = doc(itemsCol, existingItem.id);
        const existingVariants = existingItem.variants || [];
        const variantIdx = existingVariants.findIndex((v: any) => v.name.toLowerCase() === item.variantName.toLowerCase());

        let updatedVariants;
        if (variantIdx >= 0) {
          updatedVariants = existingVariants.map((v: any, idx: number) =>
            idx === variantIdx ? { ...v, price: item.price, active: item.active } : v
          );
        } else {
          updatedVariants = [...existingVariants, { id: `var_${Date.now()}_${Math.random().toString(36).substring(7)}`, name: item.variantName, price: item.price, active: item.active }];
        }

        batch.update(itemRef, {
          price: updatedVariants[0]?.price || item.price,
          variants: updatedVariants,
          sku: item.sku || existingItem.sku || '',
          active: item.active,
        });
      } else {
        const newItemRef = doc(itemsCol);
        const variantId = `var_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const newDocData = {
          id: newItemRef.id,
          name: item.itemName,
          categoryId,
          price: item.price,
          isAvailable: item.active,
          active: item.active,
          sku: item.sku || '',
          variants: [
            { id: variantId, name: item.variantName, price: item.price, active: item.active }
          ]
        };
        batch.set(newItemRef, newDocData);
        itemMap[itemKey] = newDocData;
      }
    }

    await batch.commit();
  },

  // 6. Orders & Split Payments
  async createOrder(orderData: Omit<Order, 'id'>, tenantId?: string, locationId?: string): Promise<string> {
    const ordersCol = (tenantId && locationId)
      ? collection(db, 'tenants', tenantId, 'locations', locationId, 'orders')
      : collection(db, 'orders');

    const orderRef = doc(ordersCol);
    await setDoc(orderRef, {
      ...orderData,
      id: orderRef.id,
      tenantId: tenantId || null,
      locationId: locationId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return orderRef.id;
  },

  async updateOrderStatus(id: string, status: Order['status'], tenantId?: string, locationId?: string): Promise<void> {
    const orderRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'orders', id)
      : doc(db, 'orders', id);
    await updateDoc(orderRef, { status, updatedAt: serverTimestamp() });
  },

  async recordOrderPayment(
    id: string,
    payment: { method: any; amount: number; reference?: string },
    paymentStatus: any,
    tenantId?: string,
    locationId?: string
  ): Promise<void> {
    const orderRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'orders', id)
      : doc(db, 'orders', id);

    const docSnap = await getDoc(orderRef);
    if (!docSnap.exists()) return;

    const existingPayments = docSnap.data().payments || [];
    const newPayment = {
      ...payment,
      id: `pay_${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    await updateDoc(orderRef, {
      payments: [...existingPayments, newPayment],
      paymentStatus,
      status: paymentStatus === 'PAID' ? 'completed' : 'running',
      updatedAt: serverTimestamp()
    });
  },

  async deleteOrder(id: string, tenantId?: string, locationId?: string): Promise<void> {
    const orderRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'orders', id)
      : doc(db, 'orders', id);
    await deleteDoc(orderRef);
  },

  // 7. Cart State Synchronization
  async updateCart(tableNo: number, items: any[], tenantId?: string, locationId?: string): Promise<void> {
    if (tableNo === 0) return;
    try {
      const { useAuthStore } = require('../../store/auth.store');
      const currentUser = useAuthStore.getState().user;

      const colRef = (tenantId && locationId)
        ? collection(db, 'tenants', tenantId, 'locations', locationId, 'tables')
        : collection(db, 'tables');

      const q = query(colRef, where('tableNo', '==', tableNo));
      const snapshot = await getDocs(q);
      const isRunning = items.length > 0;

      const updatePromises = snapshot.docs.map(d =>
        updateDoc(d.ref, {
          cartItems: items,
          status: isRunning ? 'running' : 'available',
          activeWaiterName: isRunning ? (currentUser?.name || 'Staff') : null,
          activeWaiterId: isRunning ? (currentUser?.id || 'staff') : null,
          updatedAt: serverTimestamp()
        })
      );
      await Promise.all(updatePromises);
    } catch (err) {
      console.warn(`Error updating cart for Table ${tableNo}:`, err);
    }
  },

  // 8. User Management
  async addUser(userData: any, tenantId?: string): Promise<void> {
    const cleanId = (userData.mobile || userData.id || '').trim();
    const payload = {
      ...userData,
      id: cleanId,
      mobile: cleanId,
      tenantId: tenantId || userData.tenantId || null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // 1. Write to tenant subcollection
    if (tenantId) {
      await setDoc(doc(db, 'tenants', tenantId, 'users', cleanId), payload);
    }

    // 2. Register in root users collection for immediate global mobile login lookup
    await setDoc(doc(db, 'users', cleanId), payload);
    if (cleanId.toLowerCase() !== cleanId) {
      await setDoc(doc(db, 'users', cleanId.toLowerCase()), payload);
    }
  },

  async updateUser(id: string, updates: Partial<any>, tenantId?: string): Promise<void> {
    const cleanId = id.trim();
    const updatePayload = { ...updates, updatedAt: serverTimestamp() };
    if (tenantId) {
      await setDoc(doc(db, 'tenants', tenantId, 'users', cleanId), updatePayload, { merge: true });
    }
    try {
      await setDoc(doc(db, 'users', cleanId), updatePayload, { merge: true });
    } catch (_) {}
    if (cleanId.toLowerCase() !== cleanId) {
      try {
        await setDoc(doc(db, 'users', cleanId.toLowerCase()), updatePayload, { merge: true });
      } catch (_) {}
    }
  },

  async deleteUserAccount(id: string, tenantId?: string): Promise<void> {
    const cleanId = id.trim();
    if (tenantId) {
      await deleteDoc(doc(db, 'tenants', tenantId, 'users', cleanId));
    }
    try {
      await deleteDoc(doc(db, 'users', cleanId));
    } catch (_) {}
    if (cleanId.toLowerCase() !== cleanId) {
      try {
        await deleteDoc(doc(db, 'users', cleanId.toLowerCase()));
      } catch (_) {}
    }
  },

  subscribeToUsers(onUpdate: (users: any[]) => void, tenantId?: string): () => void {
    const colRef = tenantId
      ? collection(db, 'tenants', tenantId, 'users')
      : collection(db, 'users');

    const q = query(colRef, orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const users: any[] = [];
        snapshot.forEach((doc) => {
          users.push({ ...doc.data(), id: doc.id });
        });
        onUpdate(users);
      },
      (error) => {
        console.warn("Error subscribing to users:", error);
      }
    );
  }
};
