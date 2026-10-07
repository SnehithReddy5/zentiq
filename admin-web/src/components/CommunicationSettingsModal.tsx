import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Mail, ShieldCheck, X, Check, Save, Sparkles, Key } from 'lucide-react';

interface CommunicationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (email: string) => void;
}

export const CommunicationSettingsModal: React.FC<CommunicationSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const [communicationEmail, setCommunicationEmail] = useState('');
  const [senderName, setSenderName] = useState('Zentiq POS Platform');
  const [sendMethod, setSendMethod] = useState<'GMAIL' | 'MAILTO' | 'RESEND'>('GMAIL');
  const [resendApiKey, setResendApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'system', 'settings'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.communicationEmail) setCommunicationEmail(data.communicationEmail);
          if (data.senderName) setSenderName(data.senderName);
          if (data.sendMethod) setSendMethod(data.sendMethod);
          if (data.resendApiKey) setResendApiKey(data.resendApiKey);
        } else {
          // Default fallback
          setCommunicationEmail('support@zentiq.com');
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      }
    };
    fetchSettings();
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!communicationEmail.trim()) {
      alert('Please enter a communication email address');
      return;
    }

    setIsSaving(true);
    try {
      const activeSendMethod = resendApiKey.trim() ? 'RESEND' : sendMethod;
      await setDoc(doc(db, 'system', 'settings'), {
        communicationEmail: communicationEmail.trim(),
        senderName: senderName.trim(),
        sendMethod: activeSendMethod,
        resendApiKey: resendApiKey.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setSaveSuccess(true);
      if (onSaved) onSaved(communicationEmail.trim());
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      alert('Failed to save communication settings: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Mail className="text-indigo-400" size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Super Admin Communication Email</h2>
              <p className="text-xs text-slate-400 mt-0.5">Primary sender address for all client credentials & updates</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="text-xs text-slate-300 font-semibold block mb-1">
              Communication Email Address *
            </label>
            <input
              type="email"
              required
              placeholder="e.g. support@zentiq.com or admin@yourbrand.com"
              value={communicationEmail}
              onChange={(e) => setCommunicationEmail(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              All client onboarding kits, passwords, and APK update notices will originate from this address.
            </p>
          </div>

          <div>
            <label className="text-xs text-slate-300 font-semibold block mb-1">
              Sender Display Name
            </label>
            <input
              type="text"
              placeholder="e.g. Zentiq POS Support Team"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Send Method Selector */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs text-slate-300 font-semibold block">
              Default Sending Channel
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSendMethod('GMAIL')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  sendMethod === 'GMAIL'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-semibold">Gmail Web Compose</div>
                <div className="text-[10px] opacity-75 font-normal">Opens via this communication email in Gmail</div>
              </button>

              <button
                type="button"
                onClick={() => setSendMethod('MAILTO')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  sendMethod === 'MAILTO'
                    ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-semibold">Default Mail App</div>
                <div className="text-[10px] opacity-75 font-normal">Opens in Outlook/Apple Mail</div>
              </button>
            </div>
          </div>

          {/* Optional Direct Background API Key */}
          <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Key size={12} className="text-amber-400" />
                Optional: Direct Background Sending (Resend API)
              </span>
              <button
                type="button"
                onClick={() => setSendMethod('RESEND')}
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
                  sendMethod === 'RESEND'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {sendMethod === 'RESEND' ? 'Active' : 'Enable'}
              </button>
            </div>
            <input
              type="password"
              placeholder="re_123456789... (optional)"
              value={resendApiKey}
              onChange={(e) => setResendApiKey(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-[11px] text-white p-2 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-[10px] text-slate-500">
              Leave blank to use 1-click Gmail Web. If provided, emails will dispatch 100% silently in background.
            </p>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saveSuccess ? (
                <>
                  <Check size={14} className="text-emerald-400" /> Saved!
                </>
              ) : isSaving ? (
                'Saving...'
              ) : (
                <>
                  <Save size={14} /> Save Communication Email
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
