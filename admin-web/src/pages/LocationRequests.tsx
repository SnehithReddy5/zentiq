import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collectionGroup, onSnapshot, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, XCircle, MapPin, Building, Clock, Check, X } from 'lucide-react';

export const LocationRequests: React.FC = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Real-time snapshot listener on locationRequests
  useEffect(() => {
    const unsub = onSnapshot(collectionGroup(db, 'locationRequests'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setRequests(list);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const handleApprove = async (req: any) => {
    try {
      const newLocId = `loc-${Date.now()}`;

      // 1. Provision Active Location in Tenant
      await setDoc(doc(db, 'tenants', req.tenantId, 'locations', newLocId), {
        id: newLocId,
        tenantId: req.tenantId,
        name: req.locationName,
        address: req.address,
        phone: req.phone,
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
      });

      // 2. Mark Request as APPROVED
      await updateDoc(doc(db, 'tenants', req.tenantId, 'locationRequests', req.id), {
        status: 'APPROVED',
        provisionedLocationId: newLocId,
        approvedAt: serverTimestamp(),
      });

      alert(`Location "${req.locationName}" approved and provisioned as ACTIVE!`);
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    }
  };

  const handleReject = async (req: any) => {
    try {
      await updateDoc(doc(db, 'tenants', req.tenantId, 'locationRequests', req.id), {
        status: 'REJECTED',
        updatedAt: serverTimestamp(),
      });
      alert('Location request rejected.');
    } catch (err: any) {
      alert(`Rejection failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Branch Location Licensing Requests</h1>
        <p className="text-xs text-slate-400 mt-1">
          Review branch expansion requests from client Super Admins. Approving provisions a billable ACTIVE location.
        </p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[11px] tracking-wider">
              <tr>
                <th className="py-4 px-5">Requested Branch Name</th>
                <th className="py-4 px-5">Branch Address & Phone</th>
                <th className="py-4 px-5">Tenant ID</th>
                <th className="py-4 px-5">Status</th>
                <th className="py-4 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                    No branch licensing requests found.
                  </td>
                </tr>
              ) : (
                requests.map(r => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-4 px-5 font-bold text-white text-sm">{r.locationName}</td>
                    <td className="py-4 px-5">
                      <div>{r.address}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">📞 {r.phone}</div>
                    </td>
                    <td className="py-4 px-5 font-mono text-slate-400">{r.tenantId}</td>
                    <td className="py-4 px-5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        r.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        r.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {r.status || 'REQUESTED'}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right space-x-2">
                      {r.status === 'REQUESTED' ? (
                        <>
                          <button
                            onClick={() => handleApprove(r)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-lg shadow-emerald-600/20"
                          >
                            Approve & Provision
                          </button>
                          <button
                            onClick={() => handleReject(r)}
                            className="px-3.5 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/30 text-rose-400 font-semibold rounded-xl text-xs transition cursor-pointer"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-500 text-xs font-mono">Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
