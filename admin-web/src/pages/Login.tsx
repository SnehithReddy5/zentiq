import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Sparkles, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export const AdminLogin: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Default Platform Master credentials
    if (
      (email.trim().toLowerCase() === 'admin@zentiq.io' || email.trim() === 'admin') &&
      (password === 'zentiq2026' || password === 'admin')
    ) {
      localStorage.setItem('zentiq_platform_auth', 'true');
      onLoginSuccess();
    } else {
      setError('Invalid platform credentials. Use admin@zentiq.io / zentiq2026');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 p-8 rounded-3xl shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-600/30">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">ZENTIQ PLATFORM</h1>
          <p className="text-xs text-indigo-400 font-bold uppercase tracking-widest mt-1">Super Admin Control Center</p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Company Admin Email</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@zentiq.io"
                className="w-full bg-slate-800/60 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Master Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-800/60 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/25 transition duration-200 flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <span>Authenticate Session</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
          <div className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span className="text-[11px] text-slate-400 font-mono">Demo: admin@zentiq.io / zentiq2026</span>
          </div>
          <p className="text-[10px] text-slate-600 mt-4">Authorized Personnel Only • Confidential System</p>
        </div>
      </div>
    </div>
  );
};
