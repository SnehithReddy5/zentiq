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
  limit,
} from 'firebase/firestore';
import { db } from './config';
export function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanFirestoreData(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    if ((data as any)._methodName || (data as any).constructor?.name === 'FieldValue') {
      return data;
    }
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = cleanFirestoreData(value);
      }
    }
    return clean as T;
  }
  return data;
}

import { Table } from '../../types/table.types';
import { MenuCategory, MenuItem } from '../../types/menu.types';
import { Order, OrderItem } from '../../types/order.types';
import { TenantProfile, TenantBranding, TenantFeatures, Location } from '../../types/tenant.types';
import { InventoryItem, InventoryLog } from '../../types/inventory.types';
import {
  CKProfile,
  CKPartner,
  CKMenuItem,
  CKOrder,
  CKOrderStatus,
  CKPaymentStatus,
  CKPartnerStatus,
} from '../../types/centralKitchen.types';

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
    const stringTableNo = String(tableNo);
    const colRef = (tenantId && locationId)
      ? collection(db, 'tenants', tenantId, 'locations', locationId, 'tables')
      : collection(db, 'tables');

    let snapshot = await getDocs(query(colRef, where('tableNo', '==', numericTableNo)));
    if (snapshot.empty) {
      snapshot = await getDocs(query(colRef, where('tableNo', '==', stringTableNo)));
    }
    const updatePromises = snapshot.docs.map(d =>
      updateDoc(d.ref, {
        status,
        ...(status === 'available' ? {
          cartItems: [],
          activeWaiterName: null,
          activeWaiterId: null,
          currentOrderId: null,
          billRequested: false,
          billRequestedAt: null
        } : {}),
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
    // 1. Delete all items associated with this category
    try {
      const itemsCol = (tenantId && locationId)
        ? collection(db, 'tenants', tenantId, 'locations', locationId, 'menuItems')
        : collection(db, 'menuItems');
      const q = query(itemsCol, where('categoryId', '==', id));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    } catch (itemErr) {
      console.warn('Could not delete associated items (or none found):', itemErr);
    }

    // 2. Delete the category document across all possible paths (location, tenant, root)
    const deletionAttempts: Promise<any>[] = [];
    if (tenantId && locationId) {
      deletionAttempts.push(deleteDoc(doc(db, 'tenants', tenantId, 'locations', locationId, 'menuCategories', id)).catch(() => {}));
    }
    if (tenantId) {
      deletionAttempts.push(deleteDoc(doc(db, 'tenants', tenantId, 'menuCategories', id)).catch(() => {}));
    }
    deletionAttempts.push(deleteDoc(doc(db, 'menuCategories', id)).catch(() => {}));
    await Promise.all(deletionAttempts);
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
    const sanitizedOrderPayload = cleanFirestoreData({
      ...orderData,
      id: orderRef.id,
      tenantId: tenantId || null,
      locationId: locationId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(orderRef, sanitizedOrderPayload);

    // Automatically deduct inventory stock for sold items
    if (orderData.items && orderData.items.length > 0) {
      await this.deductInventory(orderData.items, tenantId, locationId).catch(err =>
        console.warn('Inventory deduction warning:', err)
      );
    }

    return orderRef.id;
  },

  async deductInventory(items: OrderItem[], tenantId?: string, locationId?: string): Promise<void> {
    for (const item of items) {
      const targetItemId = item.baseItemId || item.itemId;
      if (!targetItemId) continue;

      const itemRef = (tenantId && locationId)
        ? doc(db, 'tenants', tenantId, 'locations', locationId, 'menuItems', targetItemId)
        : doc(db, 'menuItems', targetItemId);

      try {
        const snap = await getDoc(itemRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.trackInventory && typeof data.stockQuantity === 'number') {
            const deductionPerUnit = typeof item.portionDeduction === 'number' ? item.portionDeduction : 1;
            const totalDeduction = (item.qty || 1) * deductionPerUnit;
            const newStock = Math.max(0, data.stockQuantity - totalDeduction);
            await updateDoc(itemRef, {
              stockQuantity: Number(newStock.toFixed(3)),
              isAvailable: newStock > 0,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {
        console.warn(`Could not deduct inventory for item ${targetItemId}:`, err);
      }
    }
  },

  async quickRestockItem(itemId: string, newStock: number, tenantId?: string, locationId?: string): Promise<void> {
    const itemRef = (tenantId && locationId)
      ? doc(db, 'tenants', tenantId, 'locations', locationId, 'menuItems', itemId)
      : doc(db, 'menuItems', itemId);

    await updateDoc(itemRef, {
      stockQuantity: Number(newStock.toFixed(3)),
      isAvailable: newStock > 0,
      updatedAt: serverTimestamp(),
    });
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

      const cleanItems = cleanFirestoreData(items);
      const updatePromises = snapshot.docs.map(d =>
        updateDoc(d.ref, {
          cartItems: cleanItems,
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
    const effectiveTenantId = tenantId || userData.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Cannot create staff user: active restaurant tenant ID is required.');
    }
    const payload = {
      ...userData,
      id: cleanId,
      mobile: cleanId,
      tenantId: effectiveTenantId,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // 1. Write to tenant subcollection
    await setDoc(doc(db, 'tenants', effectiveTenantId, 'users', cleanId), payload);

    // 2. Register in root users collection for immediate global mobile login lookup
    await setDoc(doc(db, 'users', cleanId), payload);
    if (cleanId.toLowerCase() !== cleanId) {
      await setDoc(doc(db, 'users', cleanId.toLowerCase()), payload);
    }
  },

  async updateUser(id: string, updates: Partial<any>, tenantId?: string, newId?: string): Promise<string> {
    const oldCleanId = id.trim();
    const targetCleanId = (newId || updates.mobile || oldCleanId).trim();
    const updatePayload = { ...updates, id: targetCleanId, mobile: targetCleanId, updatedAt: serverTimestamp() };

    // If username / login ID has changed, migrate document keys
    if (targetCleanId.toLowerCase() !== oldCleanId.toLowerCase()) {
      let existingData: any = {};
      if (tenantId) {
        try {
          const oldSnap = await getDoc(doc(db, 'tenants', tenantId, 'users', oldCleanId));
          if (oldSnap.exists()) existingData = oldSnap.data();
        } catch (_) {}
      }
      if (!existingData.name) {
        try {
          const oldRootSnap = await getDoc(doc(db, 'users', oldCleanId.toLowerCase()));
          if (oldRootSnap.exists()) existingData = oldRootSnap.data();
        } catch (_) {}
      }

      const mergedPayload = { ...existingData, ...updatePayload };

      // 1. Create new documents
      if (tenantId) {
        await setDoc(doc(db, 'tenants', tenantId, 'users', targetCleanId), mergedPayload);
      }
      await setDoc(doc(db, 'users', targetCleanId), mergedPayload);
      if (targetCleanId.toLowerCase() !== targetCleanId) {
        await setDoc(doc(db, 'users', targetCleanId.toLowerCase()), mergedPayload);
      }

      // 2. Delete old documents
      if (tenantId) {
        try { await deleteDoc(doc(db, 'tenants', tenantId, 'users', oldCleanId)); } catch (_) {}
      }
      try { await deleteDoc(doc(db, 'users', oldCleanId)); } catch (_) {}
      if (oldCleanId.toLowerCase() !== oldCleanId) {
        try { await deleteDoc(doc(db, 'users', oldCleanId.toLowerCase())); } catch (_) {}
      }

      // 3. Only update tenant document if this user is the registered primary owner / admin of the tenant
      if (tenantId) {
        try {
          const tSnap = await getDoc(doc(db, 'tenants', tenantId));
          const tData = tSnap.exists() ? tSnap.data() : null;
          if (tData && (tData.adminUsername === oldCleanId || tData.adminUsername === targetCleanId)) {
            await updateDoc(doc(db, 'tenants', tenantId), {
              adminUsername: targetCleanId,
              ...(updates.password ? { adminPassword: updates.password } : {}),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (_) {}
      }

      return targetCleanId;
    } else {
      // Normal update without changing username / ID
      if (tenantId) {
        await setDoc(doc(db, 'tenants', tenantId, 'users', oldCleanId), updatePayload, { merge: true });
      }
      try {
        await setDoc(doc(db, 'users', oldCleanId), updatePayload, { merge: true });
      } catch (_) {}
      if (oldCleanId.toLowerCase() !== oldCleanId) {
        try {
          await setDoc(doc(db, 'users', oldCleanId.toLowerCase()), updatePayload, { merge: true });
        } catch (_) {}
      }

      // If password changed and this user is the registered primary owner of the tenant, sync tenant doc
      if (tenantId && updates.password) {
        try {
          const tSnap = await getDoc(doc(db, 'tenants', tenantId));
          const tData = tSnap.exists() ? tSnap.data() : null;
          if (tData && (tData.adminUsername === oldCleanId || tData.adminUsername === targetCleanId)) {
            await updateDoc(doc(db, 'tenants', tenantId), {
              adminPassword: updates.password,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (_) {}
      }

      return oldCleanId;
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
  },

  // --- KITCHEN INVENTORY & STORE LOAD SERVICES ---
  getInventoryColRef(tenantId?: string, locationId?: string) {
    if (tenantId && locationId) {
      return collection(db, 'tenants', tenantId, 'locations', locationId, 'inventoryItems');
    }
    return collection(db, 'inventoryItems');
  },

  getInventoryLogsColRef(tenantId?: string, locationId?: string) {
    if (tenantId && locationId) {
      return collection(db, 'tenants', tenantId, 'locations', locationId, 'inventoryLogs');
    }
    return collection(db, 'inventoryLogs');
  },

  async createInventoryItem(
    itemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>,
    tenantId?: string,
    locationId?: string
  ): Promise<string> {
    const colRef = this.getInventoryColRef(tenantId, locationId);
    const docRef = await addDoc(colRef, cleanFirestoreData({
      ...itemData,
      totalReceived: Number(itemData.totalReceived || itemData.currentStock || 0),
      totalIssued: Number(itemData.totalIssued || 0),
      currentStock: Number(itemData.currentStock || 0),
      minThreshold: Number(itemData.minThreshold || 5),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));

    if (itemData.currentStock > 0) {
      const logsRef = this.getInventoryLogsColRef(tenantId, locationId);
      await addDoc(logsRef, cleanFirestoreData({
        itemId: docRef.id,
        itemName: itemData.name,
        type: 'STOCK_IN',
        quantity: itemData.currentStock,
        unit: itemData.unit,
        previousStock: 0,
        newStock: itemData.currentStock,
        notes: 'Initial opening stock loaded',
        recordedBy: 'Manager',
        createdAt: serverTimestamp(),
      }));
    }

    return docRef.id;
  },

  async receiveStockLoad(
    itemId: string,
    quantity: number,
    notes?: string,
    staffName?: string,
    tenantId?: string,
    locationId?: string
  ): Promise<void> {
    const colRef = this.getInventoryColRef(tenantId, locationId);
    const itemRef = doc(colRef, itemId);
    const snap = await getDoc(itemRef);
    if (!snap.exists()) throw new Error('Inventory item not found');

    const item = snap.data() as InventoryItem;
    const prevStock = Number(item.currentStock || 0);
    const addedQty = Number(quantity || 0);
    const newStock = prevStock + addedQty;
    const newTotalReceived = Number(item.totalReceived || prevStock) + addedQty;

    await updateDoc(itemRef, {
      currentStock: Number(newStock.toFixed(3)),
      totalReceived: Number(newTotalReceived.toFixed(3)),
      lastRestockedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const logsRef = this.getInventoryLogsColRef(tenantId, locationId);
    await addDoc(logsRef, cleanFirestoreData({
      itemId,
      itemName: item.name,
      type: 'STOCK_IN',
      quantity: addedQty,
      unit: item.unit,
      previousStock: prevStock,
      newStock: Number(newStock.toFixed(3)),
      notes: notes || 'Bulk load received',
      recordedBy: staffName || 'Kitchen Staff',
      createdAt: serverTimestamp(),
    }));
  },

  async issueStockToKitchen(
    itemId: string,
    quantity: number,
    notes?: string,
    staffName?: string,
    tenantId?: string,
    locationId?: string
  ): Promise<void> {
    const colRef = this.getInventoryColRef(tenantId, locationId);
    const itemRef = doc(colRef, itemId);
    const snap = await getDoc(itemRef);
    if (!snap.exists()) throw new Error('Inventory item not found');

    const item = snap.data() as InventoryItem;
    const prevStock = Number(item.currentStock || 0);
    const issuedQty = Number(quantity || 0);
    const newStock = Math.max(0, prevStock - issuedQty);
    const newTotalIssued = Number(item.totalIssued || 0) + issuedQty;

    await updateDoc(itemRef, {
      currentStock: Number(newStock.toFixed(3)),
      totalIssued: Number(newTotalIssued.toFixed(3)),
      lastIssuedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const logsRef = this.getInventoryLogsColRef(tenantId, locationId);
    await addDoc(logsRef, cleanFirestoreData({
      itemId,
      itemName: item.name,
      type: 'KITCHEN_ISSUE',
      quantity: issuedQty,
      unit: item.unit,
      previousStock: prevStock,
      newStock: Number(newStock.toFixed(3)),
      notes: notes || 'Taken to kitchen for active cooking',
      recordedBy: staffName || 'Chef',
      createdAt: serverTimestamp(),
    }));
  },

  async adjustInventoryStock(
    itemId: string,
    newStock: number,
    type: 'WASTAGE' | 'ADJUSTMENT',
    reason?: string,
    staffName?: string,
    tenantId?: string,
    locationId?: string
  ): Promise<void> {
    const colRef = this.getInventoryColRef(tenantId, locationId);
    const itemRef = doc(colRef, itemId);
    const snap = await getDoc(itemRef);
    if (!snap.exists()) throw new Error('Inventory item not found');

    const item = snap.data() as InventoryItem;
    const prevStock = Number(item.currentStock || 0);
    const targetStock = Math.max(0, Number(newStock || 0));
    const delta = Math.abs(targetStock - prevStock);

    await updateDoc(itemRef, {
      currentStock: Number(targetStock.toFixed(3)),
      updatedAt: serverTimestamp(),
    });

    const logsRef = this.getInventoryLogsColRef(tenantId, locationId);
    await addDoc(logsRef, cleanFirestoreData({
      itemId,
      itemName: item.name,
      type,
      quantity: delta,
      unit: item.unit,
      previousStock: prevStock,
      newStock: Number(targetStock.toFixed(3)),
      notes: reason || (type === 'WASTAGE' ? 'Kitchen Spoilage / Wastage' : 'Physical count adjustment'),
      recordedBy: staffName || 'Manager',
      createdAt: serverTimestamp(),
    }));
  },

  async deleteInventoryItem(itemId: string, tenantId?: string, locationId?: string): Promise<void> {
    const colRef = this.getInventoryColRef(tenantId, locationId);
    await deleteDoc(doc(colRef, itemId));
  },

  async seedStarterInventory(tenantId?: string, locationId?: string): Promise<void> {
    const starters = [
      { name: 'Basmati Rice', category: 'Grains & Rice', unit: 'kg', currentStock: 100, minThreshold: 20 },
      { name: 'Sunflower Cooking Oil', category: 'Oils & Ghee', unit: 'packets', currentStock: 200, minThreshold: 25 },
      { name: 'Kitchen Spices & Masalas', category: 'Spices & Seasoning', unit: 'kg', currentStock: 100, minThreshold: 15 },
      { name: 'Fresh Paneer', category: 'Dairy & Poultry', unit: 'kg', currentStock: 25, minThreshold: 5 },
      { name: 'Fresh Onions', category: 'Vegetables & Produce', unit: 'kg', currentStock: 50, minThreshold: 10 },
      { name: 'Wheat Flour (Atta)', category: 'Grains & Rice', unit: 'kg', currentStock: 80, minThreshold: 15 },
      { name: 'Amul Butter', category: 'Dairy & Poultry', unit: 'packets', currentStock: 50, minThreshold: 10 },
    ];

    for (const s of starters) {
      await this.createInventoryItem(s as any, tenantId, locationId);
    }
  },

  // ==========================================
  // CENTRAL KITCHEN (CK) B2B FOOD SUPPLY
  // ==========================================

  async getOrCreateCKProfile(tenantId: string, locationId: string, businessName: string): Promise<CKProfile> {
    const profileRef = doc(db, 'ckProfiles', tenantId);
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as CKProfile;
    }

    const prefix = (businessName || 'CK')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'VSD';
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const partnerCode = `${prefix}-CK-${randomSuffix}`;

    const newProfile: Omit<CKProfile, 'id'> = {
      tenantId,
      locationId: locationId || 'default',
      businessName: businessName || 'Central Kitchen',
      partnerCode,
      whitelistedPartners: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(profileRef, cleanFirestoreData(newProfile));
    return { id: tenantId, ...newProfile } as CKProfile;
  },

  async getCKProfile(tenantId: string): Promise<CKProfile | null> {
    const profileRef = doc(db, 'ckProfiles', tenantId);
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as CKProfile;
  },

  async updateCKProfile(tenantId: string, updates: Partial<CKProfile>): Promise<void> {
    const profileRef = doc(db, 'ckProfiles', tenantId);
    await setDoc(profileRef, cleanFirestoreData({ ...updates, updatedAt: serverTimestamp() }), { merge: true });
  },

  async getCKProfileByPartnerCode(partnerCode: string): Promise<CKProfile | null> {
    const cleanCode = (partnerCode || '').trim().toUpperCase();
    if (!cleanCode) return null;
    const q = query(collection(db, 'ckProfiles'), where('partnerCode', '==', cleanCode));
    const snap = await getDocs(q);
    if (snap.empty) {
      // Direct tenantId fallback
      const directDoc = await getDoc(doc(db, 'ckProfiles', cleanCode.toLowerCase()));
      if (directDoc.exists()) {
        return { id: directDoc.id, ...directDoc.data() } as CKProfile;
      }
      return null;
    }
    const docData = snap.docs[0];
    return { id: docData.id, ...docData.data() } as CKProfile;
  },

  async connectCKPartnerWithCode(
    partnerCode: string,
    buyerTenantId: string,
    buyerLocationId: string,
    buyerBusinessName: string,
    contactNumber?: string
  ): Promise<{ success: boolean; profile: CKProfile; status: CKPartnerStatus }> {
    const cleanCode = (partnerCode || '').trim().toUpperCase();
    const profile = await this.getCKProfileByPartnerCode(cleanCode);
    if (!profile) {
      throw new Error(`Invalid Partner Code: "${cleanCode}". Please verify code with Central Kitchen head.`);
    }

    if (profile.tenantId === buyerTenantId) {
      return { success: true, profile, status: 'APPROVED' };
    }

    const profileRef = doc(db, 'ckProfiles', profile.tenantId);
    const partners = profile.whitelistedPartners || [];
    const existingIndex = partners.findIndex((p: CKPartner) => p.tenantId === buyerTenantId);

    const nowIso = new Date().toISOString();
    const newPartner: CKPartner = {
      tenantId: buyerTenantId || 'outlet',
      locationId: buyerLocationId || 'main',
      businessName: buyerBusinessName || 'Outlet',
      contactNumber: contactNumber || '',
      status: 'APPROVED',
      isInternalBranch: false,
      approvedAt: nowIso,
      createdAt: nowIso,
    };

    let updatedPartners: CKPartner[] = [];
    if (existingIndex >= 0) {
      updatedPartners = [...partners];
      updatedPartners[existingIndex] = {
        ...updatedPartners[existingIndex],
        status: 'APPROVED',
        approvedAt: nowIso,
      };
    } else {
      updatedPartners = [newPartner, ...partners];
    }

    const cleanedPartners = updatedPartners.map((p) => ({
      tenantId: p.tenantId || '',
      locationId: p.locationId || 'main',
      businessName: p.businessName || 'Outlet',
      contactNumber: p.contactNumber || '',
      status: p.status || 'APPROVED',
      isInternalBranch: !!p.isInternalBranch,
      approvedAt: p.approvedAt || nowIso,
      createdAt: p.createdAt || nowIso,
    }));

    await updateDoc(profileRef, {
      whitelistedPartners: cleanedPartners,
      updatedAt: serverTimestamp(),
    });

    return { success: true, profile, status: 'APPROVED' };
  },

  async updateCKPartnerStatus(ckTenantId: string, partnerTenantId: string, newStatus: CKPartnerStatus): Promise<void> {
    const profileRef = doc(db, 'ckProfiles', ckTenantId);
    const snap = await getDoc(profileRef);
    if (!snap.exists()) throw new Error('Central Kitchen profile not found');

    const profile = snap.data() as CKProfile;
    const partners = profile.whitelistedPartners || [];
    const nowIso = new Date().toISOString();
    const updated = partners.map((p: CKPartner) => ({
      tenantId: p.tenantId || '',
      locationId: p.locationId || 'main',
      businessName: p.businessName || 'Outlet',
      contactNumber: p.contactNumber || '',
      status: p.tenantId === partnerTenantId ? newStatus : (p.status || 'APPROVED'),
      isInternalBranch: !!p.isInternalBranch,
      approvedAt: p.approvedAt || nowIso,
      createdAt: p.createdAt || nowIso,
    }));

    await updateDoc(profileRef, {
      whitelistedPartners: updated,
      updatedAt: serverTimestamp(),
    });
  },

  async getCKMenuItems(ckTenantId: string): Promise<CKMenuItem[]> {
    const q = query(collection(db, 'ckMenuItems'), where('ckTenantId', '==', ckTenantId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CKMenuItem));
  },

  async createCKMenuItem(
    ckTenantId: string,
    data: Omit<CKMenuItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const colRef = collection(db, 'ckMenuItems');
    const docRef = await addDoc(colRef, cleanFirestoreData({
      ...data,
      ckTenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return docRef.id;
  },

  async updateCKMenuItem(itemId: string, updates: Partial<CKMenuItem>): Promise<void> {
    const itemRef = doc(db, 'ckMenuItems', itemId);
    await updateDoc(itemRef, cleanFirestoreData({
      ...updates,
      updatedAt: serverTimestamp(),
    }));
  },

  async deleteCKMenuItem(itemId: string): Promise<void> {
    const itemRef = doc(db, 'ckMenuItems', itemId);
    await deleteDoc(itemRef);
  },

  async placeCKOrder(
    orderData: Omit<CKOrder, 'id' | 'orderNumber' | 'status' | 'paymentStatus' | 'createdAt' | 'updatedAt'>
  ): Promise<{ orderId: string; orderNumber: string }> {
    const orderNumber = `CK-${Date.now().toString().slice(-6)}`;
    const colRef = collection(db, 'ckOrders');
    const docRef = await addDoc(colRef, cleanFirestoreData({
      ...orderData,
      orderNumber,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return { orderId: docRef.id, orderNumber };
  },

  async updateCKOrderStatus(
    orderId: string,
    status: CKOrderStatus,
    rejectionReason?: string,
    paymentStatus?: CKPaymentStatus,
    paymentMode?: 'UPI' | 'NEFT' | 'CASH' | 'LEDGER',
    invoiceNumber?: string
  ): Promise<void> {
    const orderRef = doc(db, 'ckOrders', orderId);
    const updates: any = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (rejectionReason) updates.rejectionReason = rejectionReason;
    if (paymentStatus) {
      updates.paymentStatus = paymentStatus;
      if (paymentStatus === 'PAID') {
        updates.paidAt = serverTimestamp();
      }
    }
    if (paymentMode) updates.paymentMode = paymentMode;
    if (invoiceNumber) updates.invoiceNumber = invoiceNumber;
    if (status === 'DISPATCHED') updates.dispatchedAt = serverTimestamp();
    if (status === 'DELIVERED') updates.deliveredAt = serverTimestamp();

    await updateDoc(orderRef, cleanFirestoreData(updates));
  },

  subscribeToCKOrdersForSeller(sellerTenantId: string, callback: (orders: CKOrder[]) => void): () => void {
    const q = query(
      collection(db, 'ckOrders'),
      where('sellerTenantId', '==', sellerTenantId)
    );
    return onSnapshot(
      q,
      (snap) => {
        const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CKOrder));
        orders.sort((a, b) => {
          const tA = (a.createdAt && a.createdAt.toDate) ? a.createdAt.toDate().getTime() : (a.createdAt && a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime());
          const tB = (b.createdAt && b.createdAt.toDate) ? b.createdAt.toDate().getTime() : (b.createdAt && b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime());
          return tB - tA;
        });
        callback(orders);
      },
      (err) => {
        console.error('Error in subscribeToCKOrdersForSeller snapshot:', err);
      }
    );
  },

  subscribeToCKOrdersForBuyer(buyerTenantId: string, callback: (orders: CKOrder[]) => void): () => void {
    const q = query(
      collection(db, 'ckOrders'),
      where('buyerTenantId', '==', buyerTenantId)
    );
    return onSnapshot(
      q,
      (snap) => {
        const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CKOrder));
        orders.sort((a, b) => {
          const tA = (a.createdAt && a.createdAt.toDate) ? a.createdAt.toDate().getTime() : (a.createdAt && a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime());
          const tB = (b.createdAt && b.createdAt.toDate) ? b.createdAt.toDate().getTime() : (b.createdAt && b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime());
          return tB - tA;
        });
        callback(orders);
      },
      (err) => {
        console.error('Error in subscribeToCKOrdersForBuyer snapshot:', err);
      }
    );
  },

  async seedStarterCKMenu(ckTenantId: string): Promise<void> {
    const starters = [
      { name: 'Special Butter Chicken Gravy Base', category: 'Gravies & Curries', unit: 'kg', pricePerUnit: 350, minOrderQty: 5, isAvailable: true, description: 'Rich tomato cashew makhani gravy base for outlet finishing.' },
      { name: 'Hyderabadi Dum Biryani Rice Base', category: 'Rice & Biryani', unit: 'deg', pricePerUnit: 2800, minOrderQty: 1, isAvailable: true, description: 'Pre-cooked seasoned dum biryani rice layer batch (approx. 10 kg / 25 portions).' },
      { name: 'Tandoori Chicken Marinated Batches', category: 'Marinated Meats', unit: 'kg', pricePerUnit: 280, minOrderQty: 5, isAvailable: true, description: 'First and second marinade completed, vacuum packed, ready for skewering.' },
      { name: 'Slow-Cooked Mutton Rogan Josh Gravy', category: 'Gravies & Curries', unit: 'kg', pricePerUnit: 480, minOrderQty: 5, isAvailable: true, description: 'Traditional Kashmiri style clarified gravy ready for meat addition.' },
      { name: 'Paneer Tikka Marinated Cubes', category: 'Marinated Meats', unit: 'kg', pricePerUnit: 320, minOrderQty: 3, isAvailable: true, description: 'Fresh Malai paneer cubes in mustard ajwain marinade.' },
      { name: 'Rumali Roti Frozen Ready-to-Puff', category: 'Bakery & Breads', unit: 'pcs', pricePerUnit: 8, minOrderQty: 50, isAvailable: true, description: 'Pre-rolled rumali sheets ready to flash cook on inverted tawa.' },
    ];

    for (const item of starters) {
      await this.createCKMenuItem(ckTenantId, item as any);
    }
  },

  // 12. Online Aggregators (Zomato & Swiggy) Zero-Cost Direct Ingestion & Matching
  async findTenantByAggregatorEmail(targetEmail: string): Promise<{ tenantId: string; locationId: string; businessName: string; email: string } | null> {
    const cleanEmail = (targetEmail || '').trim().toLowerCase();
    if (!cleanEmail) return null;

    // A. Query tenants collection where aggregatorEmail matches
    let q = query(collection(db, 'tenants'), where('aggregatorEmail', '==', cleanEmail), limit(1));
    let snap = await getDocs(q);

    // B. Fallback to adminEmail
    if (snap.empty) {
      q = query(collection(db, 'tenants'), where('adminEmail', '==', cleanEmail), limit(1));
      snap = await getDocs(q);
    }

    // C. Fallback to email
    if (snap.empty) {
      q = query(collection(db, 'tenants'), where('email', '==', cleanEmail), limit(1));
      snap = await getDocs(q);
    }

    if (snap.empty) {
      return null;
    }

    const tenantDoc = snap.docs[0];
    const tenantData = tenantDoc.data();
    const tenantId = tenantDoc.id;

    // Retrieve primary location
    let locationId = 'loc-primary';
    try {
      const locSnap = await getDocs(collection(db, 'tenants', tenantId, 'locations'));
      if (!locSnap.empty) {
        locationId = locSnap.docs[0].id;
      }
    } catch (_) {}

    return {
      tenantId,
      locationId,
      businessName: tenantData.displayName || tenantData.businessName || tenantId,
      email: cleanEmail,
    };
  },

  async ingestAggregatorOrder(payload: {
    restaurantEmail: string;
    aggregatorPlatform: 'ZOMATO' | 'SWIGGY';
    aggregatorOrderId: string;
    isCancellation?: boolean;
    cancellationReason?: string;
    customerName?: string;
    customerPhone?: string;
    deliveryRiderName?: string;
    deliveryRiderPhone?: string;
    items: Array<{ itemName: string; qty: number; price: number; note?: string }>;
    totalAmount?: number;
    specialNote?: string;
  }): Promise<{ success: boolean; orderId?: string; kotNo?: number; message?: string }> {
    const tenantInfo = await this.findTenantByAggregatorEmail(payload.restaurantEmail);
    if (!tenantInfo) {
      return {
        success: false,
        message: `No active restaurant tenant found registered with email "${payload.restaurantEmail}". Please verify the email in onboarding / business profile.`,
      };
    }

    const { tenantId, locationId, businessName } = tenantInfo;

    // Automated Cancellation Handling: If this payload is a cancellation notification, mark matching order CANCELLED
    if (payload.isCancellation) {
      const ordersRef = collection(db, 'tenants', tenantId, 'locations', locationId, 'orders');
      const cancelQ = query(ordersRef, where('aggregatorOrderId', '==', payload.aggregatorOrderId), limit(1));
      const cancelSnap = await getDocs(cancelQ);
      if (!cancelSnap.empty) {
        const orderDoc = cancelSnap.docs[0];
        await updateDoc(orderDoc.ref, {
          status: 'CANCELLED',
          specialNote: payload.cancellationReason || `Cancelled by ${payload.aggregatorPlatform}`,
          updatedAt: serverTimestamp(),
        });
        return {
          success: true,
          orderId: orderDoc.id,
          kotNo: (orderDoc.data() as any).kotNo || 0,
          message: `Successfully marked ${payload.aggregatorPlatform} Order #${payload.aggregatorOrderId} as CANCELLED for ${businessName} (Excluded from sales)`,
        };
      }
    }

    const kotNo = await this.getNextSequenceNumber(tenantId, locationId);
    const computedTotal = payload.totalAmount ?? payload.items.reduce((sum, it) => sum + (it.price * it.qty), 0);

    // Attempt to map items to existing menu items for automated inventory stock deduction
    let existingItemsMap = new Map<string, MenuItem>();
    try {
      const menuSnap = await getDocs(collection(db, 'tenants', tenantId, 'locations', locationId, 'menuItems'));
      menuSnap.forEach(d => {
        const item = d.data() as MenuItem;
        existingItemsMap.set(item.name.toLowerCase().trim(), { ...item, id: d.id });
      });
    } catch (_) {}

    const orderItems: OrderItem[] = payload.items.map(it => {
      const matched = existingItemsMap.get(it.itemName.toLowerCase().trim());
      return {
        itemId: matched?.id || `ext-${Math.random().toString(36).slice(2, 8)}`,
        baseItemId: matched?.id,
        itemName: it.itemName,
        qty: it.qty,
        price: it.price,
        note: it.note || (matched ? undefined : '(Online Special)'),
        portionDeduction: matched?.trackInventory ? 1 : undefined,
      };
    });

    const orderPayload: Omit<Order, 'id'> = {
      orderNumber: kotNo,
      kotNo,
      orderType: payload.aggregatorPlatform === 'ZOMATO' ? 'ONLINE_ZOMATO' : 'ONLINE_SWIGGY',
      tableId: null,
      tableNo: 0,
      captainId: 'system-aggregator',
      captainName: payload.aggregatorPlatform === 'ZOMATO' ? 'Zomato Online' : 'Swiggy Online',
      status: 'RUNNING',
      paymentStatus: 'PAID',
      paymentMethod: payload.aggregatorPlatform === 'ZOMATO' ? 'ZOMATO_PAY' : 'SWIGGY_PAY',
      payments: [
        {
          id: `pay-${Date.now()}`,
          method: payload.aggregatorPlatform === 'ZOMATO' ? 'ZOMATO_PAY' : 'SWIGGY_PAY',
          amount: computedTotal,
          timestamp: new Date().toISOString(),
          reference: `${payload.aggregatorPlatform} Paid #${payload.aggregatorOrderId}`,
        },
      ],
      items: orderItems,
      subtotal: computedTotal,
      totalAmount: computedTotal,
      specialNote: payload.specialNote || `Online Order from ${payload.aggregatorPlatform}`,
      aggregatorOrderId: payload.aggregatorOrderId,
      aggregatorPlatform: payload.aggregatorPlatform,
      customerName: payload.customerName || 'Online Diner',
      customerPhone: payload.customerPhone || '',
      deliveryRiderName: payload.deliveryRiderName || 'Valet / Rider Assigned',
      deliveryRiderPhone: payload.deliveryRiderPhone || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const orderId = await this.createOrder(orderPayload, tenantId, locationId);

    return {
      success: true,
      orderId,
      kotNo,
      message: `Successfully ingested ${payload.aggregatorPlatform} Order #${payload.aggregatorOrderId} for ${businessName}!`,
    };
  },

  async simulateTestAggregatorOrder(
    tenantId: string,
    platform: 'ZOMATO' | 'SWIGGY' = 'ZOMATO',
    locationId: string = 'loc-primary'
  ): Promise<{ success: boolean; orderId: string; kotNo: number }> {
    const kotNo = await this.getNextSequenceNumber(tenantId, locationId);
    const randSuffix = Math.floor(1000 + Math.random() * 9000);

    const isZomato = platform === 'ZOMATO';
    const sampleItems: OrderItem[] = isZomato
      ? [
          { itemId: 'sim-1', itemName: 'Special Chicken Dum Biryani', qty: 2, price: 320, note: 'Extra Raita & Salan' },
          { itemId: 'sim-2', itemName: 'Butter Garlic Naan', qty: 3, price: 55 },
          { itemId: 'sim-3', itemName: 'Gulab Jamun (2 pcs)', qty: 1, price: 90 },
        ]
      : [
          { itemId: 'sim-4', itemName: 'Paneer Butter Masala', qty: 1, price: 260, note: 'Medium Spicy' },
          { itemId: 'sim-5', itemName: 'Jeera Fried Rice', qty: 1, price: 180 },
          { itemId: 'sim-6', itemName: 'Masala Chaas (Spiced Buttermilk)', qty: 2, price: 40 },
        ];

    const totalAmount = sampleItems.reduce((acc, it) => acc + (it.price * it.qty), 0);
    const orderRef = doc(collection(db, 'tenants', tenantId, 'locations', locationId, 'orders'));

    const sampleOrder: Order = {
      id: orderRef.id,
      orderNumber: kotNo,
      kotNo,
      tenantId,
      locationId,
      orderType: isZomato ? 'ONLINE_ZOMATO' : 'ONLINE_SWIGGY',
      tableId: null,
      tableNo: 0,
      captainId: 'sim-aggregator',
      captainName: isZomato ? 'Zomato Online' : 'Swiggy Online',
      status: 'RUNNING',
      paymentStatus: 'PAID',
      paymentMethod: isZomato ? 'ZOMATO_PAY' : 'SWIGGY_PAY',
      payments: [
        {
          id: `pay-sim-${Date.now()}`,
          method: isZomato ? 'ZOMATO_PAY' : 'SWIGGY_PAY',
          amount: totalAmount,
          timestamp: new Date().toISOString(),
          reference: `${platform} Paid #${isZomato ? 'ZOM-' : 'SWIG-'}${randSuffix}`,
        },
      ],
      items: sampleItems,
      subtotal: totalAmount,
      totalAmount,
      specialNote: isZomato ? "Online Delivery - Please don't ring bell, baby is sleeping" : 'Pack cutlery & extra paper napkins',
      aggregatorOrderId: `${isZomato ? 'ZOM-' : 'SWIG-'}${randSuffix}`,
      aggregatorPlatform: platform,
      customerName: isZomato ? 'Rahul Sharma' : 'Deepika Rao',
      customerPhone: isZomato ? '+91 98765 43210' : '+91 98490 12345',
      deliveryRiderName: isZomato ? 'Suresh Kumar (Zomato Valet)' : 'Mahesh Gowda (Swiggy Rider)',
      deliveryRiderPhone: '+91 91234 56789',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(orderRef, sampleOrder);
    return { success: true, orderId: orderRef.id, kotNo };
  }

};
