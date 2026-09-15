import React, { useState } from 'react';
import { Smartphone, Download, Upload, Plus } from 'lucide-react';

export const AppReleases: React.FC = () => {
  const releases = [
    { version: 'v1.0.0', channel: 'Production', date: '2026-09-10', notes: 'Initial Multi-Tenant Zentiq POS Release', size: '28.4 MB' },
    { version: 'v0.9.8', channel: 'Beta', date: '2026-09-01', notes: 'Testing differential KOT and ESC/POS socket buffer', size: '27.9 MB' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Android Application Releases</h1>
          <p className="text-sm text-slate-400 mt-1">Manage production APK builds distributed to client touch terminals.</p>
        </div>
        <button
          onClick={() => alert('Connect EAS Build pipeline or upload production APK.')}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center"
        >
          <Upload className="w-4 h-4 mr-1.5" /> Register APK Release
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800 uppercase font-semibold">
            <tr>
              <th className="py-3 px-4">Version</th>
              <th className="py-3 px-4">Channel</th>
              <th className="py-3 px-4">Release Date</th>
              <th className="py-3 px-4">Changelog</th>
              <th className="py-3 px-4">Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {releases.map((rel, i) => (
              <tr key={i} className="hover:bg-slate-850/50">
                <td className="py-3 px-4 font-bold text-white">{rel.version}</td>
                <td className="py-3 px-4">
                  <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                    {rel.channel}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-400">{rel.date}</td>
                <td className="py-3 px-4 text-slate-300">{rel.notes}</td>
                <td className="py-3 px-4 font-mono text-slate-500">{rel.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
