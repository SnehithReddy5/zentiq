import React, { useState, useEffect } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Tenants } from './pages/Tenants';
import { LocationRequests } from './pages/LocationRequests';
import { AppReleases } from './pages/AppReleases';
import { AdminLogin } from './pages/Login';
import { CommunicationSettingsModal } from './components/CommunicationSettingsModal';
import { db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { LayoutDashboard, Building2, MapPin, Smartphone, ShieldCheck, LogOut, ChevronRight, Mail } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isCommSettingsOpen, setIsCommSettingsOpen] = useState(false);
  const [commEmail, setCommEmail] = useState('support@zentiq.com');

  useEffect(() => {
    const isAuth = localStorage.getItem('zentiq_platform_auth');
    if (isAuth === 'true') {
      setIsAuthenticated(true);
    }

    const unsub = onSnapshot(doc(db, 'system', 'settings'), (snap) => {
      if (snap.exists() && snap.data()?.communicationEmail) {
        setCommEmail(snap.data().communicationEmail);
      }
    });
    return () => unsub();
  }, []);

  const handleLogout = () => {
    if (window.confirm('Log out of Platform Admin portal?')) {
      localStorage.removeItem('zentiq_platform_auth');
      setIsAuthenticated(false);
    }
  };

  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen bg-[#030712] text-slate-100 selection:bg-indigo-500 selection:text-white antialiased">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900/60 backdrop-blur-2xl border-r border-slate-800/80 flex flex-col justify-between p-4 z-20">
        <div>
          {/* Logo Brand Header */}
          <div className="flex items-center space-x-3 px-3 py-4 mb-6 bg-slate-800/30 rounded-2xl border border-slate-800/50">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-600/30">
              Z
            </div>
            <div>
              <div className="font-black text-white text-base tracking-tight">ZENTIQ</div>
              <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Platform Super Admin</div>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition cursor-pointer ${
                currentPage === 'dashboard'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </div>
              {currentPage === 'dashboard' && <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setCurrentPage('tenants')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition cursor-pointer ${
                currentPage === 'tenants'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Building2 className="w-4 h-4" />
                <span>Clients & Tenants</span>
              </div>
              {currentPage === 'tenants' && <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setCurrentPage('requests')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition cursor-pointer ${
                currentPage === 'requests'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <MapPin className="w-4 h-4" />
                <span>Branch Requests</span>
              </div>
              {currentPage === 'requests' && <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setCurrentPage('releases')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition cursor-pointer ${
                currentPage === 'releases'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Smartphone className="w-4 h-4" />
                <span>APK Releases</span>
              </div>
              {currentPage === 'releases' && <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setIsCommSettingsOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <Mail className="w-4 h-4 text-indigo-400" />
                <span>Communication Email</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Footer with Operator Info & Logout */}
        <div className="space-y-3">
          <div
            onClick={() => setIsCommSettingsOpen(true)}
            className="p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-2xl border border-slate-800/60 cursor-pointer transition-all"
            title="Click to configure sender communication email"
          >
            <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold">
              <Mail className="w-3.5 h-3.5" />
              <span>Sender Email</span>
            </div>
            <div className="text-[11px] text-slate-200 font-mono mt-0.5 truncate">{commEmail}</div>
            <div className="text-[9px] text-slate-500 mt-0.5">Click to configure</div>
          </div>

          <div className="p-3 bg-slate-800/30 rounded-2xl border border-slate-800/60">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Company Master Session</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Connected to zentiq-b5d40</div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center space-x-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 overflow-auto p-8 relative">
        <div className="max-w-7xl mx-auto">
          {currentPage === 'dashboard' && <Dashboard onNavigate={setCurrentPage} />}
          {currentPage === 'tenants' && <Tenants />}
          {currentPage === 'requests' && <LocationRequests />}
          {currentPage === 'releases' && <AppReleases />}
        </div>
      </main>

      {/* Super Admin Communication Email Settings Modal */}
      <CommunicationSettingsModal
        isOpen={isCommSettingsOpen}
        onClose={() => setIsCommSettingsOpen(false)}
        onSaved={(email) => setCommEmail(email)}
      />
    </div>
  );
}
