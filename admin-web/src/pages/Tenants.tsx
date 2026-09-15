import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
  CheckCircle
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

      // A. Create Tenant profile
      await setDoc(doc(db, 'tenants', tenantId), {
        id: tenantId,
        businessName: tenantName.trim(),
        displayName: tenantName.trim(),
        businessType,
        status: 'ACTIVE',
        multiLocationEnabled,
        adminUsername: adminMobile.trim(),
        adminPassword: adminPassword.trim(),
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
                  </div>

                  {/* Real-time Branch Manager for this Tenant */}
                  <TenantLocationsManager tenantId={tenant.id} />
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(tenant)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 rounded-xl transition-all cursor-pointer"
                  >
                    <Edit2 size={13} />
                    Edit Info
                  </button>
                  <button
                    onClick={() => toggleTenantStatus(tenant.id, tenant.status || 'ACTIVE')}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-xl transition-all cursor-pointer ${
                      isActive
                        ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20'
                        : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    <Power size={13} />
                    {isActive ? 'Deactivate' : 'Activate'}
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
