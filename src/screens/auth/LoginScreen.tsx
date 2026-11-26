import { toast } from '../../utils/toast';
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/auth.store';
import { useTenantStore } from '../../store/tenant.store';
import { useThemeStore } from '../../store/theme.store';
import { Input } from '../../components/common/Input';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Zap,
  ShieldCheck,
  Printer,
  ArrowRight,
  Sun,
  Moon,
  AlertCircle,
  Building2,
} from 'lucide-react-native';
import { db } from '../../services/firebase/config';
import { doc, getDoc, setDoc, collection, collectionGroup, query, where, getDocs, limit } from 'firebase/firestore';
import { DBServices } from '../../services/firebase/db';
import packageJson from '../../../package.json';

export const LoginScreen = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState('Signing in...');

  const { setUser, setLoading, isLoading } = useAuthStore();
  const { setTenant, setBranding, setFeatures, setLocations, setActiveLocationId, subscribeToActiveTenant } = useTenantStore();
  const { themeMode, toggleTheme } = useThemeStore();
  const isDark = themeMode === 'dark';

  const handleLogin = async () => {
    const cleanId = userId.trim();
    const lowerId = cleanId.toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanId || !cleanPassword) {
      const msg = 'Please enter your User ID / Mobile / Email and Password.';
      setInlineError(msg);
      toast.warning(msg, 'Required');
      return;
    }

    setInlineError(null);
    setStatusLabel('Authenticating...');
    setLoading(true);

    const passwordMatches = (stored: any): boolean => {
      if (stored === undefined || stored === null) return false;
      return String(stored).trim() === cleanPassword;
    };

    const normalizeDigits = (val: any): string => String(val || '').replace(/\D/g, '');
    const cleanDigits = normalizeDigits(cleanId);

    const identifierMatches = (val: any): boolean => {
      if (val === undefined || val === null) return false;
      const s = String(val).trim().toLowerCase();
      if (s === lowerId) return true;
      if (cleanDigits.length >= 10) {
        const valDigits = normalizeDigits(val);
        if (valDigits.length >= 10 && valDigits.slice(-10) === cleanDigits.slice(-10)) {
          return true;
        }
      }
      return false;
    };

    try {
      let matchedUser: any = null;
      let matchedTenantDoc: any = null;
      let foundIdMatchWithWrongPassword = false;
      let missingTenantError = false;

      const buildMatchedUser = (u: any, fallbackTenantId?: string) => {
        const resolvedTenantId = u.tenantId || fallbackTenantId;
        if (!resolvedTenantId) {
          missingTenantError = true;
          return null;
        }
        return {
          id: u.id || cleanId,
          name: u.name || cleanId,
          role: u.role || 'WAITER',
          tenantId: resolvedTenantId,
          locationIds: u.locationIds || ['*'],
          assignedLocationId: u.assignedLocationId || null,
          lastActiveLocationId: u.lastActiveLocationId || null,
        };
      };

      const evaluateCandidateSync = (u: any, fallbackTenantId?: string): boolean => {
        if (!u) return false;
        if (passwordMatches(u.password)) {
          const built = buildMatchedUser(u, fallbackTenantId);
          if (built) {
            matchedUser = built;
            return true;
          }
        } else if (u.password !== undefined && u.password !== null && String(u.password).trim() !== '') {
          foundIdMatchWithWrongPassword = true;
        }
        return false;
      };

      const tryMatchTenantAdmin = (tDoc: any): boolean => {
        const tData = tDoc.data();
        const matchesAdminId =
          identifierMatches(tDoc.id) ||
          identifierMatches(tData.adminUsername) ||
          identifierMatches(tData.adminEmail) ||
          identifierMatches(tData.adminMobile) ||
          identifierMatches(tData.email) ||
          identifierMatches(tData.phone) ||
          identifierMatches(tData.mobile);

        if (!matchesAdminId) return false;

        if (passwordMatches(tData.adminPassword)) {
          const adminId = (tData.adminUsername || cleanId).trim();
          const adminKey = adminId.toLowerCase().replace(/[.#$/[\]]/g, '_');
          const storedLoc = tData.lastActiveLocationByUser?.[adminKey] || tData.lastActiveLocationId || null;
          matchedTenantDoc = { ...tData, id: tDoc.id };
          matchedUser = {
            id: adminId,
            name: `${tData.displayName || tData.businessName || 'Restaurant'} Admin`,
            role: 'ADMIN',
            tenantId: tDoc.id,
            locationIds: ['*'],
            assignedLocationId: null,
            lastActiveLocationId: storedLoc,
          };
          return true;
        } else if (tData.adminPassword) {
          foundIdMatchWithWrongPassword = true;
        }
        return false;
      };

      try {
        // WAVE 1 (Single parallel network round-trip):
        // Lookup direct root `users` doc IDs, indexed `users` fields, and `tenants` admin fields simultaneously
        const rootDocIds = lowerId !== cleanId ? [lowerId, cleanId] : [cleanId];
        const rootQueries = [
          query(collection(db, 'users'), where('email', '==', lowerId), limit(5)),
          query(collection(db, 'users'), where('mobile', '==', cleanId), limit(5)),
          query(collection(db, 'users'), where('id', '==', cleanId), limit(5)),
          query(collection(db, 'users'), where('username', '==', cleanId), limit(5)),
        ];
        if (lowerId !== cleanId) {
          rootQueries.push(query(collection(db, 'users'), where('mobile', '==', lowerId), limit(5)));
          rootQueries.push(query(collection(db, 'users'), where('username', '==', lowerId), limit(5)));
        }
        if (cleanDigits.length >= 10 && cleanDigits !== cleanId) {
          rootQueries.push(query(collection(db, 'users'), where('mobile', '==', cleanDigits), limit(5)));
          rootQueries.push(query(collection(db, 'users'), where('mobile', '==', cleanDigits.slice(-10)), limit(5)));
        }

        const tenantAdminQueries = [
          query(collection(db, 'tenants'), where('adminUsername', '==', cleanId), limit(3)),
          query(collection(db, 'tenants'), where('adminEmail', '==', lowerId), limit(3)),
          query(collection(db, 'tenants'), where('adminMobile', '==', cleanId), limit(3)),
        ];
        if (lowerId !== cleanId) {
          tenantAdminQueries.push(query(collection(db, 'tenants'), where('adminUsername', '==', lowerId), limit(3)));
        }
        if (cleanDigits.length >= 10 && cleanDigits !== cleanId) {
          tenantAdminQueries.push(query(collection(db, 'tenants'), where('adminMobile', '==', cleanDigits.slice(-10)), limit(3)));
        }

        const [docSnaps, querySnaps, tenantAdminSnaps] = await Promise.all([
          Promise.all(rootDocIds.map(docId => getDoc(doc(db, 'users', docId)).catch(() => null))),
          Promise.all(rootQueries.map(qRef => getDocs(qRef).catch(() => null))),
          Promise.all(tenantAdminQueries.map(tRef => getDocs(tRef).catch(() => null))),
        ]);

        // Evaluate direct `users` doc hits first
        for (const snap of docSnaps) {
          if (matchedUser) break;
          if (snap && snap.exists()) {
            const u = snap.data();
            if (u.tenantId) {
              evaluateCandidateSync(u);
            } else if (passwordMatches(u.password)) {
              const tSnap = await getDocs(query(collection(db, 'tenants'), where('adminUsername', '==', u.id || cleanId), limit(1))).catch(() => null);
              const resolved = tSnap && !tSnap.empty ? tSnap.docs[0].id : undefined;
              evaluateCandidateSync(u, resolved);
            }
          }
        }

        // Evaluate root `users` field queries
        if (!matchedUser) {
          for (const qSnap of querySnaps) {
            if (matchedUser) break;
            if (!qSnap) continue;
            for (const d of qSnap.docs) {
              if (evaluateCandidateSync(d.data())) break;
            }
          }
        }

        // Evaluate direct `tenants` admin hits
        if (!matchedUser) {
          for (const tSnap of tenantAdminSnaps) {
            if (matchedUser) break;
            if (!tSnap) continue;
            for (const tDoc of tSnap.docs) {
              if (tryMatchTenantAdmin(tDoc)) break;
            }
          }
        }

        // WAVE 2 (Parallel collectionGroup fallback across tenant staff subcollections)
        if (!matchedUser) {
          const cgQueries = [
            query(collectionGroup(db, 'users'), where('mobile', '==', cleanId), limit(5)),
            query(collectionGroup(db, 'users'), where('email', '==', lowerId), limit(5)),
            query(collectionGroup(db, 'users'), where('id', '==', cleanId), limit(5)),
            query(collectionGroup(db, 'users'), where('username', '==', cleanId), limit(5)),
          ];
          if (lowerId !== cleanId) {
            cgQueries.push(query(collectionGroup(db, 'users'), where('mobile', '==', lowerId), limit(5)));
          }
          if (cleanDigits.length >= 10 && cleanDigits !== cleanId) {
            cgQueries.push(query(collectionGroup(db, 'users'), where('mobile', '==', cleanDigits.slice(-10)), limit(5)));
          }

          const cgSnaps = await Promise.all(cgQueries.map(cgQ => getDocs(cgQ).catch(() => null)));
          for (const cgSnap of cgSnaps) {
            if (matchedUser) break;
            if (!cgSnap) continue;
            for (const d of cgSnap.docs) {
              const pathTenantId = d.ref.parent?.parent?.id;
              if (evaluateCandidateSync(d.data(), pathTenantId)) break;
            }
          }
        }

        // WAVE 3 (Guaranteed index-free parallel fallback across tenants & staff subcollections)
        if (!matchedUser) {
          const tenantsSnap = await getDocs(collection(db, 'tenants'));

          for (const tDoc of tenantsSnap.docs) {
            if (matchedUser) break;
            tryMatchTenantAdmin(tDoc);
          }

          if (!matchedUser) {
            const staffSnaps = await Promise.all(
              tenantsSnap.docs.map(tDoc =>
                getDocs(collection(db, 'tenants', tDoc.id, 'users'))
                  .then(snap => ({ tenantId: tDoc.id, snap }))
                  .catch(() => null)
              )
            );
            for (const entry of staffSnaps) {
              if (matchedUser) break;
              if (!entry) continue;
              for (const sDoc of entry.snap.docs) {
                const sData = sDoc.data();
                const isMatch =
                  identifierMatches(sDoc.id) ||
                  identifierMatches(sData.id) ||
                  identifierMatches(sData.mobile) ||
                  identifierMatches(sData.email);
                if (isMatch && evaluateCandidateSync(sData, entry.tenantId)) {
                  break;
                }
              }
            }
          }
        }
      } catch (firestoreErr: any) {
        console.warn('Firestore user lookup error:', firestoreErr);
        if (
          firestoreErr.message?.includes('client is offline') ||
          firestoreErr.message?.includes('PERMISSION_DENIED') ||
          firestoreErr.code === 'permission-denied' ||
          firestoreErr.code === 'unavailable'
        ) {
          const offlineMsg = 'Cannot reach Cloud Firestore. Please verify your internet connection.';
          setInlineError(offlineMsg);
          toast.error(offlineMsg, 'Database Offline');
          setLoading(false);
          return;
        }
        throw firestoreErr;
      }

      if (!matchedUser) {
        let errTitle = 'User Not Found';
        let errMsg = 'No user found with this ID, Mobile, or Email. Please check your credentials.';
        if (foundIdMatchWithWrongPassword) {
          errTitle = 'Login Failed';
          errMsg = 'Incorrect password for this account.';
        } else if (missingTenantError) {
          errTitle = 'Account Error';
          errMsg = 'This user account is not linked to any active restaurant.';
        }
        setInlineError(errMsg);
        toast.error(errMsg, errTitle);
        setLoading(false);
        return;
      }

      setStatusLabel('Loading workspace...');
      const targetTenantId = matchedUser.tenantId;

      // Parallel post-auth hydration: fetch tenant doc, features, branding, and locations in ONE round-trip
      const [tenantSnap, fetchedFeatures, fetchedBranding, fetchedLocs] = await Promise.all([
        matchedTenantDoc ? Promise.resolve(null) : getDoc(doc(db, 'tenants', targetTenantId)),
        DBServices.getTenantFeatures(targetTenantId),
        DBServices.getTenantBranding(targetTenantId),
        DBServices.getApprovedLocations(targetTenantId),
      ]);

      const tData = matchedTenantDoc || (tenantSnap?.exists() ? { ...tenantSnap.data(), id: tenantSnap.id } : null);
      if (!tData) {
        const msg = 'The restaurant tenant linked to this account could not be found.';
        setInlineError(msg);
        toast.error(msg, 'Restaurant Not Found');
        setLoading(false);
        return;
      }

      if (tData.status === 'DEACTIVATED' || tData.status === 'SUSPENDED') {
        const msg = 'This restaurant account has been suspended by the platform administrator.';
        setInlineError(msg);
        toast.error(msg, 'Account Deactivated');
        setLoading(false);
        return;
      }

      setTenant(tData as any);

      let features = fetchedFeatures;
      if (!features) {
        features = {
          tablesEnabled: true,
          multiLocationEnabled: true,
          kitchenPrinterEnabled: true,
          inventoryEnabled: false,
          splitPaymentsEnabled: true,
          insightsEnabled: true,
        };
        DBServices.updateTenantFeatures(targetTenantId, features).catch(() => {});
      }
      setFeatures(features);

      let branding = fetchedBranding;
      if (!branding) {
        branding = {
          businessName: tData.businessName || 'Zentiq Restaurant',
          displayName: tData.displayName || tData.businessName || 'Zentiq POS',
          phone: tData.adminMobile || '',
          email: tData.adminEmail || '',
          address: '',
          receiptHeader: (tData.businessName || 'ZENTIQ RESTAURANT POS').toUpperCase(),
          receiptFooter: 'Thank You & Visit Again!!',
        };
        DBServices.updateTenantBranding(targetTenantId, branding).catch(() => {});
      }
      setBranding(branding);

      let locs = [...fetchedLocs].sort((a, b) => {
        if (a.id === 'loc-primary' && b.id !== 'loc-primary') return -1;
        if (b.id === 'loc-primary' && a.id !== 'loc-primary') return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      if (locs.length === 0) {
        const defaultLocRef = doc(db, 'tenants', targetTenantId, 'locations', 'loc-primary');
        const defaultLoc = {
          id: 'loc-primary',
          tenantId: targetTenantId,
          name: 'Main Branch',
          address: '',
          phone: tData.adminMobile || '',
          status: 'ACTIVE' as const,
        };
        setDoc(defaultLocRef, defaultLoc).catch(() => {});
        locs = [defaultLoc];
      }

      const userKey = (matchedUser.id || '').trim().toLowerCase().replace(/[.#$/[\]]/g, '_');
      const savedAccountLoc = useTenantStore.getState().getSavedLocationForAccount(targetTenantId, matchedUser.id);
      const tenantStoredLoc = tData.lastActiveLocationByUser?.[userKey] || tData.lastActiveLocationId || null;
      const isBranchScoped = !!matchedUser.assignedLocationId && !matchedUser.locationIds?.includes('*');

      const preferredLocId =
        (isBranchScoped && locs.some(l => l.id === matchedUser.assignedLocationId) ? matchedUser.assignedLocationId : null) ||
        (savedAccountLoc && locs.some(l => l.id === savedAccountLoc) ? savedAccountLoc : null) ||
        (matchedUser.lastActiveLocationId && locs.some(l => l.id === matchedUser.lastActiveLocationId) ? matchedUser.lastActiveLocationId : null) ||
        (tenantStoredLoc && locs.some(l => l.id === tenantStoredLoc) ? tenantStoredLoc : null) ||
        (matchedUser.assignedLocationId && locs.some(l => l.id === matchedUser.assignedLocationId) ? matchedUser.assignedLocationId : null) ||
        (locs[0]?.id || null);

      // Commit session immediately with resolved branch so user enters the exact branch right away
      setUser({ ...matchedUser, lastActiveLocationId: preferredLocId });
      setLocations(locs);
      setActiveLocationId(preferredLocId);

      subscribeToActiveTenant(targetTenantId);
    } catch (err: any) {
      const msg = err?.message || 'An unexpected error occurred during login.';
      setInlineError(msg);
      toast.error(msg, 'Login Error');
    } finally {
      setLoading(false);
    }
  };

  const highlights = [
    {
      icon: <Zap size={18} color="#A78BFA" />,
      title: '1-Click Quick Sale & KOT',
      desc: 'Instant counter billing and compact kitchen token dispatch with zero screen hopping.',
    },
    {
      icon: <Building2 size={18} color="#34D399" />,
      title: 'Branch-Isolated Operations',
      desc: 'Separate menus, thermal printer IPs, tax rules, and staff scopes per outlet.',
    },
    {
      icon: <Printer size={18} color="#38BDF8" />,
      title: 'Direct LAN ESC/POS Printing',
      desc: 'Zero driver hassles over TCP port 9100 for billing, kitchen, and token printers.',
    },
  ];

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#050814]' : 'bg-slate-50'}`}>
      {/* Ambient Background Glows */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -120,
          left: -80,
          width: 420,
          height: 420,
          borderRadius: 210,
          backgroundColor: isDark ? 'rgba(93, 63, 211, 0.16)' : 'rgba(93, 63, 211, 0.08)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -140,
          right: -100,
          width: 460,
          height: 460,
          borderRadius: 230,
          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.10)' : 'rgba(14, 165, 233, 0.08)',
        }}
      />

      {/* Top Utility Header */}
      <View className="flex-row items-center justify-between px-5 sm:px-8 pt-3 pb-1 z-10">
        <View className="flex-row items-center">
          <View className={`flex-row items-center px-3 py-1 rounded-full border ${isDark ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-emerald-50 border-emerald-200'}`}>
            <View className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
            <Text className={`text-[11px] font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
              Live Cloud Sync
            </Text>
          </View>
          <View className={`ml-2 px-2.5 py-1 rounded-full border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
            <Text className={`text-[11px] font-mono font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              v{packageJson.version}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={toggleTheme}
          activeOpacity={0.8}
          className={`flex-row items-center px-3 py-1.5 rounded-full border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}
        >
          {isDark ? <Sun size={14} color="#FBBF24" /> : <Moon size={14} color="#4F46E5" />}
          <Text className={`text-xs font-bold ml-1.5 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            {isDark ? 'Light' : 'Dark'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, width: '100%' }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: isWide ? 40 : 20,
            paddingVertical: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              width: '100%',
              maxWidth: isWide ? 1020 : 440,
              flexDirection: isWide ? 'row' : 'column',
              alignItems: isWide ? 'center' : 'stretch',
              gap: isWide ? 48 : 24,
            }}
          >
            {/* Left Showcase Panel (Desktop/Tablet) or Compact Hero (Mobile) */}
            <View style={{ flex: isWide ? 1.1 : undefined, alignItems: isWide ? 'flex-start' : 'center' }}>
              <View className="flex-row items-center mb-4">
                <View
                  style={{
                    width: isWide ? 64 : 72,
                    height: isWide ? 64 : 72,
                    borderRadius: 20,
                    backgroundColor: '#1E1B4B',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#6366F1',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.35,
                    shadowRadius: 16,
                    elevation: 10,
                  }}
                >
                  <Image
                    source={require('../../../assets/logo-optimized.png')}
                    style={{ width: isWide ? 64 : 72, height: isWide ? 64 : 72, borderRadius: 20 }}
                    resizeMode="contain"
                    fadeDuration={0}
                  />
                </View>

                {isWide && (
                  <View className="ml-4">
                    <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      ZENTIQ POS
                    </Text>
                    <Text className="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-0.5">
                      Restaurant Command Terminal
                    </Text>
                  </View>
                )}
              </View>

              {!isWide && (
                <View className="items-center mb-1">
                  <Text className={`text-3xl font-black tracking-tight text-center ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    ZENTIQ POS
                  </Text>
                  <Text className="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-1 text-center">
                    Restaurant Command Terminal
                  </Text>
                </View>
              )}

              {isWide && (
                <>
                  <Text className={`text-4xl font-black tracking-tight leading-tight mt-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Built for speed at every table & counter.
                  </Text>
                  <Text className={`text-sm leading-relaxed mt-3 mb-6 max-w-md ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Sign in with your branch credentials to manage dine-in tables, rapid counter sales, thermal KOT printing, and live branch analytics.
                  </Text>

                  <View className="w-full space-y-3">
                    {highlights.map((item, idx) => (
                      <View
                        key={idx}
                        className={`flex-row items-start p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-900/55 border-slate-800/80' : 'bg-white/90 border-slate-200 shadow-sm'
                        }`}
                      >
                        <View className={`w-9 h-9 rounded-xl items-center justify-center mr-3.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                          {item.icon}
                        </View>
                        <View className="flex-1">
                          <Text className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {item.title}
                          </Text>
                          <Text className={`text-[11px] mt-0.5 leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {item.desc}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Right Sign-In Form Card */}
            <View style={{ flex: isWide ? 0.95 : undefined, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
              <View
                className={`p-6 sm:p-8 rounded-3xl border shadow-2xl ${
                  isDark
                    ? 'bg-slate-900/85 border-slate-800/90'
                    : 'bg-white border-slate-200'
                }`}
              >
                <View className="mb-6">
                  <View className="flex-row items-center mb-1.5">
                    <ShieldCheck size={16} color={isDark ? '#818CF8' : '#4F46E5'} />
                    <Text className={`text-[11px] font-bold uppercase tracking-wider ml-1.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                      Terminal Access
                    </Text>
                  </View>
                  <Text className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Welcome back
                  </Text>
                  <Text className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Enter your Staff ID, Mobile Number, or Admin Email to continue.
                  </Text>
                </View>

                {inlineError && (
                  <View className={`mb-4 p-3 rounded-2xl border flex-row items-start ${isDark ? 'bg-rose-500/10 border-rose-500/30' : 'bg-rose-50 border-rose-200'}`}>
                    <AlertCircle size={16} color="#F43F5E" style={{ marginTop: 1 }} />
                    <Text className={`text-xs font-medium ml-2 flex-1 ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                      {inlineError}
                    </Text>
                  </View>
                )}

                <Input
                  label="User ID / Mobile / Email"
                  placeholder="e.g. 9876543210 or branchadmin"
                  value={userId}
                  onChangeText={(text) => {
                    setUserId(text);
                    if (inlineError) setInlineError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  containerClassName={isDark ? 'bg-slate-950/70 border-slate-800 rounded-2xl py-3' : 'bg-slate-50 border-slate-200 rounded-2xl py-3'}
                  leftIcon={<User size={18} color={isDark ? '#818CF8' : '#6366F1'} />}
                />

                <Input
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (inlineError) setInlineError(null);
                  }}
                  secureTextEntry={!showPassword}
                  containerClassName={isDark ? 'bg-slate-950/70 border-slate-800 rounded-2xl py-3' : 'bg-slate-50 border-slate-200 rounded-2xl py-3'}
                  leftIcon={<Lock size={18} color={isDark ? '#818CF8' : '#6366F1'} />}
                  rightIcon={
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      {showPassword ? <Eye size={18} color="#64748B" /> : <EyeOff size={18} color="#64748B" />}
                    </TouchableOpacity>
                  }
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />

                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={isLoading}
                  activeOpacity={0.85}
                  className={`mt-4 py-3.5 px-5 rounded-2xl flex-row items-center justify-center shadow-lg ${
                    isLoading
                      ? 'bg-indigo-600/70'
                      : 'bg-[#5D3FD3] active:bg-[#4C32B8]'
                  }`}
                >
                  {isLoading ? (
                    <View className="flex-row items-center">
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text className="text-white font-bold text-sm ml-2.5">
                        {statusLabel}
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center">
                      <Text className="text-white font-extrabold text-sm tracking-wide">
                        SIGN IN TO TERMINAL
                      </Text>
                      <ArrowRight size={17} color="#FFFFFF" style={{ marginLeft: 8 }} />
                    </View>
                  )}
                </TouchableOpacity>

                <View className={`mt-6 pt-4 border-t flex-row items-center justify-between ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                  <Text className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Branch-scoped security enabled
                  </Text>
                  <Text className={`text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Zentiq Cloud POS
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
