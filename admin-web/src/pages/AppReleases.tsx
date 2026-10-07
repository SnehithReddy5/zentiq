import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { dispatchSystemEmail, SystemCommunicationSettings } from '../utils/emailDispatcher';
import {
  Smartphone,
  Download,
  Upload,
  Plus,
  Send,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  X,
  AlertCircle,
  Sparkles
} from 'lucide-react';

interface AppRelease {
  id: string;
  version: string;
  channel: string;
  apkUrl: string;
  size?: string;
  notes: string;
  isLatest?: boolean;
  createdAt?: any;
}

export const AppReleases: React.FC = () => {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [selectedReleaseForBroadcast, setSelectedReleaseForBroadcast] = useState<AppRelease | null>(null);

  // New Release Form State
  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState('Production');
  const [apkUrl, setApkUrl] = useState('');
  const [size, setSize] = useState('28.5 MB');
  const [notes, setNotes] = useState('');
  const [isLatest, setIsLatest] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Copy Feedback State
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);
  const [copiedBroadcastDraft, setCopiedBroadcastDraft] = useState(false);
  const [commSettings, setCommSettings] = useState<SystemCommunicationSettings>({
    communicationEmail: 'support@zentiq.com',
    senderName: 'Zentiq POS Platform',
    sendMethod: 'GMAIL',
    resendApiKey: '',
  });

  // Load Releases from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'app_releases'), (snap) => {
      const list: AppRelease[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as AppRelease);
      });
      // Sort latest first
      list.sort((a, b) => (b.version || '').localeCompare(a.version || ''));
      setReleases(list);
    });

    // Also load tenants for email broadcast
    const unsubTenants = onSnapshot(collection(db, 'tenants'), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setTenants(list);
    });

    // Listen to system settings for communication email
    const unsubSettings = onSnapshot(doc(db, 'system', 'settings'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCommSettings({
          communicationEmail: data.communicationEmail || 'support@zentiq.com',
          senderName: data.senderName || 'Zentiq POS Platform',
          sendMethod: data.sendMethod || 'GMAIL',
          resendApiKey: data.resendApiKey || '',
        });
      }
    });

    return () => {
      unsub();
      unsubTenants();
      unsubSettings();
    };
  }, []);

  // Handle Save Release
  const handleSaveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!version || !apkUrl) {
      alert('Version and APK Download URL are required');
      return;
    }

    setIsSaving(true);
    try {
      const releaseId = version.trim().replace(/[^a-zA-Z0-9.-]/g, '_');

      // Save release record
      await setDoc(doc(db, 'app_releases', releaseId), {
        id: releaseId,
        version: version.trim(),
        channel,
        apkUrl: apkUrl.trim(),
        size: size.trim() || '28.5 MB',
        notes: notes.trim() || 'New POS features and performance stability updates',
        isLatest,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      // Update global latest pointer if checked
      if (isLatest) {
        await setDoc(doc(db, 'system', 'app_version'), {
          latestVersion: version.trim(),
          latestApkUrl: apkUrl.trim(),
          releaseNotes: notes.trim(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      setIsAddModalOpen(false);
      setVersion('');
      setApkUrl('');
      setNotes('');
      alert(`Release ${version} registered successfully!`);
    } catch (err: any) {
      console.error(err);
      alert('Failed to save release: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete Release
  const handleDeleteRelease = async (releaseId: string) => {
    if (!window.confirm(`Delete release ${releaseId}?`)) return;
    try {
      await deleteDoc(doc(db, 'app_releases', releaseId));
    } catch (err: any) {
      alert('Error deleting: ' + err.message);
    }
  };

  // Copy helper
  const handleCopyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrlId(id);
    setTimeout(() => setCopiedUrlId(null), 2500);
  };

  // Compose Email for Tenant Updates
  const tenantsWithEmail = tenants.filter(t => t.adminEmail || (t.adminUsername && t.adminUsername.includes('@')));
  const targetRelease = selectedReleaseForBroadcast || releases[0];

  const getBroadcastSubject = () => {
    return `Zentiq POS App Update: ${targetRelease?.version || 'New Version'} is Live`;
  };

  const getBroadcastBody = () => {
    if (!targetRelease) return '';
    return `Dear Restaurant Partner,

A new version of the Zentiq POS Android Application (${targetRelease.version}) is now ready for your restaurant terminals.

📱 DOWNLOAD & INSTALL UPDATE:
${targetRelease.apkUrl}

📝 WHAT'S NEW IN THIS VERSION:
${targetRelease.notes || 'Performance enhancements, printer stability, and billing improvements.'}

🚀 HOW TO UPDATE:
1. Open the download link above on your Android POS tablet or handheld terminal.
2. Download and install the new APK.
3. Your restaurant menu, tables, and settings will remain completely intact.

Need assistance? Reply directly to this email or contact the Zentiq Support team.

Best regards,
Zentiq Platform Team`;
  };

  const handleOpenEmailClient = () => {
    const emails = tenantsWithEmail.map(t => t.adminEmail || t.adminUsername).filter(Boolean);
    const subject = encodeURIComponent(getBroadcastSubject());
    const body = encodeURIComponent(getBroadcastBody());
    
    // Use BCC so client emails remain private from each other
    const mailtoUrl = `mailto:?bcc=${emails.join(',')}&subject=${subject}&body=${body}`;
    window.open(mailtoUrl, '_blank');
  };

  const handleCopyBroadcastDraft = () => {
    const text = `SUBJECT: ${getBroadcastSubject()}\n\n${getBroadcastBody()}`;
    navigator.clipboard.writeText(text);
    setCopiedBroadcastDraft(true);
    setTimeout(() => setCopiedBroadcastDraft(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-5 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <Smartphone className="text-indigo-400" size={28} />
            Android Application Releases
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage production APK download URLs and easily dispatch app updates to client restaurant emails.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              if (releases.length === 0) {
                alert('Please register an APK release first.');
                return;
              }
              setSelectedReleaseForBroadcast(releases[0]);
              setIsBroadcastModalOpen(true);
            }}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Send className="w-4 h-4" /> Send App Update to Tenants
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" /> Register New APK URL
          </button>
        </div>
      </div>

      {/* Active Release Highlight Card */}
      {releases.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900/80 border border-indigo-500/30 rounded-3xl p-5 shadow-2xl backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                <Sparkles size={11} /> Current Production Release
              </span>
              <span className="text-xs font-mono text-indigo-400 font-bold">{releases[0].version}</span>
            </div>
            <h2 className="text-lg font-bold text-white">Latest POS Client Application</h2>
            <p className="text-xs text-slate-300 max-w-2xl">{releases[0].notes}</p>
            <div className="text-[11px] text-slate-400 font-mono pt-1 truncate max-w-xl">
              URL: <span className="text-indigo-300">{releases[0].apkUrl}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-stretch md:self-auto">
            <button
              onClick={() => handleCopyUrl('top', releases[0].apkUrl)}
              className="flex-1 md:flex-none px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              {copiedUrlId === 'top' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copiedUrlId === 'top' ? 'Copied Link' : 'Copy APK URL'}
            </button>
            <a
              href={releases[0].apkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 md:flex-none px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30"
            >
              <Download size={14} /> Download APK
            </a>
          </div>
        </div>
      )}

      {/* Releases Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Registered Application Versions</h2>
          <span className="text-xs text-slate-400">{releases.length} build(s) recorded</span>
        </div>

        {releases.length === 0 ? (
          <div className="p-12 text-center">
            <Smartphone size={36} className="mx-auto text-slate-600 mb-2" />
            <p className="text-xs text-slate-400 font-medium">No APK releases registered yet.</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Click "Register New APK URL" to store your EAS build or hosted APK download link.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800 uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Version</th>
                  <th className="py-3.5 px-4">Channel</th>
                  <th className="py-3.5 px-4">APK Download Link</th>
                  <th className="py-3.5 px-4">Size</th>
                  <th className="py-3.5 px-4">Changelog</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {releases.map((rel) => (
                  <tr key={rel.id} className="hover:bg-slate-850/50">
                    <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                      {rel.version}
                      {rel.isLatest && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-bold">
                          LATEST
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                        {rel.channel || 'Production'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-400 truncate max-w-[200px]" title={rel.apkUrl}>
                          {rel.apkUrl}
                        </span>
                        <button
                          onClick={() => handleCopyUrl(rel.id, rel.apkUrl)}
                          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
                          title="Copy Link"
                        >
                          {copiedUrlId === rel.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">{rel.size || 'N/A'}</td>
                    <td className="py-3.5 px-4 text-slate-300 max-w-[240px] truncate" title={rel.notes}>
                      {rel.notes}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedReleaseForBroadcast(rel);
                            setIsBroadcastModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1"
                        >
                          <Send size={11} /> Email Tenants
                        </button>
                        <a
                          href={rel.apkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-indigo-400 hover:text-indigo-300 rounded hover:bg-slate-800"
                          title="Download / Visit URL"
                        >
                          <ExternalLink size={13} />
                        </a>
                        <button
                          onClick={() => handleDeleteRelease(rel.id)}
                          className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-500/10 cursor-pointer"
                          title="Delete Release Record"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Register New APK Release */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">Register Android APK Release</h2>
                <p className="text-xs text-slate-400 mt-0.5">Add new version download URL for clients</p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRelease} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Version Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. v1.0.1"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Channel</label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Production">Production</option>
                    <option value="Beta">Beta</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">APK Direct Download URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://expo.dev/artifacts/eas/... or hosted .apk URL"
                  value={apkUrl}
                  onChange={(e) => setApkUrl(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Generated by EAS Build (<code className="text-indigo-400">npm run build:apk</code>) or hosted on Firebase Storage / S3 / Google Drive.
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Estimated Size</label>
                <input
                  type="text"
                  placeholder="e.g. 28.5 MB"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Changelog / Release Notes</label>
                <textarea
                  rows={3}
                  placeholder="What is new or improved in this build?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isLatest}
                  onChange={(e) => setIsLatest(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
                <span>Set as Current Active Release for New Onboarding</span>
              </label>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Registering...' : 'Save & Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Broadcast APK Update Email to Tenants */}
      {isBroadcastModalOpen && targetRelease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-purple-500/40 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <Mail className="text-purple-400" size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Send App Update to Tenants</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Notify clients with the latest APK URL ({targetRelease.version})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBroadcastModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Recipient Tenants Count */}
            <div className="bg-slate-800/50 border border-slate-800 p-3 rounded-2xl flex items-center justify-between text-xs">
              <span className="text-slate-300">
                Client Emails to Notify: <strong className="text-purple-300">{tenantsWithEmail.length}</strong> of {tenants.length} tenants
              </span>
              <span className="text-[10px] text-slate-500">Sent via BCC (Emails stay private)</span>
            </div>

            {/* Email Draft Preview */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Email Message Preview
              </span>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs font-mono space-y-2 select-text">
                <div className="text-slate-400 pb-1 border-b border-slate-800">
                  <strong className="text-slate-300">Subject:</strong> {getBroadcastSubject()}
                </div>
                <pre className="text-slate-300 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                  {getBroadcastBody()}
                </pre>
              </div>
            </div>

            {/* Sender Communication Email Banner */}
            <div className="bg-purple-950/40 border border-purple-500/30 p-2.5 rounded-xl flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Mail size={13} className="text-purple-400" />
                <span>Sending from: <strong className="text-purple-300 font-mono">{commSettings.communicationEmail}</strong></span>
              </div>
              <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded font-bold">
                {commSettings.sendMethod === 'RESEND' ? 'Direct Silent' : commSettings.sendMethod === 'GMAIL' ? 'Gmail' : 'Mail App'}
              </span>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  const emails = tenantsWithEmail.map(t => t.adminEmail || t.adminUsername).filter(Boolean);
                  try {
                    await dispatchSystemEmail({
                      to: emails,
                      subject: getBroadcastSubject(),
                      body: getBroadcastBody(),
                      isBcc: true,
                    }, commSettings);
                  } catch (err: any) {
                    alert('Error: ' + err.message);
                  }
                }}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold py-3 rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Mail size={16} /> Broadcast Update to {tenantsWithEmail.length} Tenants via {commSettings.communicationEmail}
              </button>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyBroadcastDraft}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  {copiedBroadcastDraft ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copiedBroadcastDraft ? 'Copied Message' : 'Copy Message for WhatsApp/SMS'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsBroadcastModalOpen(false)}
                  className="px-5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
