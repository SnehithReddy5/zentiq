import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import {
  Building2,
  Plus,
  Power,
  ShieldCheck,
  ShieldAlert,
  Search,
  KeyRound,
  UserCheck,
  Calendar,
  X,
  Edit2,
  CheckCircle2,
  UtensilsCrossed,
  Store,
  Coffee,
  Truck,
  MapPin,
  ChevronDown,
  ChevronUp,
  Ban,
  CheckCircle,
  Trash2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

// Subcomponent to display and control branches for each tenant
const TenantLocationsManager = ({ tenantId }: { tenantId: string }) => {
  const [locations, setLocations] = useState<any[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tenants', tenantId, 'locations'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setLocations(list);
    });
    return () => unsub();
  }, [tenantId]);

  const toggleLocationStatus = async (locId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    const confirmMsg = newStatus === 'DISABLED'
      ? 'Disable this branch? POS devices connected to this branch will immediately be blocked from operating.'
      : 'Enable this branch for POS operations?';
    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'locations', locId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      alert('Error updating branch: ' + err.message);
    }
  };

  return (
    <div className="border-t border-slate-800/80 pt-3">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <MapPin size={13} />
          Branches & Locations ({locations.length})
        </span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isExpanded && (
        <div className="mt-2.5 space-y-2 bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800">
          {locations.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic text-center py-2">No branches configured yet</p>
          ) : (
            locations.map(loc => {
              const isDisabled = loc.status === 'DISABLED';
              return (
                <div
                  key={loc.id}
                  className="flex items-center justify-between bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs"
                >
                  <div className="flex-1 mr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-xs">{loc.name}</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                          isDisabled
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {loc.status || 'ACTIVE'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[10px] mt-0.5 truncate">
                      {loc.address || 'HQ Address'} • 📞 {loc.phone || 'N/A'}
                    </p>
                  </div>

                  <button
                    onClick={() => toggleLocationStatus(loc.id, loc.status || 'ACTIVE')}
                    className={`text-[10px] font-bold py-1 px-2.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      isDisabled
                        ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {isDisabled ? <CheckCircle size={10} /> : <Ban size={10} />}
                    {isDisabled ? 'Enable' : 'Disable'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export const Tenants = () => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Onboard Tenant Form State
  const [tenantName, setTenantName] = useState('');
  const [initialLocation, setInitialLocation] = useState('Main Branch');
  const [businessType, setBusinessType] = useState<'RESTAURANT' | 'CURRY_POINT' | 'TIFFIN_CENTER' | 'CAFE' | 'FOOD_TRUCK'>('RESTAURANT');
  const [adminMobile, setAdminMobile] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [multiLocationEnabled, setMultiLocationEnabled] = useState(true);
  const [dineInEnabled, setDineInEnabled] = useState(true);
  const [pickupEnabled, setPickupEnabled] = useState(true);

  // Edit Modal State
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'RESTAURANT' | 'CURRY_POINT' | 'TIFFIN_CENTER' | 'CAFE' | 'FOOD_TRUCK'>('RESTAURANT');
  const [editAdminMobile, setEditAdminMobile] = useState('');
  const [editAdminPassword, setEditAdminPassword] = useState('');
  const [editMultiLocationEnabled, setEditMultiLocationEnabled] = useState(true);
  const [editDineInEnabled, setEditDineInEnabled] = useState(true);
  const [editPickupEnabled, setEditPickupEnabled] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editRenewalDate, setEditRenewalDate] = useState('');
  const [deleteTargetTenant, setDeleteTargetTenant] = useState<any | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Real-time snapshot listener on tenants
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tenants'), (snap) => {
      const list: any[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setTenants(list);
    });
    return () => unsub();
  }, []);

  // 1. Create / Onboard Tenant
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName || !adminMobile || !adminPassword) {
      alert('Please fill all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const tenantId = tenantName.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');
      const locationId = 'loc-primary';

      // Calculate 1 Calendar Year Renewal Date
      const now = new Date();
      const renewalDate = new Date(now);
      renewalDate.setFullYear(now.getFullYear() + 1);

      // A. Create Tenant profile with Annual Renewal
      await setDoc(doc(db, 'tenants', tenantId), {
        id: tenantId,
        businessName: tenantName.trim(),
        displayName: tenantName.trim(),
        businessType,
        status: 'ACTIVE',
        multiLocationEnabled,
        adminUsername: adminMobile.trim(),
        adminPassword: adminPassword.trim(),
        subscriptionPlan: 'ANNUAL',
        renewalDate: renewalDate.toISOString(),
        provisionedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // B. Create Initial Location
      await setDoc(doc(db, 'tenants', tenantId, 'locations', locationId), {
        id: locationId,
        tenantId,
        name: initialLocation.trim() || 'Main Branch',
        address: 'HQ Location',
        phone: adminMobile.trim(),
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
      });

      // C. Create Tenant Super Admin in tenant users
      await setDoc(doc(db, 'tenants', tenantId, 'users', adminMobile.trim()), {
        id: adminMobile.trim(),
        name: `${tenantName} Admin`,
        mobile: adminMobile.trim(),
        password: adminPassword.trim(),
        role: 'ADMIN',
        tenantId,
        locationIds: ['*'],
        active: true,
        createdAt: serverTimestamp(),
      });

      // D. Register in root users collection for immediate mobile direct lookup
      await setDoc(doc(db, 'users', adminMobile.trim()), {
        id: adminMobile.trim(),
        name: `${tenantName} Admin`,
        mobile: adminMobile.trim(),
        password: adminPassword.trim(),
        role: 'ADMIN',
        tenantId,
        locationIds: ['*'],
      });

      if (adminMobile.trim().toLowerCase() !== adminMobile.trim()) {
        await setDoc(doc(db, 'users', adminMobile.trim().toLowerCase()), {
          id: adminMobile.trim(),
          name: `${tenantName} Admin`,
          mobile: adminMobile.trim(),
          password: adminPassword.trim(),
          role: 'ADMIN',
          tenantId,
          locationIds: ['*'],
        });
      }

      // E. Features configuration
      await setDoc(doc(db, 'tenants', tenantId, 'features', 'config'), {
        tablesEnabled: dineInEnabled,
        dineInEnabled,
        pickupEnabled,
        multiLocationEnabled,
        kitchenPrinterEnabled: true,
        splitPaymentsEnabled: true,
        inventoryEnabled: false,
        insightsEnabled: true,
        createdAt: serverTimestamp(),
      });

      // F. Default Branding
      await setDoc(doc(db, 'tenants', tenantId, 'branding', 'config'), {
        businessName: tenantName.trim(),
        displayName: tenantName.trim(),
        receiptHeader: tenantName.toUpperCase().trim(),
        receiptFooter: 'Thank You & Visit Again!!',
        createdAt: serverTimestamp(),
      });

      // Reset form
      setTenantName('');
      setAdminMobile('');
      setAdminPassword('');
      setIsModalOpen(false);
      alert('Client instance provisioned successfully! Credentials are live immediately.');
    } catch (err: any) {
      console.error(err);
      alert('Failed to provision client: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Open Edit Modal
  const openEditModal = (tenant: any) => {
    setEditingTenant(tenant);
    setEditName(tenant.businessName || tenant.displayName || '');
    setEditType(tenant.businessType || 'RESTAURANT');
    setEditAdminMobile(tenant.adminUsername || '');
    setEditAdminPassword(tenant.adminPassword || '');
    setEditMultiLocationEnabled(tenant.multiLocationEnabled ?? true);
    if (tenant.renewalDate) {
      setEditRenewalDate(tenant.renewalDate.split('T')[0]);
    } else {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      setEditRenewalDate(d.toISOString().split('T')[0]);
    }

    // Fetch feature configuration
    const featRef = doc(db, 'tenants', tenant.id, 'features', 'config');
    onSnapshot(featRef, (docSnap) => {
      if (docSnap.exists()) {
        const f = docSnap.data();
        setEditDineInEnabled(f.dineInEnabled ?? true);
        setEditPickupEnabled(f.pickupEnabled ?? true);
        setEditMultiLocationEnabled(f.multiLocationEnabled ?? true);
      }
    });
  };

  // 3. Save Edit Tenant
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    setIsSavingEdit(true);
    try {
      // Update tenant document
      await updateDoc(doc(db, 'tenants', editingTenant.id), {
        businessName: editName.trim(),
        displayName: editName.trim(),
        businessType: editType,
        multiLocationEnabled: editMultiLocationEnabled,
        adminUsername: editAdminMobile.trim() || undefined,
        adminPassword: editAdminPassword.trim() || undefined,
        renewalDate: editRenewalDate ? new Date(editRenewalDate).toISOString() : undefined,
        updatedAt: serverTimestamp(),
      });

      // Update features
      await setDoc(doc(db, 'tenants', editingTenant.id, 'features', 'config'), {
        tablesEnabled: editDineInEnabled,
        dineInEnabled: editDineInEnabled,
        pickupEnabled: editPickupEnabled,
        multiLocationEnabled: editMultiLocationEnabled,
      }, { merge: true });

      // If admin credentials changed, update root user doc as well
      if (editAdminMobile && editAdminPassword) {
        await setDoc(doc(db, 'users', editAdminMobile.trim()), {
          id: editAdminMobile.trim(),
          name: `${editName} Admin`,
          mobile: editAdminMobile.trim(),
          password: editAdminPassword.trim(),
          role: 'ADMIN',
          tenantId: editingTenant.id,
          locationIds: ['*'],
        });

        if (editAdminMobile.trim().toLowerCase() !== editAdminMobile.trim()) {
          await setDoc(doc(db, 'users', editAdminMobile.trim().toLowerCase()), {
            id: editAdminMobile.trim(),
            name: `${editName} Admin`,
            mobile: editAdminMobile.trim(),
            password: editAdminPassword.trim(),
            role: 'ADMIN',
            tenantId: editingTenant.id,
            locationIds: ['*'],
          });
        }
      }

      setEditingTenant(null);
      alert('Client information updated successfully!');
    } catch (err: any) {
      console.error(err);
      alert('Failed to update tenant: ' + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 4. Toggle Status (Active / Deactivated)
  const toggleTenantStatus = async (tenantId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    const confirmMsg = newStatus === 'DEACTIVATED'
      ? 'Deactivating this client will instantly HALT ALL OPERATIONS across all mobile POS devices and locations. Are you sure?'
      : 'Activate this client instance? POS functions will resume immediately.';

    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, 'tenants', tenantId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error(err);
      alert('Failed to update tenant status: ' + err.message);
    }
  };

  const filteredTenants = tenants.filter(t =>
    (t.businessName || t.displayName || '').toLowerCase().includes(search.toLowerCase()) ||
    t.id.toLowerCase().includes(search.toLowerCase())
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'CAFE': return <Coffee size={14} className="text-amber-400" />;
      case 'FOOD_TRUCK': return <Truck size={14} className="text-cyan-400" />;
      case 'CURRY_POINT': return <Store size={14} className="text-orange-400" />;
      default: return <UtensilsCrossed size={14} className="text-purple-400" />;
    }
  };

  // Calculate Annual Renewal Status
  const getRenewalInfo = (tenant: any) => {
    let renewal: Date;
    if (tenant.renewalDate) {
      renewal = new Date(tenant.renewalDate);
    } else {
      const created = tenant.createdAt?.seconds ? new Date(tenant.createdAt.seconds * 1000) : new Date();
      renewal = new Date(created);
      renewal.setFullYear(created.getFullYear() + 1);
    }
    const daysRemaining = Math.ceil((renewal.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return {
      dateStr: renewal.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      daysRemaining,
      isOverdue: daysRemaining <= 0,
      isExpiringSoon: daysRemaining > 0 && daysRemaining <= 30
    };
  };

  // Helper to delete all documents in a subcollection
  const deleteSubcollectionDocs = async (colRef: any) => {
    try {
      const snap = await getDocs(colRef);
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    } catch (err) {
      console.warn('Subcollection delete skip:', err);
    }
  };

  // Cascade Delete Tenant with ALL data
  const handleCascadeDeleteTenant = async () => {
    if (!deleteTargetTenant) return;
    const tenantId = deleteTargetTenant.id;
    const expectedConfirm = (deleteTargetTenant.businessName || deleteTargetTenant.id).trim();

    if (deleteConfirmationInput.trim().toLowerCase() !== expectedConfirm.toLowerCase()) {
      alert(`Please type "${expectedConfirm}" exactly to confirm permanent deletion.`);
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Delete all locations and their nested subcollections
      const locsSnap = await getDocs(collection(db, 'tenants', tenantId, 'locations'));
      for (const locDoc of locsSnap.docs) {
        const locId = locDoc.id;
        await deleteSubcollectionDocs(collection(db, 'tenants', tenantId, 'locations', locId, 'menuItems'));
        await deleteSubcollectionDocs(collection(db, 'tenants', tenantId, 'locations', locId, 'menuCategories'));
        await deleteSubcollectionDocs(collection(db, 'tenants', tenantId, 'locations', locId, 'tables'));
        await deleteSubcollectionDocs(collection(db, 'tenants', tenantId, 'locations', locId, 'orders'));
        await deleteDoc(locDoc.ref);
      }

      // 2. Delete tenant direct subcollections
      const subCollections = ['users', 'tables', 'menuItems', 'menuCategories', 'orders'];
      for (const sub of subCollections) {
        await deleteSubcollectionDocs(collection(db, 'tenants', tenantId, sub));
      }

      // 3. Delete feature & branding docs
      try { await deleteDoc(doc(db, 'tenants', tenantId, 'features', 'config')); } catch (_) {}
      try { await deleteDoc(doc(db, 'tenants', tenantId, 'branding', 'config')); } catch (_) {}

      // 4. Delete root collections tied to this tenant
      const rootCollections = ['users', 'location_requests', 'orders', 'tables', 'menuItems', 'menuCategories'];
      for (const colName of rootCollections) {
        try {
          const q = query(collection(db, colName), where('tenantId', '==', tenantId));
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            await deleteDoc(d.ref);
          }
        } catch (err) {
          console.warn(`Error wiping root collection ${colName}:`, err);
        }
      }

      // 5. Delete root user documents created with admin username
      if (deleteTargetTenant.adminUsername) {
        const username = deleteTargetTenant.adminUsername.trim();
        try { await deleteDoc(doc(db, 'users', username)); } catch (_) {}
        try { await deleteDoc(doc(db, 'users', username.toLowerCase())); } catch (_) {}
      }

      // 6. Delete the primary tenant document
      await deleteDoc(doc(db, 'tenants', tenantId));

      alert(`Tenant "${expectedConfirm}" and ALL associated data have been permanently wiped from the database.`);
      setDeleteTargetTenant(null);
      setDeleteConfirmationInput('');
    } catch (err: any) {
      console.error('Cascade delete error:', err);
      alert('Failed to delete tenant: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-5 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <Building2 className="text-indigo-400" size={28} />
            Client Tenants
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Provision client credentials, configure locations & order types, and activate/deactivate client instances.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <Plus size={16} />
          Onboard New Client
        </button>
      </div>

      {/* Search & Statistics Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search clients by name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 text-xs text-white pl-9 pr-3.5 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 self-end sm:self-auto">
          <span>Total: <strong className="text-white">{tenants.length}</strong></span>
          <span>•</span>
          <span>Active: <strong className="text-emerald-400">{tenants.filter(t => t.status === 'ACTIVE').length}</strong></span>
          <span>•</span>
          <span>Deactivated: <strong className="text-rose-400">{tenants.filter(t => t.status === 'DEACTIVATED').length}</strong></span>
        </div>
      </div>

      {/* Tenants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTenants.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-slate-900/40 border border-slate-800 rounded-3xl">
            <Building2 size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-300">No client tenants found</p>
            <p className="text-xs text-slate-500 mt-1">Click "Onboard New Client" to provision your first business.</p>
          </div>
        ) : (
          filteredTenants.map(tenant => {
            const isActive = tenant.status === 'ACTIVE';
            return (
              <div
                key={tenant.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 p-5 rounded-3xl transition-all shadow-xl backdrop-blur-xl flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block">
                        {tenant.id}
                      </span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {tenant.businessName || tenant.displayName || 'Untitled Client'}
                      </h3>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {isActive ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      {tenant.status || 'ACTIVE'}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Business Type:</span>
                      <span className="text-slate-200 font-semibold flex items-center gap-1.5 capitalize">
                        {getTypeIcon(tenant.businessType)}
                        {(tenant.businessType || 'RESTAURANT').toLowerCase().replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Multi-Branch:</span>
                      <span className={`font-semibold ${tenant.multiLocationEnabled !== false ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {tenant.multiLocationEnabled !== false ? 'Allowed' : 'Disabled'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Client Admin:</span>
                      <span className="text-slate-200 font-mono font-medium">
                        {tenant.adminUsername || 'N/A'}
                      </span>
                    </div>

                    {/* Annual Calendar Renewal */}
                    {(() => {
                      const renewal = getRenewalInfo(tenant);
                      return (
                        <div className="flex items-center justify-between pt-1 text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} className="text-indigo-400" />
                            Annual Renewal:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-200 font-semibold text-[11px]">{renewal.dateStr}</span>
                            {renewal.isOverdue ? (
                              <span className="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                Overdue
                              </span>
                            ) : renewal.isExpiringSoon ? (
                              <span className="bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                {renewal.daysRemaining}d left
                              </span>
                            ) : (
                              <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                Active (1-Yr)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Real-time Branch Manager for this Tenant */}
                  <TenantLocationsManager tenantId={tenant.id} />
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(tenant)}
                    className="flex-1 flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 rounded-xl transition-all cursor-pointer"
                  >
                    <Edit2 size={12} />
                    Edit
                  </button>
                  <button
                    onClick={() => toggleTenantStatus(tenant.id, tenant.status || 'ACTIVE')}
                    className={`flex-1 flex items-center justify-center gap-1 text-xs font-bold py-2 rounded-xl transition-all cursor-pointer ${
                      isActive
                        ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/20'
                        : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    <Power size={12} />
                    {isActive ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => {
                      setDeleteTargetTenant(tenant);
                      setDeleteConfirmationInput('');
                    }}
                    title="Delete Tenant & All Data"
                    className="p-2 bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Onboard Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white">Onboard New Client</h2>
                <p className="text-xs text-slate-400 mt-0.5">Provision a new restaurant instance & initial Super Admin</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Restaurant / Brand Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hyderabad Spice Club"
                  value={tenantName}
                  onChange={e => setTenantName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Initial Branch Name</label>
                  <input
                    type="text"
                    value={initialLocation}
                    onChange={e => setInitialLocation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Business Type</label>
                  <select
                    value={businessType}
                    onChange={(e: any) => setBusinessType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="RESTAURANT">Restaurant</option>
                    <option value="CURRY_POINT">Curry Point</option>
                    <option value="TIFFIN_CENTER">Tiffin Center</option>
                    <option value="CAFE">Cafe</option>
                    <option value="FOOD_TRUCK">Food Truck</option>
                  </select>
                </div>
              </div>

              {/* Order Types & Multi-Location Licensing */}
              <div className="bg-slate-800/40 border border-slate-800 p-3 rounded-2xl space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Calendar size={13} className="text-indigo-400" />
                    Annual Renewal Date (Calendar Year)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = editRenewalDate ? new Date(editRenewalDate) : new Date();
                      cur.setFullYear(cur.getFullYear() + 1);
                      setEditRenewalDate(cur.toISOString().split('T')[0]);
                    }}
                    className="text-[10px] bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30 px-2 py-0.5 rounded-md font-bold cursor-pointer transition-all"
                  >
                    +1 Year Renewal
                  </button>
                </div>
                <input
                  type="date"
                  value={editRenewalDate}
                  onChange={(e) => setEditRenewalDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-500">Each provisioned client renews annually every calendar year.</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 p-3 rounded-2xl space-y-2">
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Service & Branch Entitlements
                </span>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>Allow Multi-Location Branch Expansion</span>
                  <input
                    type="checkbox"
                    checked={multiLocationEnabled}
                    onChange={e => setMultiLocationEnabled(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>Enable Dine-In Tables</span>
                  <input
                    type="checkbox"
                    checked={dineInEnabled}
                    onChange={e => setDineInEnabled(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>Enable Pick-Up / Takeaway</span>
                  <input
                    type="checkbox"
                    checked={pickupEnabled}
                    onChange={e => setPickupEnabled(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Client Admin Initial Credentials (Restaurant Owner)
                </span>
                <div className="space-y-2.5">
                  <div>
                    <label className="text-xs text-slate-300 font-semibold block mb-1">Client Admin Username / Mobile / Email *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 9876543210 or admin@brand.com"
                      value={adminMobile}
                      onChange={e => setAdminMobile(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 font-semibold block mb-1">Client Admin Initial Password *</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter a secure password"
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Provisioning...' : 'Provision Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permanent Cascade Deletion Modal */}
      {deleteTargetTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-rose-500/40 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-rose-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Delete Tenant & Purge All Data</h2>
                  <p className="text-xs text-rose-400/90 font-medium mt-0.5">Permanent cascade deletion</p>
                </div>
              </div>
              <button
                onClick={() => setDeleteTargetTenant(null)}
                disabled={isDeleting}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-rose-950/25 border border-rose-500/20 rounded-2xl p-4 text-xs space-y-2">
              <p className="text-rose-200 font-semibold">
                You are about to permanently delete:
              </p>
              <div className="bg-black/40 p-2.5 rounded-xl font-mono text-slate-200 text-xs">
                <div><strong className="text-slate-400">Business:</strong> {deleteTargetTenant.businessName || deleteTargetTenant.id}</div>
                <div><strong className="text-slate-400">Tenant ID:</strong> {deleteTargetTenant.id}</div>
              </div>
              <p className="text-slate-300">
                This action will <strong className="text-rose-400">recursively destroy all data</strong> belonging to this tenant, including:
              </p>
              <ul className="list-disc list-inside text-slate-400 space-y-1 pl-1 text-[11px]">
                <li>All branch locations, floor zones & table configurations</li>
                <li>Full menu catalog, variants, and categories</li>
                <li>All settled and historical order / billing records</li>
                <li>Staff user accounts and root admin credentials</li>
                <li>Branding and feature configurations</li>
              </ul>
              <p className="text-amber-400 font-semibold pt-1 text-[11px]">
                ⚠️ This operation CANNOT be undone!
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                Type <span className="text-rose-400 font-bold font-mono select-all">{deleteTargetTenant.businessName || deleteTargetTenant.id}</span> to confirm:
              </label>
              <input
                type="text"
                placeholder="Type tenant name here..."
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                disabled={isDeleting}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteTargetTenant(null)}
                disabled={isDeleting}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCascadeDeleteTenant}
                disabled={isDeleting || deleteConfirmationInput.trim().toLowerCase() !== (deleteTargetTenant.businessName || deleteTargetTenant.id).trim().toLowerCase()}
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Purging All Data...
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    Permanently Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white">Edit Client Instance</h2>
                <span className="text-xs text-indigo-400 font-mono">{editingTenant.id}</span>
              </div>
              <button onClick={() => setEditingTenant(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Restaurant / Brand Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Business Type</label>
                <select
                  value={editType}
                  onChange={(e: any) => setEditType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                >
                  <option value="RESTAURANT">Restaurant</option>
                  <option value="CURRY_POINT">Curry Point</option>
                  <option value="TIFFIN_CENTER">Tiffin Center</option>
                  <option value="CAFE">Cafe</option>
                  <option value="FOOD_TRUCK">Food Truck</option>
                </select>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 p-3 rounded-2xl space-y-2">
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Service & Branch Entitlements
                </span>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>Allow Multi-Location Branch Expansion</span>
                  <input
                    type="checkbox"
                    checked={editMultiLocationEnabled}
                    onChange={e => setEditMultiLocationEnabled(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>Enable Dine-In Tables</span>
                  <input
                    type="checkbox"
                    checked={editDineInEnabled}
                    onChange={e => setEditDineInEnabled(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>Enable Pick-Up / Takeaway</span>
                  <input
                    type="checkbox"
                    checked={editPickupEnabled}
                    onChange={e => setEditPickupEnabled(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </label>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Update Super Admin Credentials
                </span>
                <div className="space-y-2.5">
                  <div>
                    <label className="text-xs text-slate-300 font-semibold block mb-1">Admin Username / Mobile / Email</label>
                    <input
                      type="text"
                      value={editAdminMobile}
                      onChange={e => setEditAdminMobile(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 font-semibold block mb-1">New Password (or leave unchanged)</label>
                    <input
                      type="text"
                      value={editAdminPassword}
                      onChange={e => setEditAdminPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
