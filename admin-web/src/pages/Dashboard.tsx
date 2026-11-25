import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection,
  collectionGroup,
  onSnapshot,
  getDocs,
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

interface RawOrderRecord {
  createdAtMs: number;
  totalAmount: number;
}

interface RawBranchData {
  locationId: string;
  locationName: string;
  status: string;
  orders: RawOrderRecord[];
}

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

function parseTimestampMs(raw: any, fallback?: any): number {
  const val = raw ?? fallback;
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (val?.seconds !== undefined) return val.seconds * 1000;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
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
  const [rawOrdersByTenant, setRawOrdersByTenant] = useState<Record<string, RawBranchData[]>>({});
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

  // Fetch all order timestamps & amounts across every tenant's branches once (plus manual refresh)
  // so switching Today / Last 7 Days / Last 30 Days / All Time is instant and 100% consistent
  const fetchAllOrderTelemetry = useCallback(async (tenantList: any[], knownLocations: any[]) => {
    if (tenantList.length === 0) {
      setRawOrdersByTenant({});
      return;
    }

    setIsRefreshingVolume(true);
    try {
      const mapOrderDocs = (docs: any[]): RawOrderRecord[] => {
        const out: RawOrderRecord[] = [];
        docs.forEach((d) => {
          const data = d.data();
          const status = String(data?.status || '').toUpperCase();
          if (status === 'CANCELLED') return;
          out.push({
            createdAtMs: parseTimestampMs(data?.createdAt, data?.updatedAt),
            totalAmount: Number(data?.totalAmount) || 0,
          });
        });
        return out;
      };

      const tenantResults = await Promise.all(
        tenantList.map(async (tenant) => {
          // Query tenant locations directly so we never miss branches even if collectionGroup lags
          const knownLocs = knownLocations.filter((l) => l.tenantId === tenant.id);
          let branchDocs = knownLocs;
          try {
            const locSnap = await getDocs(collection(db, 'tenants', tenant.id, 'locations'));
            if (!locSnap.empty) {
              const directList: any[] = [];
              locSnap.forEach((d) => directList.push({ id: d.id, ...d.data(), tenantId: tenant.id }));
              branchDocs = directList;
            }
          } catch (_) {}

          const branchesData: RawBranchData[] = await Promise.all(
            branchDocs.map(async (loc) => {
              try {
                const ordersSnap = await getDocs(
                  collection(db, 'tenants', tenant.id, 'locations', loc.id, 'orders')
                );
                return {
                  locationId: loc.id,
                  locationName: loc.name || 'Main Branch',
                  status: loc.status || 'ACTIVE',
                  orders: mapOrderDocs(ordersSnap.docs),
                };
              } catch (_) {
                return {
                  locationId: loc.id,
                  locationName: loc.name || 'Main Branch',
                  status: loc.status || 'ACTIVE',
                  orders: [],
                };
              }
            })
          );

          // Also check legacy root-level tenant orders
          try {
            const legacySnap = await getDocs(collection(db, 'tenants', tenant.id, 'orders'));
            if (!legacySnap.empty) {
              const legacyOrders = mapOrderDocs(legacySnap.docs);
              if (legacyOrders.length > 0) {
                branchesData.push({
                  locationId: 'root-legacy',
                  locationName: 'Primary / Unscoped',
                  status: 'ACTIVE',
                  orders: legacyOrders,
                });
              }
            }
          } catch (_) {}

          return { tenantId: tenant.id, branches: branchesData };
        })
      );

      const nextMap: Record<string, RawBranchData[]> = {};
      tenantResults.forEach((entry) => {
        nextMap[entry.tenantId] = entry.branches;
      });
      setRawOrdersByTenant(nextMap);
      setLastSyncedAt(new Date());
    } finally {
      setIsRefreshingVolume(false);
    }
  }, []);

  useEffect(() => {
    if (tenants.length > 0) {
      fetchAllOrderTelemetry(tenants, locations);
    }
  }, [tenants, locations, fetchAllOrderTelemetry]);

  // Compute date boundaries accurately in local time
  const { startOfTodayMs, scopeCutoffMs } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    let cutoff = 0;
    if (volumeScope === 'TODAY') {
      cutoff = todayStart;
    } else if (volumeScope === '7D') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0).getTime();
    } else if (volumeScope === '30D') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0).getTime();
    }
    return { startOfTodayMs: todayStart, scopeCutoffMs: cutoff };
  }, [volumeScope]);

  // Aggregate per-tenant and per-branch volumes instantaneously for the selected scope
  const volumeByTenant = useMemo(() => {
    const result: Record<string, TenantVolume> = {};

    Object.entries(rawOrdersByTenant).forEach(([tenantId, rawBranches]) => {
      const branches: BranchVolume[] = rawBranches.map((b) => {
        let orderCount = 0;
        let revenue = 0;
        let todayOrderCount = 0;
        let todayRevenue = 0;

        b.orders.forEach((o) => {
          const isToday = o.createdAtMs >= startOfTodayMs;
          const inScope = volumeScope === 'ALL' ? true : o.createdAtMs >= scopeCutoffMs;

          if (isToday) {
            todayOrderCount++;
            todayRevenue += o.totalAmount;
          }
          if (inScope) {
            orderCount++;
            revenue += o.totalAmount;
          }
        });

        return {
          locationId: b.locationId,
          locationName: b.locationName,
          status: b.status,
          orderCount,
          todayOrderCount,
          revenue,
          todayRevenue,
        };
      });

      branches.sort((a, b) => b.orderCount - a.orderCount || b.revenue - a.revenue);

      result[tenantId] = {
        tenantId,
        orderCount: branches.reduce((s, b) => s + b.orderCount, 0),
        todayOrderCount: branches.reduce((s, b) => s + b.todayOrderCount, 0),
        revenue: branches.reduce((s, b) => s + b.revenue, 0),
        todayRevenue: branches.reduce((s, b) => s + b.todayRevenue, 0),
        branches,
      };
    });

    return result;
  }, [rawOrdersByTenant, volumeScope, startOfTodayMs, scopeCutoffMs]);

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
        const branchCount = Math.max(
          locations.filter((l) => l.tenantId === t.id).length,
          vol.branches.filter((b) => b.locationId !== 'root-legacy').length
        );
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
    <div className="space-y-6 animate-fadeIn">
      {/* Top Command Banner */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 bg-gradient-to-r from-indigo-950/50 via-purple-950/30 to-slate-900/70 p-5 sm:p-6 rounded-3xl border border-indigo-500/20 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
              Live Multi-Tenant Network
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Platform Command Center
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Monitor total platform order volume, per-client order throughput, branch requests, and tenant health.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Timeframe Selector */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-2xl p-1">
            {(['TODAY', '7D', '30D', 'ALL'] as VolumeScope[]).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setVolumeScope(scope)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
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
            type="button"
            onClick={() => fetchAllOrderTelemetry(tenants, locations)}
            disabled={isRefreshingVolume}
            className="px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer flex items-center whitespace-nowrap"
            title="Refresh live order counts"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshingVolume ? 'animate-spin text-indigo-400' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => onNavigate('tenants')}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> + Onboard Client
          </button>
        </div>
      </div>

      {/* Primary Order Volume & Network KPIs (Uniform aligned heights) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Total Order Volume */}
        <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900/80 border border-indigo-500/30 p-5 rounded-2xl backdrop-blur-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 min-h-[34px]">
            <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider truncate">
              Order Volume • {scopeLabelMap[volumeScope]}
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight tabular-nums">
            {isRefreshingVolume && Object.keys(rawOrdersByTenant).length === 0
              ? '...'
              : platformTotals.totalOrders.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-semibold flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <span className="tabular-nums">{platformTotals.todayOrders.toLocaleString('en-IN')} orders today</span>
          </div>
        </div>

        {/* KPI 2: Platform Order Value */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm hover:border-emerald-500/40 transition flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 min-h-[34px]">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
              Order Value • {scopeLabelMap[volumeScope]}
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight tabular-nums">
            ₹{platformTotals.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-medium flex items-center justify-between gap-2 tabular-nums">
            <span>Avg ₹{platformTotals.avgOrderValue.toFixed(0)} / order</span>
            <span className="text-emerald-400 font-semibold">
              ₹{platformTotals.todayRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} today
            </span>
          </div>
        </div>

        {/* KPI 3: Active Clients & Branches */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm hover:border-sky-500/40 transition flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 min-h-[34px]">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
              Active Clients & Outlets
            </span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight tabular-nums">{activeTenantsCount}</span>
            <span className="text-xs font-bold text-slate-400 tabular-nums">
              clients · {locations.length} branches
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-semibold flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <span>
              {deactivatedTenantsCount > 0
                ? `${deactivatedTenantsCount} suspended`
                : 'All clients operating normally'}
            </span>
          </div>
        </div>

        {/* KPI 4: Pending Branch Requests */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm hover:border-amber-500/40 transition flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 min-h-[34px]">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
              Branch Requests
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight tabular-nums">{pendingRequests.length}</div>
          <div className="mt-2 text-xs font-semibold">
            {pendingRequests.length > 0 ? (
              <button
                type="button"
                onClick={() => onNavigate('requests')}
                className="text-amber-400 hover:text-amber-300 flex items-center cursor-pointer"
              >
                Requires approval <ArrowUpRight className="w-3 h-3 ml-0.5" />
              </button>
            ) : (
              <span className="text-slate-500 flex items-center">
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-slate-500 shrink-0" />
                Inbox up to date
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ORDER VOLUME BY CLIENT (TENANT) — STRICTLY ALIGNED TABLE */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 sm:p-6 backdrop-blur-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-400 shrink-0" />
              <h2 className="text-lg font-black text-white tracking-tight">
                Order Volume by Client (Tenant)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                {scopeLabelMap[volumeScope]}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Click any client row to expand per-branch order breakdown.
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
                  type="button"
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

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Loading client telemetry...</div>
        ) : clientVolumeRows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No clients match your filter.
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Aligned Table */}
            <div className="hidden md:block overflow-x-auto mt-3">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3 pl-3 pr-2 w-12">#</th>
                    <th className="py-3 px-2 min-w-[210px]">Client / Tenant</th>
                    <th className="py-3 px-2 w-28">Status</th>
                    <th className="py-3 px-2 w-24 text-center">Outlets</th>
                    <th className="py-3 px-3 min-w-[180px]">Order Share</th>
                    <th className="py-3 px-3 w-28 text-right">{scopeLabelMap[volumeScope]}</th>
                    <th className="py-3 px-3 w-24 text-right">Today</th>
                    <th className="py-3 px-3 w-32 text-right">Revenue</th>
                    <th className="py-3 pl-2 pr-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
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
                      <React.Fragment key={t.id}>
                        <tr
                          onClick={() => toggleTenantExpand(t.id)}
                          className="hover:bg-slate-800/35 transition cursor-pointer group"
                        >
                          <td className="py-3.5 pl-3 pr-2 align-middle">
                            <span className="inline-flex w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 items-center justify-center text-[11px] font-black text-slate-300">
                              #{idx + 1}
                            </span>
                          </td>

                          <td className="py-3.5 px-2 align-middle">
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-black text-indigo-300 text-xs shrink-0">
                                {(t.businessName || t.displayName || 'T')[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-white text-sm truncate max-w-[220px]">
                                  {t.businessName || t.displayName || t.id}
                                </div>
                                <div className="text-[11px] text-slate-400 capitalize truncate">
                                  {String(t.businessType || 'RESTAURANT').toLowerCase()}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-2 align-middle">
                            <span
                              className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                isDeactivated
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              }`}
                            >
                              {isDeactivated ? 'SUSPENDED' : 'ACTIVE'}
                            </span>
                          </td>

                          <td className="py-3.5 px-2 align-middle text-center">
                            <span className="text-xs font-bold text-slate-300 tabular-nums">
                              {row.branchCount}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 align-middle">
                            <div className="flex items-center gap-2.5">
                              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden min-w-[90px]">
                                <div
                                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.max(row.orderCount > 0 ? 4 : 0, barWidth)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-bold text-indigo-300 w-11 text-right tabular-nums">
                                {sharePercent.toFixed(1)}%
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 align-middle text-right">
                            <span className="text-sm font-black text-white tabular-nums">
                              {row.orderCount.toLocaleString('en-IN')}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 align-middle text-right">
                            <span className="text-xs font-bold text-emerald-400 tabular-nums">
                              {row.todayOrderCount.toLocaleString('en-IN')}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 align-middle text-right">
                            <div className="text-sm font-bold text-slate-200 tabular-nums">
                              ₹{row.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              Avg ₹{row.orderCount > 0 ? (row.revenue / row.orderCount).toFixed(0) : '0'}
                            </div>
                          </td>

                          <td className="py-3.5 pl-2 pr-3 align-middle text-right text-slate-400">
                            {isExpanded ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="pb-4 pt-1 px-3 bg-slate-950/40">
                              <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                                    Branch Breakdown ({row.branches.length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNavigate('tenants');
                                    }}
                                    className="text-indigo-400 hover:text-indigo-300 normal-case font-semibold flex items-center cursor-pointer"
                                  >
                                    Manage Client <ArrowUpRight className="w-3 h-3 ml-0.5" />
                                  </button>
                                </div>

                                {row.branches.length === 0 ? (
                                  <div className="text-xs text-slate-500 py-1">No branches found for this client.</div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {row.branches.map((branch) => (
                                      <div
                                        key={branch.locationId}
                                        className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                                      >
                                        <div className="min-w-0">
                                          <div className="text-xs font-bold text-white truncate">
                                            {branch.locationName}
                                          </div>
                                          <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                                            {branch.status === 'DISABLED' ? 'Disabled' : 'Active'} • {branch.todayOrderCount} today
                                          </div>
                                        </div>
                                        <div className="text-right shrink-0 tabular-nums">
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
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List (< md) */}
            <div className="md:hidden divide-y divide-slate-800/70 mt-2">
              {clientVolumeRows.map((row, idx) => {
                const t = row.tenant;
                const isDeactivated = t.status === 'DEACTIVATED' || t.status === 'SUSPENDED';
                const sharePercent =
                  platformTotals.totalOrders > 0
                    ? (row.orderCount / platformTotals.totalOrders) * 100
                    : 0;
                const isExpanded = !!expandedTenants[t.id];

                return (
                  <div key={t.id} className="py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleTenantExpand(t.id)}
                      className="w-full text-left space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="text-[11px] font-black text-slate-400">#{idx + 1}</span>
                          <span className="font-bold text-white text-sm truncate">
                            {t.businessName || t.displayName || t.id}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold border shrink-0 ${
                            isDeactivated
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {isDeactivated ? 'SUSPENDED' : 'ACTIVE'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span className="font-black text-white">
                          {row.orderCount.toLocaleString('en-IN')} orders
                          <span className="text-emerald-400 font-semibold ml-2">({row.todayOrderCount} today)</span>
                        </span>
                        <span className="font-bold text-slate-200">
                          ₹{row.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                            style={{ width: `${Math.max(row.orderCount > 0 ? 4 : 0, sharePercent)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-indigo-300 font-bold tabular-nums">
                          {sharePercent.toFixed(1)}%
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-2.5 bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
                        {row.branches.map((branch) => (
                          <div key={branch.locationId} className="flex items-center justify-between text-xs">
                            <span className="text-slate-300 truncate mr-2">{branch.locationName}</span>
                            <span className="text-indigo-300 font-bold tabular-nums shrink-0">
                              {branch.orderCount} • ₹{branch.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Live Pending Branch Requests */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 sm:p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Branch Expansion Queue
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Location requests pending platform licensing approval</p>
          </div>
          <button
            type="button"
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
                <div className="min-w-0 mr-3">
                  <div className="font-bold text-white text-xs truncate">{req.locationName}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {req.address} • 📞 {req.phone}
                  </div>
                  <div className="text-[10px] text-indigo-400 font-mono mt-0.5 truncate">Tenant: {req.tenantId}</div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('requests')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-xl shadow cursor-pointer shrink-0"
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
