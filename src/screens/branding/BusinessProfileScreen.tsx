import { toast } from '../../utils/toast';
import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, Switch, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Utensils,
  ShoppingBag,
  LayoutGrid,
  Building,
  CreditCard,
  Banknote,
  Smartphone,
  Split,
  Plus,
  Trash2,
  AlertCircle,
  Calculator,
  CheckCircle2
} from 'lucide-react-native';
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

  // GST Tax Configuration
  const [gstEnabled, setGstEnabled] = useState(
    branding?.gstEnabled !== undefined ? branding.gstEnabled : (features.gstEnabled !== undefined ? features.gstEnabled : true)
  );
  const [gstType, setGstType] = useState<'INCLUSIVE' | 'EXCLUSIVE'>(
    branding?.gstType || features.gstType || 'INCLUSIVE'
  );
  const [cgstRate, setCgstRate] = useState(
    (branding?.cgstRate !== undefined ? branding.cgstRate : (features.cgstRate !== undefined ? features.cgstRate : 2.5)).toString()
  );
  const [sgstRate, setSgstRate] = useState(
    (branding?.sgstRate !== undefined ? branding.sgstRate : (features.sgstRate !== undefined ? features.sgstRate : 2.5)).toString()
  );

  // Operational Entitlements
  const [dineInTablesEnabled, setDineInTablesEnabled] = useState(
    features.tablesEnabled !== undefined ? features.tablesEnabled : true
  );
  const [pickupEnabled, setPickupEnabled] = useState(
    features.pickupEnabled !== undefined ? features.pickupEnabled : true
  );

  // Payment Methods Configuration
  const [paymentsEnabled, setPaymentsEnabled] = useState(
    features.paymentsEnabled !== undefined ? features.paymentsEnabled : true
  );
  const [cashEnabled, setCashEnabled] = useState(
    features.cashEnabled !== undefined ? features.cashEnabled : true
  );
  const [upiEnabled, setUpiEnabled] = useState(
    features.upiEnabled !== undefined ? features.upiEnabled : true
  );
  const [cardEnabled, setCardEnabled] = useState(
    features.cardEnabled !== undefined ? features.cardEnabled : true
  );
  const [customMethods, setCustomMethods] = useState<string[]>(
    features.customPaymentMethods || []
  );
  const [newCustomMethodName, setNewCustomMethodName] = useState('');

  // Split payments switch
  const [splitPaymentsEnabled, setSplitPaymentsEnabled] = useState(
    features.splitPaymentsEnabled !== undefined ? features.splitPaymentsEnabled : true
  );

  const [isSaving, setIsSaving] = useState(false);

  // Active payment methods count
  const activeMethodsCount = (paymentsEnabled ? (
    (cashEnabled ? 1 : 0) +
    (upiEnabled ? 1 : 0) +
    (cardEnabled ? 1 : 0) +
    customMethods.length
  ) : 0);

  const canEnableSplit = paymentsEnabled && activeMethodsCount >= 2;

  // Preset GST rate applicator
  const applyGstPreset = (totalPercent: number) => {
    const half = (totalPercent / 2).toFixed(totalPercent % 2 === 0 ? 0 : 1);
    setCgstRate(half);
    setSgstRate(half);
  };

  const handleAddCustomMethod = () => {
    const clean = newCustomMethodName.trim();
    if (!clean) return;
    if (customMethods.map(m => m.toLowerCase()).includes(clean.toLowerCase())) {
      toast.warning('This payment method already exists.', 'Duplicate');
      return;
    }
    setCustomMethods([...customMethods, clean]);
    setNewCustomMethodName('');
  };

  const handleRemoveCustomMethod = (methodName: string) => {
    setCustomMethods(customMethods.filter(m => m !== methodName));
  };

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
        gstEnabled,
        gstType,
        cgstRate: parseFloat(cgstRate) || 0,
        sgstRate: parseFloat(sgstRate) || 0,
      };
      await DBServices.updateTenantBranding(tenant.id, brandingPayload);
      setBranding(brandingPayload);

      // 2. Update operational features & payment methods
      const featuresPayload = {
        tablesEnabled: dineInTablesEnabled,
        dineInEnabled: dineInTablesEnabled,
        pickupEnabled: pickupEnabled,
        paymentsEnabled: paymentsEnabled,
        cashEnabled: cashEnabled,
        upiEnabled: upiEnabled,
        cardEnabled: cardEnabled,
        customPaymentMethods: customMethods,
        splitPaymentsEnabled: canEnableSplit ? splitPaymentsEnabled : false,
        gstEnabled,
        gstType,
        cgstRate: parseFloat(cgstRate) || 0,
        sgstRate: parseFloat(sgstRate) || 0,
      };
      await DBServices.updateTenantFeatures(tenant.id, featuresPayload);
      setFeatures({ ...features, ...featuresPayload });

      toast.success('Store settings and payment preferences updated successfully!', 'Settings Saved');
    } catch (e: any) {
      toast.error(e.message, 'Save Error');
    } finally {
      setIsSaving(false);
    }
  };

  const currentTotalGst = (parseFloat(cgstRate) || 0) + (parseFloat(sgstRate) || 0);

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header title="Store & Payment Settings" subtitle="Configure ordering modes, payment methods & receipt branding" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom + 80, 110),
          maxWidth: 760,
          alignSelf: 'center',
          width: '100%'
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. PAYMENT METHODS CARD (Clean Header, No Overflowing Pills) */}
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-5 shadow-sm">
          <View className="flex-row items-center mb-1">
            <CreditCard size={18} color="#10B981" />
            <Text className="text-white font-black text-base ml-2">Payment Methods</Text>
          </View>
          <Text className="text-slate-400 text-xs mb-4 leading-relaxed">
            Choose which payment tenders are collected at checkout.
          </Text>

          {/* Master Toggle: Enable Payment Processing */}
          <View className="flex-row items-center justify-between p-3.5 bg-slate-950/90 border border-slate-800 rounded-2xl mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-white font-bold text-sm">Accept Payments at Checkout</Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                {paymentsEnabled
                  ? 'Cashiers collect Cash, UPI, or Card upon settlement.'
                  : 'Pure KOT Mode: Checkout only shows "Print KOT & Dispatch".'}
              </Text>
            </View>
            <Switch
              value={paymentsEnabled}
              onValueChange={setPaymentsEnabled}
              trackColor={{ false: '#334155', true: '#10B981' }}
              thumbColor={paymentsEnabled ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {/* Conditional Payment Methods List */}
          {paymentsEnabled && (
            <View className="space-y-2.5 mb-2">
              <Text className="text-slate-400 font-bold text-[11px] uppercase tracking-wider mb-1">
                Accepted Tenders:
              </Text>

              {/* Cash Toggle */}
              <View className="flex-row items-center justify-between p-3 bg-slate-950/60 border border-slate-850 rounded-xl">
                <View className="flex-row items-center flex-1 mr-2">
                  <Banknote size={16} color="#A78BFA" />
                  <View className="ml-2.5">
                    <Text className="text-white font-bold text-xs">Cash</Text>
                    <Text className="text-slate-400 text-[10px]">Currency with change calculator</Text>
                  </View>
                </View>
                <Switch
                  value={cashEnabled}
                  onValueChange={setCashEnabled}
                  trackColor={{ false: '#334155', true: '#5D3FD3' }}
                  thumbColor={cashEnabled ? '#FFFFFF' : '#94A3B8'}
                />
              </View>

              {/* UPI Toggle */}
              <View className="flex-row items-center justify-between p-3 bg-slate-950/60 border border-slate-850 rounded-xl">
                <View className="flex-row items-center flex-1 mr-2">
                  <Smartphone size={16} color="#34D399" />
                  <View className="ml-2.5">
                    <Text className="text-white font-bold text-xs">UPI / QR Code</Text>
                    <Text className="text-slate-400 text-[10px]">GPay, PhonePe, Paytm, BHIM</Text>
                  </View>
                </View>
                <Switch
                  value={upiEnabled}
                  onValueChange={setUpiEnabled}
                  trackColor={{ false: '#334155', true: '#5D3FD3' }}
                  thumbColor={upiEnabled ? '#FFFFFF' : '#94A3B8'}
                />
              </View>

              {/* Card Toggle */}
              <View className="flex-row items-center justify-between p-3 bg-slate-950/60 border border-slate-850 rounded-xl">
                <View className="flex-row items-center flex-1 mr-2">
                  <CreditCard size={16} color="#60A5FA" />
                  <View className="ml-2.5">
                    <Text className="text-white font-bold text-xs">Credit / Debit Card</Text>
                    <Text className="text-slate-400 text-[10px]">Counter swipe or tap machine</Text>
                  </View>
                </View>
                <Switch
                  value={cardEnabled}
                  onValueChange={setCardEnabled}
                  trackColor={{ false: '#334155', true: '#5D3FD3' }}
                  thumbColor={cardEnabled ? '#FFFFFF' : '#94A3B8'}
                />
              </View>

              {/* Custom Payment Methods */}
              <View className="p-3.5 bg-slate-950/60 border border-slate-850 rounded-xl mt-2">
                <Text className="text-white font-bold text-xs mb-1.5">Custom Payment Tenders</Text>
                
                {customMethods.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1.5 mb-2.5">
                    {customMethods.map((m, idx) => (
                      <View key={idx} className="bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg flex-row items-center">
                        <Text className="text-slate-200 text-xs font-semibold mr-1.5">{m}</Text>
                        <TouchableOpacity onPress={() => handleRemoveCustomMethod(m)}>
                          <Trash2 size={12} color="#F43F5E" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-slate-500 text-[11px] mb-2 italic">
                    Add tenders like Swiggy Dineout, Zomato Pay, Cheque, or Sodexo.
                  </Text>
                )}

                <View className="flex-row gap-2 items-center">
                  <TextInput
                    placeholder="e.g. Swiggy Dineout, Sodexo"
                    placeholderTextColor="#64748B"
                    value={newCustomMethodName}
                    onChangeText={setNewCustomMethodName}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs"
                  />
                  <TouchableOpacity
                    onPress={handleAddCustomMethod}
                    className="bg-[#5D3FD3] px-3.5 py-2.5 rounded-xl flex-row items-center active:opacity-80"
                  >
                    <Plus size={14} color="white" />
                    <Text className="text-white font-bold text-xs ml-1">Add</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Gated Split Payments Toggle */}
              <View className={`p-3.5 rounded-2xl border mt-2 ${
                canEnableSplit
                  ? 'bg-purple-950/20 border-purple-500/30'
                  : 'bg-slate-950/40 border-slate-800 opacity-60'
              }`}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <View className="flex-row items-center">
                      <Split size={16} color={canEnableSplit ? '#A78BFA' : '#64748B'} />
                      <Text className="text-white font-bold text-sm ml-2">Enable Split Payments</Text>
                    </View>
                    <Text className="text-slate-400 text-xs mt-0.5">
                      Allow splitting an order across multiple modes (e.g. part Cash, part UPI).
                    </Text>
                  </View>
                  <Switch
                    value={canEnableSplit ? splitPaymentsEnabled : false}
                    disabled={!canEnableSplit}
                    onValueChange={setSplitPaymentsEnabled}
                    trackColor={{ false: '#334155', true: '#5D3FD3' }}
                    thumbColor={canEnableSplit && splitPaymentsEnabled ? '#FFFFFF' : '#94A3B8'}
                  />
                </View>

                {!canEnableSplit && (
                  <View className="flex-row items-center mt-2.5 pt-2 border-t border-slate-800">
                    <AlertCircle size={12} color="#F59E0B" />
                    <Text className="text-amber-400 text-[11px] font-semibold ml-1.5">
                      Requires at least 2 active payment methods.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* 2. GST & TAX CONFIGURATION CARD (Clean Header, No Overflowing Pills) */}
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-5 shadow-sm">
          <View className="flex-row items-center mb-1">
            <Calculator size={18} color="#38BDF8" />
            <Text className="text-white font-black text-base ml-2">GST & Tax Rates</Text>
          </View>
          <Text className="text-slate-400 text-xs mb-4 leading-relaxed">
            Configure how GST is applied and printed on customer receipts.
          </Text>

          {/* Master GST Switch */}
          <View className="flex-row items-center justify-between p-3.5 bg-slate-950/90 border border-slate-800 rounded-2xl mb-4">
            <View className="flex-1 mr-3">
              <Text className="text-white font-bold text-sm">Enable GST on Bills</Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                {gstEnabled ? 'GST taxes are itemized and printed on thermal receipts.' : 'Bills show flat subtotal with no tax lines.'}
              </Text>
            </View>
            <Switch
              value={gstEnabled}
              onValueChange={setGstEnabled}
              trackColor={{ false: '#334155', true: '#0284C7' }}
              thumbColor={gstEnabled ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {gstEnabled && (
            <View>
              {/* Inclusive vs Exclusive Segmented Selector (Clean Single-Line Text) */}
              <Text className="text-slate-400 font-bold text-[11px] uppercase tracking-wider mb-2">
                GST Pricing Model:
              </Text>
              <View className="flex-row bg-slate-950 p-1 rounded-2xl mb-2.5 border border-slate-800">
                <TouchableOpacity
                  onPress={() => setGstType('INCLUSIVE')}
                  className={`flex-1 py-2 rounded-xl items-center ${
                    gstType === 'INCLUSIVE' ? 'bg-sky-600 shadow-sm' : 'bg-transparent'
                  }`}
                >
                  <Text className={`text-xs font-black ${gstType === 'INCLUSIVE' ? 'text-white' : 'text-slate-400'}`}>
                    Inclusive (In Menu Price)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setGstType('EXCLUSIVE')}
                  className={`flex-1 py-2 rounded-xl items-center ${
                    gstType === 'EXCLUSIVE' ? 'bg-sky-600 shadow-sm' : 'bg-transparent'
                  }`}
                >
                  <Text className={`text-xs font-black ${gstType === 'EXCLUSIVE' ? 'text-white' : 'text-slate-400'}`}>
                    Exclusive (+ Added on Top)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Mode Description Note */}
              <View className="bg-slate-950/70 p-3 rounded-xl border border-slate-850 mb-4">
                <Text className="text-slate-300 text-xs leading-relaxed">
                  {gstType === 'INCLUSIVE'
                    ? '💡 Inclusive: Item prices include GST. ₹1000 order remains ₹1000, and bill itemizes Base Subtotal (₹952.38) + Tax (₹47.62).'
                    : '💡 Exclusive: GST is charged on top at checkout. ₹1000 order has 5% GST added, making Grand Total ₹1050.'}
                </Text>
              </View>

              {/* Quick Standard Presets */}
              <Text className="text-slate-400 font-bold text-[11px] uppercase tracking-wider mb-2">
                Quick GST Presets:
              </Text>
              <View className="flex-row gap-2 mb-4">
                {[
                  { label: '0% (Exempt)', total: 0 },
                  { label: '5% (Food)', total: 5 },
                  { label: '12% (AC/Bar)', total: 12 },
                  { label: '18%', total: 18 }
                ].map(preset => {
                  const isMatch = Math.abs(currentTotalGst - preset.total) < 0.05;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      onPress={() => applyGstPreset(preset.total)}
                      className={`flex-1 py-2 rounded-xl border items-center justify-center ${
                        isMatch
                          ? 'bg-sky-500/20 border-sky-400'
                          : 'bg-slate-950/80 border-slate-800'
                      }`}
                    >
                      <Text className={`text-[11px] font-black ${isMatch ? 'text-sky-300' : 'text-slate-400'}`}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* CGST and SGST Rate Inputs */}
              <View className="flex-row gap-3 mb-3">
                <View className="flex-1 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                  <Text className="text-slate-300 font-bold text-xs mb-1">CGST Rate (%)</Text>
                  <TextInput
                    placeholder="2.5"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={cgstRate}
                    onChangeText={setCgstRate}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-sm"
                  />
                </View>

                <View className="flex-1 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                  <Text className="text-slate-300 font-bold text-xs mb-1">SGST Rate (%)</Text>
                  <TextInput
                    placeholder="2.5"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={sgstRate}
                    onChangeText={setSgstRate}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-sm"
                  />
                </View>
              </View>

              {/* Clean Total GST Indicator */}
              <View className="bg-sky-950/30 border border-sky-500/30 p-3 rounded-2xl flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <CheckCircle2 size={14} color="#38BDF8" />
                  <Text className="text-slate-300 text-xs font-semibold ml-2">Total Applied GST Rate:</Text>
                </View>
                <Text className="text-sky-300 font-black text-sm">
                  {currentTotalGst.toFixed(2)}% ({gstType})
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* 3. ORDERING MODES CARD (Clean Header, No Overflowing Pills) */}
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-5 shadow-sm">
          <View className="flex-row items-center mb-1">
            <Utensils size={18} color="#818CF8" />
            <Text className="text-white font-black text-base ml-2">Operating Order Modes</Text>
          </View>
          <Text className="text-slate-400 text-xs mb-4 leading-relaxed">
            Enable or disable floor tables and counter takeaway modes.
          </Text>

          {/* Toggle 1: Enable Dine-In Tables */}
          <View className="flex-row items-center justify-between p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl mb-3">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center">
                <LayoutGrid size={16} color="#10B981" />
                <Text className="text-white font-bold text-sm ml-2">Enable Dine-In Tables</Text>
              </View>
              <Text className="text-slate-400 text-xs mt-0.5">
                Floor plan, table seating layouts, and dine-in KOT orders.
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
              <Text className="text-slate-400 text-xs mt-0.5">
                Takeaway parcels and fast counter orders without table assignment.
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

        {/* 4. BUSINESS & RECEIPT DETAILS CARD */}
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-6 shadow-sm">
          <View className="flex-row items-center mb-1">
            <Building size={18} color="#C084FC" />
            <Text className="text-white font-black text-base ml-2">Receipt & Business Details</Text>
          </View>
          <Text className="text-slate-400 text-xs mb-4 leading-relaxed">
            Printed on customer bills and shown on POS headers.
          </Text>

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
          title="Save Store & Payment Settings"
          onPress={handleSave}
          isLoading={isSaving}
          size="lg"
          className="mb-8"
        />
      </ScrollView>
    </SafeAreaView>
  );
};
