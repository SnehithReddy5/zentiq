import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  where,
  Timestamp,
  getAggregateFromServer,
  count,
  sum,
} from 'firebase/firestore';
import {
  Building2,
  MapPin,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  ShoppingBag,
  TrendingUp,
  IndianRupee,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  BarChart3,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

type VolumeScope = 'TODAY' | '7D' | '30D' | 'ALL';
type SortBy = 'ORDERS' | 'TODAY' | 'REVENUE' | 'NAME';

interface BranchVolume {
  locationId: string;
  locationName: string;
  status: string;
  orderCount: number;
  todayOrderCount: number;
  revenue: number;
  todayRevenue: number;
}

interface TenantVolume {
  tenantId: string;
  orderCount: number;
  todayOrderCount: number;
  revenue: number;
  todayRevenue: number;
  branches: BranchVolume[];
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [locationRequests, setLocationRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Order volume metrics state
  const [volumeScope, setVolumeScope] = useState<VolumeScope>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('ORDERS');
  const [clientSearch, setClientSearch] = useState('');
  const [expandedTenants, setExpandedTenants] = useState<Record<string, boolean>>({});
  const [volumeByTenant, setVolumeByTenant] = useState<Record<string, TenantVolume>>({});
  const [isRefreshingVolume, setIsRefreshingVolume] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Real-time Firestore subscriptions for tenants, locations, and branch requests
  useEffect(() => {
    const unsubTenants = onSnapshot(collection(db, 'tenants'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setTenants(list);
      setIsLoading(false);
    });

    const unsubLocations = onSnapshot(collectionGroup(db, 'locations'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        const parentTenantId = d.ref.parent?.parent?.id;
        list.push({
          id: d.id,
          ...d.data(),
          tenantId: d.data()?.tenantId || parentTenantId,
        });
      });
      setLocations(list);
    });

    const unsubRequests = onSnapshot(collectionGroup(db, 'locationRequests'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setLocationRequests(list);
    });

    return () => {
      unsubTenants();
      unsubLocations();
      unsubRequests();
    };
  }, []);

  const getScopeStartTimestamp = (scope: VolumeScope): Timestamp | null => {
    const now = new Date();
    if (scope === 'TODAY') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return Timestamp.fromDate(start);
    }
    if (scope === '7D') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      return Timestamp.fromDate(start);
    }
    if (scope === '30D') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      return Timestamp.fromDate(start);
    }
    return null;
  };

  const fetchOrderVolumes = useCallback(
    async (tenantList: any[], locationList: any[], scope: VolumeScope) => {
      if (tenantList.length === 0) {
        setVolumeByTenant({});
        return;
      }

      setIsRefreshingVolume(true);
      try {
        const now = new Date();
        const startOfTodayTs = Timestamp.fromDate(
          new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        );
        const scopeStartTs = getScopeStartTimestamp(scope);

        const safeAggregate = async (colRef: any, sinceTs: Timestamp | null) => {
          try {
            const q = sinceTs ? query(colRef, where('createdAt', '>=', sinceTs)) : colRef;
            const snap = await getAggregateFromServer(q, {
              totalCount: count(),
              totalRevenue: sum('totalAmount'),
            });
            const data = snap.data();
            return {
              count: Number(data.totalCount || 0),
              revenue: Number(data.totalRevenue || 0),
            };
          } catch (err) {
            console.warn('Aggregate query skipped:', err);
            return { count: 0, revenue: 0 };
          }
        };

        const tenantEntries = await Promise.all(
          tenantList.map(async (tenant) => {
            const tenantLocs = locationList.filter((l) => l.tenantId === tenant.id);

            const branchResults: BranchVolume[] = await Promise.all(
              tenantLocs.map(async (loc) => {
                const ordersCol = collection(db, 'tenants', tenant.id, 'locations', loc.id, 'orders');
                const [scopeAgg, todayAgg] = await Promise.all([
                  scope === 'TODAY' ? Promise.resolve(null) : safeAggregate(ordersCol, scopeStartTs),
                  safeAggregate(ordersCol, startOfTodayTs),
                ]);

                const activeAgg = scope === 'TODAY' ? todayAgg : (scopeAgg || todayAgg);
                return {
                  locationId: loc.id,
                  locationName: loc.name || 'Unnamed Branch',
                  status: loc.status || 'ACTIVE',
                  orderCount: activeAgg.count,
                  todayOrderCount: todayAgg.count,
                  revenue: activeAgg.revenue,
                  todayRevenue: todayAgg.revenue,
                };
              })
            );

            // Also include any legacy root-level tenant orders if present
            const legacyCol = collection(db, 'tenants', tenant.id, 'orders');
            const [legacyScopeAgg, legacyTodayAgg] = await Promise.all([
              scope === 'TODAY' ? Promise.resolve(null) : safeAggregate(legacyCol, scopeStartTs),
              safeAggregate(legacyCol, startOfTodayTs),
            ]);
            const activeLegacy = scope === 'TODAY' ? legacyTodayAgg : (legacyScopeAgg || legacyTodayAgg);

            const orderCount =
              branchResults.reduce((s, b) => s + b.orderCount, 0) + activeLegacy.count;
            const todayOrderCount =
              branchResults.reduce((s, b) => s + b.todayOrderCount, 0) + legacyTodayAgg.count;
            const revenue =
              branchResults.reduce((s, b) => s + b.revenue, 0) + activeLegacy.revenue;
            const todayRevenue =
              branchResults.reduce((s, b) => s + b.todayRevenue, 0) + legacyTodayAgg.revenue;

            if (activeLegacy.count > 0 || legacyTodayAgg.count > 0) {
              branchResults.push({
                locationId: 'root-legacy',
                locationName: 'Primary / Unscoped',
                status: 'ACTIVE',
                orderCount: activeLegacy.count,
                todayOrderCount: legacyTodayAgg.count,
                revenue: activeLegacy.revenue,
                todayRevenue: legacyTodayAgg.revenue,
              });
            }

            branchResults.sort((a, b) => b.orderCount - a.orderCount);

            return {
              tenantId: tenant.id,
              orderCount,
              todayOrderCount,
              revenue,
              todayRevenue,
              branches: branchResults,
            } as TenantVolume;
          })
        );

        const nextMap: Record<string, TenantVolume> = {};
        tenantEntries.forEach((entry) => {
          nextMap[entry.tenantId] = entry;
        });
        setVolumeByTenant(nextMap);
        setLastSyncedAt(new Date());
      } finally {
        setIsRefreshingVolume(false);
      }
    },
    []
  );

  // Re-aggregate order volumes whenever tenants, locations, or selected scope changes
  useEffect(() => {
    if (tenants.length > 0) {
      fetchOrderVolumes(tenants, locations, volumeScope);
    }
  }, [tenants, locations, volumeScope, fetchOrderVolumes]);

  const activeTenantsCount = tenants.filter((t) => t.status === 'ACTIVE' || !t.status).length;
  const deactivatedTenantsCount = tenants.filter(
    (t) => t.status === 'DEACTIVATED' || t.status === 'SUSPENDED'
  ).length;
  const pendingRequests = locationRequests.filter((r) => r.status === 'REQUESTED');

  // Platform-wide total order volume & revenue
  const platformTotals = useMemo(() => {
    const entries = Object.values(volumeByTenant);
    const totalOrders = entries.reduce((sumVal, e) => sumVal + e.orderCount, 0);
    const todayOrders = entries.reduce((sumVal, e) => sumVal + e.todayOrderCount, 0);
    const totalRevenue = entries.reduce((sumVal, e) => sumVal + e.revenue, 0);
    const todayRevenue = entries.reduce((sumVal, e) => sumVal + e.todayRevenue, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    return { totalOrders, todayOrders, totalRevenue, todayRevenue, avgOrderValue };
  }, [volumeByTenant]);

  // Joined, filtered, and sorted client order volume rows
  const clientVolumeRows = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const rows = tenants
      .map((t) => {
        const vol = volumeByTenant[t.id] || {
          tenantId: t.id,
          orderCount: 0,
          todayOrderCount: 0,
          revenue: 0,
          todayRevenue: 0,
          branches: [],
        };
        const branchCount = locations.filter((l) => l.tenantId === t.id).length;
        return {
          tenant: t,
          branchCount,
          ...vol,
        };
      })
      .filter((row) => {
        if (!q) return true;
        const name = String(row.tenant.businessName || row.tenant.displayName || '').toLowerCase();
        const type = String(row.tenant.businessType || '').toLowerCase();
        const id = String(row.tenant.id || '').toLowerCase();
        return name.includes(q) || type.includes(q) || id.includes(q);
      });

    rows.sort((a, b) => {
      if (sortBy === 'TODAY') return b.todayOrderCount - a.todayOrderCount || b.orderCount - a.orderCount;
      if (sortBy === 'REVENUE') return b.revenue - a.revenue || b.orderCount - a.orderCount;
      if (sortBy === 'NAME') {
        const nameA = String(a.tenant.businessName || a.tenant.displayName || '').toLowerCase();
        const nameB = String(b.tenant.businessName || b.tenant.displayName || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }
      return b.orderCount - a.orderCount || b.revenue - a.revenue;
    });

    return rows;
  }, [tenants, locations, volumeByTenant, clientSearch, sortBy]);

  const maxClientOrders = useMemo(
    () => Math.max(1, ...clientVolumeRows.map((r) => r.orderCount)),
    [clientVolumeRows]
  );

  const toggleTenantExpand = (tenantId: string) => {
    setExpandedTenants((prev) => ({ ...prev, [tenantId]: !prev[tenantId] }));
  };

  const scopeLabelMap: Record<VolumeScope, string> = {
    TODAY: 'Today',
    '7D': 'Last 7 Days',
    '30D': 'Last 30 Days',
    ALL: 'All Time',
  };

  return (
    <div className="space-y-7 animate-fadeIn">
      {/* Top Command Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-indigo-950/50 via-purple-950/30 to-slate-900/70 p-6 rounded-3xl border border-indigo-500/20 backdrop-blur-xl">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Live Multi-Tenant Network
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Platform Command Center</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Monitor total platform order volume, per-client order throughput, branch expansion requests, and tenant status across Zentiq POS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe Selector */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-2xl p-1">
            {(['TODAY', '7D', '30D', 'ALL'] as VolumeScope[]).map((scope) => (
              <button
                key={scope}
                onClick={() => setVolumeScope(scope)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  volumeScope === scope
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {scopeLabelMap[scope]}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchOrderVolumes(tenants, locations, volumeScope)}
            disabled={isRefreshingVolume}
            className="px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer flex items-center"
            title="Refresh live order counts"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshingVolume ? 'animate-spin text-indigo-400' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => onNavigate('tenants')}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> + Onboard Client
          </button>
        </div>
      </div>

      {/* Primary Order Volume & Network KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Platform Order Volume */}
        <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900/80 border border-indigo-500/30 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
              Total Order Volume ({scopeLabelMap[volumeScope]})
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight">
            {isRefreshingVolume && platformTotals.totalOrders === 0
              ? '...'
              : platformTotals.totalOrders.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-semibold flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1" />
            <span>{platformTotals.todayOrders.toLocaleString('en-IN')} orders today</span>
          </div>
        </div>

        {/* Platform Order GMV / Revenue */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Platform Order Value ({scopeLabelMap[volumeScope]})
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight">
            ₹{platformTotals.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Avg ₹{platformTotals.avgOrderValue.toFixed(0)} / order</span>
            <span className="text-emerald-400 font-semibold">
              ₹{platformTotals.todayRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} today
            </span>
          </div>
        </div>

        {/* Active Tenants & Billable Branches */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden hover:border-sky-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Active Clients & Outlets
            </span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">{activeTenantsCount}</span>
            <span className="text-xs font-bold text-slate-400">
              clients · {locations.length} branches
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-semibold flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            <span>
              {deactivatedTenantsCount > 0
                ? `${deactivatedTenantsCount} suspended`
                : 'All clients operating normally'}
            </span>
          </div>
        </div>

        {/* Pending Branch Requests */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Branch Requests
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight">{pendingRequests.length}</div>
          <div className="mt-2 text-xs font-semibold">
            {pendingRequests.length > 0 ? (
              <button
                onClick={() => onNavigate('requests')}
                className="text-amber-400 hover:text-amber-300 flex items-center cursor-pointer"
              >
                Requires approval <ArrowUpRight className="w-3 h-3 ml-0.5" />
              </button>
            ) : (
              <span className="text-slate-500 flex items-center">
                <ShieldAlert className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Inbox up to date
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ORDER VOLUME BY CLIENT (TENANT) LANDING PANEL */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-black text-white tracking-tight">
                Order Volume by Client (Tenant)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                {scopeLabelMap[volumeScope]}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Click any client row to inspect order volume per branch.
              {lastSyncedAt && (
                <span className="text-slate-500 ml-2">
                  Updated {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Client */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Filter client..."
                className="bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44"
              />
            </div>

            {/* Sort Pills */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-[11px] font-bold">
              {(
                [
                  { id: 'ORDERS', label: 'Orders' },
                  { id: 'TODAY', label: 'Today' },
                  { id: 'REVENUE', label: 'Revenue' },
                  { id: 'NAME', label: 'Name' },
                ] as { id: SortBy; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    sortBy === opt.id
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Client Rows */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Loading client telemetry...</div>
        ) : clientVolumeRows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No clients match your filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70 mt-2">
            {clientVolumeRows.map((row, idx) => {
              const t = row.tenant;
              const isDeactivated = t.status === 'DEACTIVATED' || t.status === 'SUSPENDED';
              const sharePercent =
                platformTotals.totalOrders > 0
                  ? (row.orderCount / platformTotals.totalOrders) * 100
                  : 0;
              const barWidth = (row.orderCount / maxClientOrders) * 100;
              const isExpanded = !!expandedTenants[t.id];

              return (
                <div key={t.id} className="py-3.5">
                  <button
                    type="button"
                    onClick={() => toggleTenantExpand(t.id)}
                    className="w-full text-left flex flex-col md:flex-row md:items-center justify-between gap-3 p-2 rounded-2xl hover:bg-slate-800/30 transition cursor-pointer"
                  >
                    {/* Left: Rank + Client Name + Status */}
                    <div className="flex items-center space-x-3.5 min-w-[230px]">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-black text-slate-300 shrink-0">
                        #{idx + 1}
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-black text-indigo-300 text-sm shrink-0">
                        {(t.businessName || t.displayName || 'T')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm truncate">
                            {t.businessName || t.displayName || t.id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                              isDeactivated
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {isDeactivated ? 'SUSPENDED' : 'ACTIVE'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="capitalize">{String(t.businessType || 'RESTAURANT').toLowerCase()}</span>
                          <span>•</span>
                          <span>
                            {row.branchCount} {row.branchCount === 1 ? 'branch' : 'branches'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Order Share Visual Bar */}
                    <div className="flex-1 max-w-md">
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="text-slate-400 font-medium">Share of Platform Orders</span>
                        <span className="text-indigo-300 font-bold">{sharePercent.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(row.orderCount > 0 ? 4 : 0, barWidth)}%` }}
                        />
                      </div>
                    </div>

                    {/* Right: Metrics */}
                    <div className="flex items-center justify-between md:justify-end gap-6 shrink-0">
                      <div className="text-right">
                        <div className="text-base font-black text-white">
                          {row.orderCount.toLocaleString('en-IN')}
                          <span className="text-[11px] font-semibold text-slate-400 ml-1">orders</span>
                        </div>
                        <div className="text-[11px] text-emerald-400 font-semibold">
                          {row.todayOrderCount.toLocaleString('en-IN')} today
                        </div>
                      </div>

                      <div className="text-right min-w-[95px]">
                        <div className="text-sm font-bold text-slate-200">
                          ₹{row.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Avg ₹{row.orderCount > 0 ? (row.revenue / row.orderCount).toFixed(0) : '0'}
                        </div>
                      </div>

                      <div className="text-slate-400">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded Per-Branch Breakdown */}
                  {isExpanded && (
                    <div className="mt-2 ml-4 md:ml-12 bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                          Branch Breakdown ({row.branches.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigate('tenants')}
                          className="text-indigo-400 hover:text-indigo-300 normal-case font-semibold flex items-center cursor-pointer"
                        >
                          Manage Client <ArrowUpRight className="w-3 h-3 ml-0.5" />
                        </button>
                      </div>

                      {row.branches.length === 0 ? (
                        <div className="text-xs text-slate-500 py-2">No branches found for this client.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {row.branches.map((branch) => (
                            <div
                              key={branch.locationId}
                              className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                            >
                              <div className="min-w-0 mr-2">
                                <div className="text-xs font-bold text-white truncate">
                                  {branch.locationName}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {branch.status === 'DISABLED' ? 'Disabled' : 'Active'} • {branch.todayOrderCount} today
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-black text-indigo-300">
                                  {branch.orderCount.toLocaleString('en-IN')} orders
                                </div>
                                <div className="text-[10px] text-emerald-400 font-semibold">
                                  ₹{branch.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Pending Branch Requests */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Branch Expansion Queue
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Location requests pending platform licensing approval</p>
          </div>
          <button
            onClick={() => onNavigate('requests')}
            className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center cursor-pointer"
          >
            Review <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">No pending location requests.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingRequests.slice(0, 6).map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20"
              >
                <div>
                  <div className="font-bold text-white text-xs">{req.locationName}</div>
                  <div className="text-[10px] text-slate-400">
                    {req.address} • 📞 {req.phone}
                  </div>
                  <div className="text-[10px] text-indigo-400 font-mono mt-0.5">Tenant: {req.tenantId}</div>
                </div>

                <button
                  onClick={() => onNavigate('requests')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-xl shadow cursor-pointer"
                >
                  Action
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
