import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Utensils, ShoppingBag, LayoutGrid, CheckCircle2, Building } from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useTenantStore } from '../../store/tenant.store';
import { DBServices } from '../../services/firebase/db';

export const BusinessProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const { tenant, branding, features, setBranding, setFeatures } = useTenantStore();

  // Branding states
  const [businessName, setBusinessName] = useState(branding?.businessName || '');
  const [displayName, setDisplayName] = useState(branding?.displayName || '');
  const [phone, setPhone] = useState(branding?.phone || '');
  const [email, setEmail] = useState(branding?.email || '');
  const [address, setAddress] = useState(branding?.address || '');
  const [gstin, setGstin] = useState(branding?.gstin || '');
  const [receiptHeader, setReceiptHeader] = useState(branding?.receiptHeader || '');
  const [receiptFooter, setReceiptFooter] = useState(branding?.receiptFooter || '');

  // Operational Entitlements controlled by Client Admin
  const [dineInTablesEnabled, setDineInTablesEnabled] = useState(
    features.tablesEnabled !== undefined ? features.tablesEnabled : true
  );
  const [pickupEnabled, setPickupEnabled] = useState(
    features.pickupEnabled !== undefined ? features.pickupEnabled : true
  );

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!tenant?.id) return;
    setIsSaving(true);
    try {
      // 1. Update branding profile
      const brandingPayload = {
        businessName,
        displayName: displayName || businessName,
        phone,
        email,
        address,
        gstin,
        receiptHeader: receiptHeader || businessName,
        receiptFooter: receiptFooter || 'Thank You & Visit Again!!',
      };
      await DBServices.updateTenantBranding(tenant.id, brandingPayload);
      setBranding(brandingPayload);

      // 2. Update operational features controlled by Client Admin
      const featuresPayload = {
        tablesEnabled: dineInTablesEnabled,
        dineInEnabled: dineInTablesEnabled,
        pickupEnabled: pickupEnabled,
      };
      await DBServices.updateTenantFeatures(tenant.id, featuresPayload);
      setFeatures({ ...features, ...featuresPayload });

      Alert.alert('Success', 'Business profile and ordering modes updated successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header title="Branding & Operating Modes" subtitle="Configure ordering features and receipt headers" />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom + 40, 60) }} keyboardShouldPersistTaps="handled">
        {/* Client Admin Ordering Modes Control */}
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-6">
          <View className="flex-row items-center mb-1">
            <Utensils size={18} color="#818CF8" />
            <Text className="text-white font-black text-base ml-2">Operating Order Modes</Text>
          </View>
          <Text className="text-slate-400 text-xs mb-4">
            Controlled by Client Admin. Toggles reflect instantly on counter & floor devices.
          </Text>

          {/* Toggle 1: Enable Dine-In Tables */}
          <View className="flex-row items-center justify-between p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl mb-3">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center">
                <LayoutGrid size={16} color="#10B981" />
                <Text className="text-white font-bold text-sm ml-2">Enable Dine-In Tables</Text>
              </View>
              <Text className="text-slate-400 text-xs mt-1">
                Enables table floor plans, table seating layout, and dine-in KOT orders.
              </Text>
            </View>
            <Switch
              value={dineInTablesEnabled}
              onValueChange={setDineInTablesEnabled}
              trackColor={{ false: '#334155', true: '#5D3FD3' }}
              thumbColor={dineInTablesEnabled ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Toggle 2: Enable Pick-Up / Takeaway */}
          <View className="flex-row items-center justify-between p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center">
                <ShoppingBag size={16} color="#818CF8" />
                <Text className="text-white font-bold text-sm ml-2">Enable Pick-Up / Takeaway</Text>
              </View>
              <Text className="text-slate-400 text-xs mt-1">
                Enables takeaway parcels and fast counter orders without table assignment.
              </Text>
            </View>
            <Switch
              value={pickupEnabled}
              onValueChange={setPickupEnabled}
              trackColor={{ false: '#334155', true: '#5D3FD3' }}
              thumbColor={pickupEnabled ? '#FFFFFF' : '#94A3B8'}
            />
          </View>
        </View>

        {/* Business & Receipt Branding */}
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-6">
          <View className="flex-row items-center mb-4">
            <Building size={18} color="#C084FC" />
            <Text className="text-white font-black text-base ml-2">Receipt & Business Details</Text>
          </View>

          <Input label="Business Legal Name" value={businessName} onChangeText={setBusinessName} />
          <Input label="App Display Name" value={displayName} onChangeText={setDisplayName} />
          <Input label="Contact Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Input label="Official Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
          <Input label="Address" value={address} onChangeText={setAddress} />
          <Input label="GSTIN Number" value={gstin} onChangeText={setGstin} autoCapitalize="characters" />
          <Input label="Receipt Header (Printed on Bills)" value={receiptHeader} onChangeText={setReceiptHeader} />
          <Input label="Receipt Footer Note" value={receiptFooter} onChangeText={setReceiptFooter} />
        </View>

        <Button
          title="Save Settings & Modes"
          onPress={handleSave}
          isLoading={isSaving}
          size="lg"
          className="mb-10"
        />
      </ScrollView>
    </SafeAreaView>
  );
};
