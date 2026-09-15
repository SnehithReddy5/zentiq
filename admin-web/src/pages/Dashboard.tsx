import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, collectionGroup, onSnapshot } from 'firebase/firestore';
import { Building2, MapPin, Smartphone, AlertCircle, ArrowUpRight, CheckCircle2, ShieldAlert, Sparkles, Activity } from 'lucide-react';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [locationRequests, setLocationRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Real-time Firestore subscriptions for zero static data
  useEffect(() => {
    const unsubTenants = onSnapshot(collection(db, 'tenants'), (snap) => {
      const list: any[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setTenants(list);
      setIsLoading(false);
    });

    const unsubLocations = onSnapshot(collectionGroup(db, 'locations'), (snap) => {
      const list: any[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setLocations(list);
    });

    const unsubRequests = onSnapshot(collectionGroup(db, 'locationRequests'), (snap) => {
      const list: any[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setLocationRequests(list);
    });

    return () => {
      unsubTenants();
      unsubLocations();
      unsubRequests();
    };
  }, []);

  const activeTenantsCount = tenants.filter(t => t.status === 'ACTIVE' || !t.status).length;
  const deactivatedTenantsCount = tenants.filter(t => t.status === 'DEACTIVATED' || t.status === 'SUSPENDED').length;
  const pendingRequests = locationRequests.filter(r => r.status === 'REQUESTED');

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900/60 p-6 rounded-3xl border border-indigo-500/20 backdrop-blur-xl">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Live Multi-Tenant Network</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Platform Command Center</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Real-time live telemetry connecting all licensed restaurant tenant instances, active branches, and hardware touch terminals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('tenants')}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> + Onboard Client
          </button>
        </div>
      </div>

      {/* Real-time KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Tenants */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-indigo-500/50 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Tenants</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight">{activeTenantsCount}</div>
          <div className="mt-2 text-xs text-emerald-400 font-semibold flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            <span>Operating normally</span>
          </div>
        </div>

        {/* Licensed Locations */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/50 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Billable Locations</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <MapPin className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight">{locations.length}</div>
          <div className="mt-2 text-xs text-slate-400 font-medium">
            <span>Per-branch licensed billing</span>
          </div>
        </div>

        {/* Pending Location Requests */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/50 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Branch Requests</span>
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
              <span className="text-slate-500">Inbox up to date</span>
            )}
          </div>
        </div>

        {/* Deactivated / Suspended Tenants */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden group hover:border-rose-500/50 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Suspended Tenants</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white tracking-tight">{deactivatedTenantsCount}</div>
          <div className="mt-2 text-xs text-slate-400 font-medium">
            <span>POS completely blocked</span>
          </div>
        </div>
      </div>

      {/* Live Recent Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Onboarded Tenants Feed */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Live Client Instances</h2>
              <p className="text-xs text-slate-400 mt-0.5">Real-time status of all onboarded restaurant businesses</p>
            </div>
            <button
              onClick={() => onNavigate('tenants')}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center"
            >
              View All <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          {tenants.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No restaurant tenants onboarded yet.</div>
          ) : (
            <div className="space-y-2.5">
              {tenants.slice(0, 5).map(t => {
                const isDeactivated = t.status === 'DEACTIVATED' || t.status === 'SUSPENDED';
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/40 border border-slate-800/80"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-300 text-sm">
                        {(t.businessName || t.displayName || 'T')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">{t.businessName || t.displayName}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{t.businessType || 'RESTAURANT'}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        isDeactivated
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {isDeactivated ? 'DEACTIVATED' : 'ACTIVE'}
                      </span>
                    </div>
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
              <h2 className="text-base font-bold text-white">Branch Expansion Queue</h2>
              <p className="text-xs text-slate-400 mt-0.5">Location requests pending platform licensing approval</p>
            </div>
            <button
              onClick={() => onNavigate('requests')}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center"
            >
              Review <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No pending location requests.</div>
          ) : (
            <div className="space-y-2.5">
              {pendingRequests.slice(0, 5).map(req => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20"
                >
                  <div>
                    <div className="font-bold text-white text-xs">{req.locationName}</div>
                    <div className="text-[10px] text-slate-400">{req.address} • 📞 {req.phone}</div>
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
    </div>
  );
};
