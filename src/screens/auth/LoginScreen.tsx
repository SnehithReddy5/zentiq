import { toast } from '../../utils/toast';
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/auth.store';
import { useTenantStore } from '../../store/tenant.store';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Utensils, Lock, User, Eye, EyeOff, Sparkles } from 'lucide-react-native';
import { db } from '../../services/firebase/config';
import { doc, getDoc, setDoc, collection, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import { DBServices } from '../../services/firebase/db';

export const LoginScreen = () => {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { setUser, setLoading, isLoading } = useAuthStore();
  const { setTenant, setBranding, setFeatures, setLocations, setActiveLocationId, subscribeToActiveTenant } = useTenantStore();

  const handleLogin = async () => {
    const cleanId = userId.trim();
    const cleanPassword = password.trim();

    if (!cleanId || !cleanPassword) {
      toast.warning('Please enter your User ID / Mobile / Email and Password', 'Required');
      return;
    }
    setLoading(true);
    try {
      let matchedUser: any = null;

      // 1. First try direct Firestore users collection lookup
      try {
        let userRef = doc(db, 'users', cleanId.toLowerCase());
        let userSnap = await getDoc(userRef);

        if (!userSnap.exists() && cleanId !== cleanId.toLowerCase()) {
          userRef = doc(db, 'users', cleanId);
          userSnap = await getDoc(userRef);
        }

        // Fallback: If not found in root users collection, search across tenant users subcollections
        if (!userSnap.exists()) {
          try {
            const cgQuery = query(collectionGroup(db, 'users'), where('mobile', '==', cleanId));
            const cgSnap = await getDocs(cgQuery);
            if (!cgSnap.empty) {
              userSnap = cgSnap.docs[0];
              // Backfill into root users for next time
              try {
                await setDoc(doc(db, 'users', cleanId.toLowerCase()), userSnap.data());
              } catch (_) {}
            }
          } catch (cgErr) {
            console.warn('collectionGroup search error:', cgErr);
          }
        }

        if (userSnap.exists()) {
          const u = userSnap.data();
          if (u.password === cleanPassword) {
            let userTenantId = u.tenantId;

            // If tenantId is missing, resolve directly from tenants collection
            if (!userTenantId) {
              try {
                const tQuery = query(collection(db, 'tenants'), where('adminUsername', '==', cleanId));
                const tSnap = await getDocs(tQuery);
                if (!tSnap.empty) {
                  userTenantId = tSnap.docs[0].id;
                  try {
                    await setDoc(doc(db, 'users', cleanId), { tenantId: userTenantId }, { merge: true });
                  } catch (_) {}
                }
              } catch (_) {}
            }

            if (!userTenantId) {
              toast.error('This user account is not linked to any active restaurant.', 'Account Error');
              setLoading(false);
              return;
            }

            matchedUser = {
              id: u.id || cleanId,
              name: u.name || cleanId,
              role: u.role || 'WAITER',
              tenantId: userTenantId,
              locationIds: u.locationIds || ['*'],
              assignedLocationId: u.assignedLocationId || null,
              lastActiveLocationId: u.lastActiveLocationId || null,
            };
          } else {
            toast.error('Incorrect password for this user.', 'Login Failed');
            setLoading(false);
            return;
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
          toast.error('Cannot reach Cloud Firestore. Please ensure your internet connection is active.', 'Database Offline');
          setLoading(false);
          return;
        }
        throw firestoreErr;
      }

      if (!matchedUser) {
        toast.error('No user found with this ID or Mobile. Please check your credentials.', 'User Not Found');
        setLoading(false);
        return;
      }

      const targetTenantId = matchedUser.tenantId;

      // 3. Check if Tenant is DEACTIVATED or SUSPENDED
      const tenantRef = doc(db, 'tenants', targetTenantId);
      const tenantSnap = await getDoc(tenantRef);

      if (tenantSnap.exists()) {
        const tData = tenantSnap.data();
        if (tData.status === 'DEACTIVATED' || tData.status === 'SUSPENDED') {
          toast.error('This restaurant account has been suspended by the platform administrator. Please contact support.', 'Account Deactivated');
          setLoading(false);
          return;
        }
        setTenant({ ...tData, id: tenantSnap.id } as any);
      } else {
        toast.error('The restaurant tenant linked to this account could not be found.', 'Restaurant Not Found');
        setLoading(false);
        return;
      }

      // Fetch Features
      let features = await DBServices.getTenantFeatures(targetTenantId);
      if (!features) {
        features = {
          tablesEnabled: true,
          multiLocationEnabled: true,
          kitchenPrinterEnabled: true,
          inventoryEnabled: false,
          splitPaymentsEnabled: true,
          insightsEnabled: true,
        };
        await DBServices.updateTenantFeatures(targetTenantId, features);
      }
      setFeatures(features);

      // Fetch Branding
      let branding = await DBServices.getTenantBranding(targetTenantId);
      if (!branding) {
        branding = {
          businessName: 'Vasudha Family Restaurant',
          displayName: 'Vasudha POS',
          phone: '9876543210',
          email: 'contact@vasudha.com',
          address: '2nd Floor, Kaveri Enclave, Kompally, Hyderabad',
          gstin: '36DLVPS528K1ZW',
          receiptHeader: 'VASUDHA FAMILY RESTAURANT',
          receiptFooter: 'Thank You & Visit Again!!',
        };
        await DBServices.updateTenantBranding(targetTenantId, branding);
      }
      setBranding(branding);

      // Fetch Locations
      let locs = await DBServices.getApprovedLocations(targetTenantId);
      if (locs.length === 0) {
        const defaultLocRef = doc(db, 'tenants', targetTenantId, 'locations', 'loc-primary');
        const defaultLoc = {
          id: 'loc-primary',
          tenantId: targetTenantId,
          name: 'Kompally Main Branch',
          address: 'Kompally, Hyderabad',
          phone: '9876543210',
          status: 'ACTIVE' as const,
        };
        await setDoc(defaultLocRef, defaultLoc);
        locs = [defaultLoc];
      }
      setLocations(locs);
      // Restore user's last selected branch (e.g. hyd branch) or assigned branch
      setUser(matchedUser);
      if (matchedUser.lastActiveLocationId && locs.some(l => l.id === matchedUser.lastActiveLocationId)) {
        setActiveLocationId(matchedUser.lastActiveLocationId);
      } else if (matchedUser.assignedLocationId) {
        setActiveLocationId(matchedUser.assignedLocationId);
      } else {
        setActiveLocationId(locs[0]?.id || null);
      }

      // Start live real-time subscription for instant feature and status enforcement
      subscribeToActiveTenant(targetTenantId);

    } catch (err: any) {
      toast.error(err.message || 'An unexpected error occurred during login.', 'Login Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, width: '100%', justifyContent: 'center' }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
            paddingVertical: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Brand Header - Strictly Centered */}
          <View style={{ width: '100%', maxWidth: 440, alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 24,
                backgroundColor: '#1E1B4B',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 16,
                elevation: 10,
              }}
            >
              <Image
                source={require('../../../assets/logo-optimized.png')}
                style={{ width: 96, height: 96, borderRadius: 24 }}
                resizeMode="contain"
                fadeDuration={0}
              />
            </View>

            <Text style={{ textAlign: 'center' }} className="text-3xl font-black text-white tracking-wider">
              ZENTIQ POS
            </Text>
            <Text style={{ textAlign: 'center' }} className="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-1.5">
              Multi-Tenant Cloud Platform
            </Text>
          </View>

          {/* Form Card - Max 440px Centered */}
          <View
            style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}
            className="bg-slate-900/80 border border-slate-800 p-6 rounded-3xl shadow-2xl backdrop-blur-xl"
          >
            <Text className="text-white text-base font-semibold text-center mb-6">Sign in to your restaurant</Text>

            <Input
              label="User ID / Mobile / Email"
              placeholder="Enter Mobile / User ID"
              value={userId}
              onChangeText={setUserId}
              autoCapitalize="none"
              leftIcon={<User size={18} color="#64748B" />}
            />

            <Input
              label="Password"
              placeholder="Enter password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              leftIcon={<Lock size={18} color="#64748B" />}
              rightIcon={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? <Eye size={18} color="#64748B" /> : <EyeOff size={18} color="#64748B" />}
                </TouchableOpacity>
              }
            />

            <Button
              title="SIGN IN"
              onPress={handleLogin}
              isLoading={isLoading}
              size="lg"
              className="mt-4 shadow-lg shadow-purple-500/20"
            />
          </View>

          {/* Footer - Centered */}
          <View style={{ width: '100%', maxWidth: 440, alignItems: 'center', justifyContent: 'center' }} className="mt-8">
            <Text style={{ textAlign: 'center' }} className="text-slate-600 text-[11px]">
              Zentiq POS Enterprise • Connected to Live Cloud
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};