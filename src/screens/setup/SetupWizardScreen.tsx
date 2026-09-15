import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useTenantStore } from '../../store/tenant.store';
import { DBServices } from '../../services/firebase/db';
import { Check, Building, Sliders, Printer } from 'lucide-react-native';
import { Routes } from '../../constants/routes';

export const SetupWizardScreen = () => {
  const navigation = useNavigation<any>();
  const { tenant, branding, features, setBranding, setFeatures } = useTenantStore();
  const [step, setStep] = useState(1);

  // Form states
  const [businessName, setBusinessName] = useState(branding?.businessName || tenant?.businessName || '');
  const [phone, setPhone] = useState(branding?.phone || '');
  const [email, setEmail] = useState(branding?.email || '');
  const [address, setAddress] = useState(branding?.address || '');
  const [gstin, setGstin] = useState(branding?.gstin || '');
  const [receiptHeader, setReceiptHeader] = useState(branding?.receiptHeader || '');
  const [receiptFooter, setReceiptFooter] = useState(branding?.receiptFooter || '');

  // Feature flags
  const [tablesEnabled, setTablesEnabled] = useState(features.tablesEnabled);
  const [kitchenPrinterEnabled, setKitchenPrinterEnabled] = useState(features.kitchenPrinterEnabled);
  const [splitPaymentsEnabled, setSplitPaymentsEnabled] = useState(features.splitPaymentsEnabled);

  const handleFinish = async () => {
    if (!tenant?.id) return;
    try {
      const updatedBranding = {
        businessName,
        displayName: businessName,
        phone,
        email,
        address,
        gstin,
        receiptHeader: receiptHeader || businessName,
        receiptFooter: receiptFooter || 'Thank You & Visit Again!!',
      };
      await DBServices.updateTenantBranding(tenant.id, updatedBranding);
      setBranding(updatedBranding);

      const updatedFeatures = {
        tablesEnabled,
        kitchenPrinterEnabled,
        splitPaymentsEnabled,
        inventoryEnabled: false,
        insightsEnabled: true,
      };
      await DBServices.updateTenantFeatures(tenant.id, updatedFeatures);
      setFeatures(updatedFeatures);

      Alert.alert('Success', 'Store profile and preferences configured successfully!', [
        { text: 'Launch POS', onPress: () => navigation.navigate(Routes.HOME) }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header title="POS First-Time Setup" subtitle={`Step ${step} of 3`} />

      <ScrollView className="flex-1 p-5" keyboardShouldPersistTaps="handled">
        {/* Progress bar */}
        <View className="flex-row gap-2 mb-6">
          <View className={`flex-1 h-1.5 rounded-full ${step >= 1 ? 'bg-[#5D3FD3]' : 'bg-slate-800'}`} />
          <View className={`flex-1 h-1.5 rounded-full ${step >= 2 ? 'bg-[#5D3FD3]' : 'bg-slate-800'}`} />
          <View className={`flex-1 h-1.5 rounded-full ${step >= 3 ? 'bg-[#5D3FD3]' : 'bg-slate-800'}`} />
        </View>

        {step === 1 && (
          <View>
            <View className="flex-row items-center mb-4">
              <Building size={24} color="#818CF8" />
              <Text className="text-xl font-bold text-white ml-2">Business Profile</Text>
            </View>
            <Text className="text-slate-400 text-xs mb-6">
              Configure your business name and details printed on customer receipts.
            </Text>

            <Input
              label="Restaurant / Business Name"
              placeholder="e.g. Vasudha Family Restaurant"
              value={businessName}
              onChangeText={setBusinessName}
            />
            <Input
              label="Official Phone Number"
              placeholder="e.g. 9876543210"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <Input
              label="Official Email"
              placeholder="e.g. contact@restaurant.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label="Physical Address"
              placeholder="Street, City, State"
              value={address}
              onChangeText={setAddress}
            />
            <Input
              label="GSTIN (Optional)"
              placeholder="e.g. 36DLVPS528K1ZW"
              value={gstin}
              onChangeText={setGstin}
            />

            <Button
              title="Next: Feature Options"
              onPress={() => setStep(2)}
              size="lg"
              className="mt-6"
            />
          </View>
        )}

        {step === 2 && (
          <View>
            <View className="flex-row items-center mb-4">
              <Sliders size={24} color="#818CF8" />
              <Text className="text-xl font-bold text-white ml-2">Business Model & Features</Text>
            </View>
            <Text className="text-slate-400 text-xs mb-6">
              Enable only the features you need. (e.g. disable Tables for Curry Points / Tiffin Centers).
            </Text>

            <TouchableOpacity
              className={`p-4 rounded-2xl border mb-3 flex-row items-center justify-between ${tablesEnabled ? 'bg-purple-950/20 border-[#5D3FD3]' : 'bg-slate-900 border-slate-800'}`}
              onPress={() => setTablesEnabled(!tablesEnabled)}
            >
              <View className="flex-1 mr-3">
                <Text className="text-white font-bold text-base">Dining Tables</Text>
                <Text className="text-slate-400 text-xs mt-1">Floor plan, table status (Green/Amber), waiter dine-in</Text>
              </View>
              <View className={`w-6 h-6 rounded-full items-center justify-center ${tablesEnabled ? 'bg-[#5D3FD3]' : 'bg-slate-800'}`}>
                {tablesEnabled && <Check size={14} color="white" />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className={`p-4 rounded-2xl border mb-3 flex-row items-center justify-between ${kitchenPrinterEnabled ? 'bg-purple-950/20 border-[#5D3FD3]' : 'bg-slate-900 border-slate-800'}`}
              onPress={() => setKitchenPrinterEnabled(!kitchenPrinterEnabled)}
            >
              <View className="flex-1 mr-3">
                <Text className="text-white font-bold text-base">Kitchen KOT Printing</Text>
                <Text className="text-slate-400 text-xs mt-1">Send incremental orders directly to kitchen thermal printer</Text>
              </View>
              <View className={`w-6 h-6 rounded-full items-center justify-center ${kitchenPrinterEnabled ? 'bg-[#5D3FD3]' : 'bg-slate-800'}`}>
                {kitchenPrinterEnabled && <Check size={14} color="white" />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className={`p-4 rounded-2xl border mb-3 flex-row items-center justify-between ${splitPaymentsEnabled ? 'bg-purple-950/20 border-[#5D3FD3]' : 'bg-slate-900 border-slate-800'}`}
              onPress={() => setSplitPaymentsEnabled(!splitPaymentsEnabled)}
            >
              <View className="flex-1 mr-3">
                <Text className="text-white font-bold text-base">Split Payments</Text>
                <Text className="text-slate-400 text-xs mt-1">Accept partial payment across Cash, UPI, and Card</Text>
              </View>
              <View className={`w-6 h-6 rounded-full items-center justify-center ${splitPaymentsEnabled ? 'bg-[#5D3FD3]' : 'bg-slate-800'}`}>
                {splitPaymentsEnabled && <Check size={14} color="white" />}
              </View>
            </TouchableOpacity>

            <View className="flex-row gap-3 mt-6">
              <Button title="Back" variant="secondary" onPress={() => setStep(1)} className="flex-1" />
              <Button title="Next: Receipt Details" onPress={() => setStep(3)} className="flex-1" />
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <View className="flex-row items-center mb-4">
              <Printer size={24} color="#818CF8" />
              <Text className="text-xl font-bold text-white ml-2">Receipt Header & Footer</Text>
            </View>
            <Text className="text-slate-400 text-xs mb-6">
              Customize the text printed at the top and bottom of your thermal bills.
            </Text>

            <Input
              label="Receipt Header Title"
              placeholder="e.g. VASUDHA FAMILY RESTAURANT"
              value={receiptHeader}
              onChangeText={setReceiptHeader}
            />
            <Input
              label="Receipt Footer Message"
              placeholder="e.g. Thank You & Visit Again!!"
              value={receiptFooter}
              onChangeText={setReceiptFooter}
            />

            <View className="bg-slate-900 p-4 rounded-2xl border border-slate-800 my-4">
              <Text className="text-indigo-300 font-bold text-xs uppercase tracking-wider mb-2">Summary</Text>
              <Text className="text-slate-300 text-xs mb-1">• Business: {businessName || 'Not set'}</Text>
              <Text className="text-slate-300 text-xs mb-1">• Tables Mode: {tablesEnabled ? 'Enabled' : 'Disabled (Quick Order)'}</Text>
              <Text className="text-slate-300 text-xs">• Kitchen KOT: {kitchenPrinterEnabled ? 'Active' : 'Off'}</Text>
            </View>

            <View className="flex-row gap-3 mt-6">
              <Button title="Back" variant="secondary" onPress={() => setStep(2)} className="flex-1" />
              <Button title="Save & Launch POS" variant="success" onPress={handleFinish} className="flex-1" />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};
