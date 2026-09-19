import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/common/Header';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { usePrinterStore } from '../../store/printer.store';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { PrinterWorkflowMode } from '../../types/printer.types';
import { Printer, CheckCircle2, AlertTriangle, Utensils, Coffee, ShoppingBag } from 'lucide-react-native';

export const PrinterSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const { settings, setSettings } = usePrinterStore();

  const [workflowMode, setWorkflowMode] = useState<PrinterWorkflowMode>(
    settings.printerWorkflowMode || 'RESTAURANT'
  );
  const [ipAddress, setIpAddress] = useState(settings.ipAddress || '');
  const [port, setPort] = useState(settings.port?.toString() || '9100');
  const [kitchenIpAddress, setKitchenIpAddress] = useState(settings.kitchenIpAddress || '');
  const [kitchenPort, setKitchenPort] = useState(settings.kitchenPort?.toString() || '9100');

  // Synchronize state when settings hydrate from persistent storage
  useEffect(() => {
    if (settings) {
      if (settings.ipAddress !== undefined) setIpAddress(settings.ipAddress);
      if (settings.port) setPort(settings.port.toString());
      if (settings.kitchenIpAddress !== undefined) setKitchenIpAddress(settings.kitchenIpAddress);
      if (settings.kitchenPort) setKitchenPort(settings.kitchenPort.toString());
      if (settings.printerWorkflowMode) setWorkflowMode(settings.printerWorkflowMode);
    }
  }, [settings]);

  const [isTestingBilling, setIsTestingBilling] = useState(false);
  const [isTestingKitchen, setIsTestingKitchen] = useState(false);
  const [isTestingTiffin, setIsTestingTiffin] = useState(false);
  const [testResult, setTestResult] = useState<{ type: string; success: boolean; message: string } | null>(null);

  const handleSave = () => {
    const cleanIp = ipAddress.trim();
    if (!cleanIp) {
      Alert.alert('Configuration Error', 'Please enter a valid Billing Printer IP Address.');
      return;
    }

    setSettings({
      ...settings,
      printerWorkflowMode: workflowMode,
      ipAddress: cleanIp,
      port: parseInt(port, 10) || 9100,
      kitchenIpAddress: kitchenIpAddress.trim(),
      kitchenPort: parseInt(kitchenPort, 10) || 9100,
    });

    Alert.alert('Settings Saved', 'Thermal printer configuration has been saved successfully.');
  };

  const testBillingPrinter = async () => {
    const targetIp = ipAddress.trim();
    const targetPort = parseInt(port, 10) || 9100;
    if (!targetIp) {
      Alert.alert('IP Required', 'Please enter a valid IP address for the Billing Printer.');
      return;
    }

    setIsTestingBilling(true);
    setTestResult(null);
    try {
      await printerService.connect(targetIp, targetPort);
      const buffer = ESCPOSService.buildBill(
        'TEST-01',
        1,
        'POS Admin',
        [{ itemName: 'BILLING PRINTER TEST', price: 100, qty: 1 }],
        { businessName: 'PRINTER TEST VERIFICATION', displayName: 'PRINTER TEST', receiptHeader: 'PRINTER TEST VERIFICATION', address: 'Local POS LAN', phone: '0000000000', gstin: 'TEST-GSTIN' } as any,
        'DINE_IN',
        [{ method: 'CASH', amount: 100 }]
      );
      await printerService.print(buffer);
      await printerService.disconnect();
      setTestResult({
        type: 'billing',
        success: true,
        message: `Billing printer at ${targetIp}:${targetPort} printed test slip successfully!`
      });
    } catch (e: any) {
      setTestResult({
        type: 'billing',
        success: false,
        message: `Connection failed to Billing printer at ${targetIp}:${targetPort} (${e.message})`
      });
    } finally {
      setIsTestingBilling(false);
    }
  };

  const testKitchenPrinter = async () => {
    const targetIp = (kitchenIpAddress || ipAddress).trim();
    const targetPort = parseInt(kitchenPort || port, 10) || 9100;
    if (!targetIp) {
      Alert.alert('IP Required', 'Please enter a valid IP address for the Kitchen KOT Printer.');
      return;
    }

    setIsTestingKitchen(true);
    setTestResult(null);
    try {
      await printerService.connect(targetIp, targetPort);
      const buffer = ESCPOSService.buildKOT(
        'KOT-TEST',
        0,
        'POS Admin',
        [{ itemName: 'KITCHEN KOT TEST SLIP', qty: 1, note: 'HOT KITCHEN KOT' }],
        'Kitchen Printer Online & Verified!',
        'DINE_IN'
      );
      await printerService.print(buffer);
      await printerService.disconnect();
      setTestResult({
        type: 'kitchen',
        success: true,
        message: `Kitchen KOT printer at ${targetIp}:${targetPort} printed test ticket successfully!`
      });
    } catch (e: any) {
      setTestResult({
        type: 'kitchen',
        success: false,
        message: `Connection failed to Kitchen printer at ${targetIp}:${targetPort} (${e.message})`
      });
    } finally {
      setIsTestingKitchen(false);
    }
  };

  const testTiffinTwoPrints = async () => {
    const targetIp = ipAddress.trim();
    const targetPort = parseInt(port, 10) || 9100;
    if (!targetIp) {
      Alert.alert('IP Required', 'Please enter a valid IP address for the Counter Printer.');
      return;
    }

    setIsTestingTiffin(true);
    setTestResult(null);
    try {
      await printerService.connect(targetIp, targetPort);
      const buffer = ESCPOSService.buildCombinedTiffinPrints(
        'TIFFIN-01',
        0,
        'POS Admin',
        [
          { itemName: 'Masala Dosa', price: 60, qty: 2 },
          { itemName: 'Filter Coffee', price: 20, qty: 1 }
        ],
        { businessName: 'TIFFIN CENTER TEST', displayName: 'TIFFIN TEST', receiptHeader: 'TIFFIN CENTER TEST', address: 'Counter 1', phone: '0000000000' } as any,
        'COUNTER',
        [{ method: 'UPI', amount: 140 }]
      );
      await printerService.print(buffer);
      await printerService.disconnect();
      setTestResult({
        type: 'tiffin',
        success: true,
        message: `Tiffin Mode 2-Print test successful! (Printed Customer Bill, cut, then printed Kitchen Copy).`
      });
    } catch (e: any) {
      setTestResult({
        type: 'tiffin',
        success: false,
        message: `Tiffin test failed on ${targetIp}:${targetPort} (${e.message})`
      });
    } finally {
      setIsTestingTiffin(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header title="Thermal Printers" subtitle="Print Workflow Modes & RAW ESC/POS Setup" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom + 40, 60),
          maxWidth: 800,
          alignSelf: "center",
          width: "100%"
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Test Result Live Banner */}
        {testResult && (
          <View className={`p-3.5 rounded-2xl mb-4 border flex-row items-center justify-between ${
            testResult.success
              ? 'bg-emerald-500/15 border-emerald-500/30'
              : 'bg-rose-500/15 border-rose-500/30'
          }`}>
            <View className="flex-row items-center flex-1 mr-2">
              {testResult.success ? (
                <CheckCircle2 size={18} color="#34D399" />
              ) : (
                <AlertTriangle size={18} color="#FB7185" />
              )}
              <Text className={`text-xs font-bold ml-2 ${
                testResult.success ? 'text-emerald-300' : 'text-rose-300'
              }`}>
                {testResult.message}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setTestResult(null)}>
              <Text className="text-slate-400 text-xs font-bold">Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 1. PRINTER WORKFLOW MODE SELECTOR (3 WAYS) */}
        <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
          <Text className="text-white font-black text-base mb-1">Select Print Workflow Mode</Text>
          <Text className="text-slate-400 text-xs mb-4">
            Choose how receipts and kitchen tickets should be routed in your business:
          </Text>

          <View className="gap-3">
            {/* Mode 1: Restaurant */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setWorkflowMode('RESTAURANT')}
              className={`p-4 rounded-2xl border flex-row items-start ${
                workflowMode === 'RESTAURANT'
                  ? 'bg-indigo-500/15 border-indigo-500 shadow-md shadow-indigo-500/20'
                  : 'bg-slate-850/70 border-slate-800'
              }`}
            >
              <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 mt-0.5 ${
                workflowMode === 'RESTAURANT' ? 'bg-[#5D3FD3]' : 'bg-slate-800'
              }`}>
                <Utensils size={20} color="white" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-white font-bold text-sm">1. Restaurant Mode</Text>
                  {workflowMode === 'RESTAURANT' && (
                    <View className="bg-[#5D3FD3] px-2 py-0.5 rounded-full">
                      <Text className="text-white text-[10px] font-bold">Active</Text>
                    </View>
                  )}
                </View>
                <Text className="text-slate-400 text-xs mt-1 leading-4">
                  Dual Printers: Main counter printer for Customer Bill + Dedicated Kitchen printer for KOT tickets.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Mode 2: Curry Point */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setWorkflowMode('CURRY_POINT')}
              className={`p-4 rounded-2xl border flex-row items-start ${
                workflowMode === 'CURRY_POINT'
                  ? 'bg-amber-500/15 border-amber-500 shadow-md shadow-amber-500/20'
                  : 'bg-slate-850/70 border-slate-800'
              }`}
            >
              <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 mt-0.5 ${
                workflowMode === 'CURRY_POINT' ? 'bg-amber-600' : 'bg-slate-800'
              }`}>
                <ShoppingBag size={20} color="white" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-white font-bold text-sm">2. Curry Point Mode</Text>
                  {workflowMode === 'CURRY_POINT' && (
                    <View className="bg-amber-500 px-2 py-0.5 rounded-full">
                      <Text className="text-slate-900 text-[10px] font-black">Active</Text>
                    </View>
                  )}
                </View>
                <Text className="text-slate-400 text-xs mt-1 leading-4">
                  Single Printer: Main counter printer only. Prints Customer Bill at payment; no kitchen copy.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Mode 3: Tiffin Center */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setWorkflowMode('TIFFIN_CENTER')}
              className={`p-4 rounded-2xl border flex-row items-start ${
                workflowMode === 'TIFFIN_CENTER'
                  ? 'bg-emerald-500/15 border-emerald-500 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-850/70 border-slate-800'
              }`}
            >
              <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 mt-0.5 ${
                workflowMode === 'TIFFIN_CENTER' ? 'bg-emerald-600' : 'bg-slate-800'
              }`}>
                <Coffee size={20} color="white" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-white font-bold text-sm">3. Tiffin Center Mode</Text>
                  {workflowMode === 'TIFFIN_CENTER' && (
                    <View className="bg-emerald-500 px-2 py-0.5 rounded-full">
                      <Text className="text-slate-900 text-[10px] font-black">Active</Text>
                    </View>
                  )}
                </View>
                <Text className="text-slate-400 text-xs mt-1 leading-4">
                  1 Printer, 2 Prints: Prints Customer Bill, cuts paper, then prints a compact Kitchen Copy with Bill # and items for preparation counter.
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Main Counter Thermal Printer (Used by all modes) */}
        <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
          <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <View className="flex-row items-center">
              <Printer size={18} color="#818CF8" />
              <Text className="text-white font-black text-base ml-2">
                {workflowMode === 'RESTAURANT' ? 'Billing Counter Printer' : 'Main Counter Printer (Single)'}
              </Text>
            </View>
          </View>

          <Input
            label="IP Address"
            placeholder="e.g. 192.168.1.50"
            value={ipAddress}
            onChangeText={setIpAddress}
            keyboardType="numeric"
          />
          <Input
            label="Port (Standard: 9100)"
            placeholder="9100"
            value={port}
            onChangeText={setPort}
            keyboardType="numeric"
          />

          <Button
            title="Test Counter Printer"
            variant="secondary"
            onPress={testBillingPrinter}
            isLoading={isTestingBilling}
            size="sm"
            className="mt-1"
          />
        </View>

        {/* 3. Kitchen Thermal KOT Printer (Only visible when RESTAURANT mode is active) */}
        {workflowMode === 'RESTAURANT' && (
          <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
            <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <View className="flex-row items-center">
                <Printer size={18} color="#F59E0B" />
                <Text className="text-white font-black text-base ml-2">Kitchen Thermal KOT Printer</Text>
              </View>
            </View>

            <Input
              label="Kitchen IP Address"
              placeholder="e.g. 192.168.1.51"
              value={kitchenIpAddress}
              onChangeText={setKitchenIpAddress}
              keyboardType="numeric"
            />
            <Input
              label="Port (Standard: 9100)"
              placeholder="9100"
              value={kitchenPort}
              onChangeText={setKitchenPort}
              keyboardType="numeric"
            />

            <Button
              title="Test Kitchen KOT Printer"
              variant="secondary"
              onPress={testKitchenPrinter}
              isLoading={isTestingKitchen}
              size="sm"
              className="mt-1"
            />
          </View>
        )}

        {/* Save Settings Button */}
        <Button
          title="Save Printer Settings"
          onPress={handleSave}
          size="lg"
          className="mb-6"
        />

        {/* 4. Live Diagnostics Console */}
        <View className="bg-slate-900/90 border border-indigo-500/30 p-5 rounded-3xl shadow-lg">
          <Text className="text-white font-black text-sm mb-1">Live Thermal Printer Diagnostics</Text>
          <Text className="text-slate-400 text-xs mb-4">
            Test print dispatch matching your active profile ({workflowMode}):
          </Text>

          {workflowMode === 'RESTAURANT' && (
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={testBillingPrinter}
                disabled={isTestingBilling}
                className="flex-1 bg-indigo-600/20 border border-indigo-500/40 p-3 rounded-2xl items-center justify-center"
              >
                {isTestingBilling ? (
                  <ActivityIndicator size="small" color="#818CF8" />
                ) : (
                  <>
                    <Printer size={16} color="#818CF8" />
                    <Text className="text-indigo-300 font-bold text-xs mt-1">Test Billing</Text>
                    <Text className="text-slate-400 text-[10px] mt-0.5">{ipAddress || 'Not set'}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={testKitchenPrinter}
                disabled={isTestingKitchen}
                className="flex-1 bg-amber-600/20 border border-amber-500/40 p-3 rounded-2xl items-center justify-center"
              >
                {isTestingKitchen ? (
                  <ActivityIndicator size="small" color="#F59E0B" />
                ) : (
                  <>
                    <Printer size={16} color="#F59E0B" />
                    <Text className="text-amber-300 font-bold text-xs mt-1">Test Kitchen</Text>
                    <Text className="text-slate-400 text-[10px] mt-0.5">{kitchenIpAddress || 'Not set'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {workflowMode === 'CURRY_POINT' && (
            <TouchableOpacity
              onPress={testBillingPrinter}
              disabled={isTestingBilling}
              className="w-full bg-amber-600/20 border border-amber-500/40 p-3.5 rounded-2xl items-center justify-center"
            >
              {isTestingBilling ? (
                <ActivityIndicator size="small" color="#F59E0B" />
              ) : (
                <>
                  <Printer size={16} color="#F59E0B" />
                  <Text className="text-amber-300 font-bold text-xs mt-1">Test Counter Bill Print</Text>
                  <Text className="text-slate-400 text-[10px] mt-0.5">{ipAddress}:{port}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {workflowMode === 'TIFFIN_CENTER' && (
            <TouchableOpacity
              onPress={testTiffinTwoPrints}
              disabled={isTestingTiffin}
              className="w-full bg-emerald-600/20 border border-emerald-500/40 p-3.5 rounded-2xl items-center justify-center"
            >
              {isTestingTiffin ? (
                <ActivityIndicator size="small" color="#34D399" />
              ) : (
                <>
                  <Coffee size={16} color="#34D399" />
                  <Text className="text-emerald-300 font-bold text-xs mt-1">Test 2-Print Slip (Bill + Kitchen Token)</Text>
                  <Text className="text-slate-400 text-[10px] mt-0.5">{ipAddress}:{port}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
