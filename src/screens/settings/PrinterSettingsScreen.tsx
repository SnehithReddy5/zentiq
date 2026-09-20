import { toast } from '../../utils/toast';
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/common/Header';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { usePrinterStore } from '../../store/printer.store';
import { useTenantStore } from '../../store/tenant.store';
import { useToastStore } from '../../store/toast.store';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { PrinterWorkflowMode } from '../../types/printer.types';
import { Printer, CheckCircle2, AlertTriangle, Utensils, Coffee, ShoppingBag, Usb, Wifi, RefreshCw } from 'lucide-react-native';

export const PrinterSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const { settings, setSettings } = usePrinterStore();

  const [paperWidth, setPaperWidth] = useState<'80mm_48' | '80mm_42' | '58mm_32'>(settings.paperWidth || '80mm_48');
  const [workflowMode, setWorkflowMode] = useState<PrinterWorkflowMode>(
    settings.printerWorkflowMode || 'DUAL_PRINTER'
  );

  // Counter / Billing Printer State
  const [printerType, setPrinterType] = useState<'LAN' | 'USB' | 'Bluetooth'>((settings.printerType as any) || 'LAN');
  const [printerName, setPrinterName] = useState(settings.printerName || '');
  const [ipAddress, setIpAddress] = useState(settings.ipAddress || '');
  const [port, setPort] = useState(settings.port?.toString() || '9100');

  // Kitchen KOT Printer State (Used in Dual Printer Mode)
  const [kitchenPrinterType, setKitchenPrinterType] = useState<'LAN' | 'USB'>((settings.kitchenPrinterType as any) || 'LAN');
  const [kitchenPrinterName, setKitchenPrinterName] = useState(settings.kitchenPrinterName || '');
  const [kitchenIpAddress, setKitchenIpAddress] = useState(settings.kitchenIpAddress || '');
  const [kitchenPort, setKitchenPort] = useState(settings.kitchenPort?.toString() || '9100');

  // Windows Detected USB Printers
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);

  // Mode helpers
  const isDualMode = workflowMode === 'DUAL_PRINTER' || workflowMode === 'RESTAURANT';
  const isCombinedMode = workflowMode === 'SINGLE_COMBINED' || workflowMode === 'TIFFIN_CENTER';
  const isSingleBillMode = workflowMode === 'SINGLE_BILL_ONLY' || workflowMode === 'CURRY_POINT';

  // Synchronize state when settings hydrate from persistent storage
  const refreshWindowsPrinters = async () => {
    setIsLoadingPrinters(true);
    try {
      const list = await (printerService as any).getInstalledPrinters?.();
      if (Array.isArray(list) && list.length > 0) {
        setDetectedPrinters(list);
        if (!printerName) {
          const thermal = list.find((p: string) => /pos|receipt|thermal|epson|tvs|rp|gobbler|58|80/i.test(p));
          if (thermal) setPrinterName(thermal);
        }
      }
    } catch (_) {}
    setIsLoadingPrinters(false);
  };

  useEffect(() => {
    refreshWindowsPrinters();
  }, []);

  useEffect(() => {
    if (settings) {
      if (settings.printerType) setPrinterType(settings.printerType);
      if (settings.printerName) setPrinterName(settings.printerName);
      if (settings.ipAddress !== undefined) setIpAddress(settings.ipAddress);
      if (settings.port) setPort(settings.port.toString());
      if (settings.kitchenPrinterType) setKitchenPrinterType(settings.kitchenPrinterType);
      if (settings.kitchenPrinterName) setKitchenPrinterName(settings.kitchenPrinterName);
      if (settings.kitchenIpAddress !== undefined) setKitchenIpAddress(settings.kitchenIpAddress);
      if (settings.kitchenPort) setKitchenPort(settings.kitchenPort.toString());
      if (settings.printerWorkflowMode) setWorkflowMode(settings.printerWorkflowMode);
      if (settings.paperWidth) setPaperWidth(settings.paperWidth);
    }
  }, [settings]);

  const [isTestingBilling, setIsTestingBilling] = useState(false);
  const [isTestingKitchen, setIsTestingKitchen] = useState(false);
  const [isTestingTiffin, setIsTestingTiffin] = useState(false);
  const [testResult, setTestResult] = useState<{ type: string; success: boolean; message: string } | null>(null);

  const handleSave = async () => {
    const cleanIp = ipAddress.trim();
    const cleanName = printerName.trim();
    const cleanKitchenIp = kitchenIpAddress.trim();
    const cleanKitchenName = kitchenPrinterName.trim();

    if (printerType === 'LAN' && !cleanIp) {
      toast.error('Please enter a valid Billing Counter Printer IP Address.', 'Configuration Error');
      return;
    }
    if (printerType === 'USB' && !cleanName) {
      toast.error('Please select or enter your Counter USB Thermal Printer Name.', 'Configuration Error');
      return;
    }

    if (isDualMode) {
      if (kitchenPrinterType === 'LAN' && !cleanKitchenIp) {
        toast.warning('Kitchen IP is empty. Please enter Kitchen Printer IP (or select USB).', 'Kitchen IP Recommended');
      }
      if (kitchenPrinterType === 'USB' && !cleanKitchenName) {
        toast.error('Please select or enter your Kitchen USB Printer Name.', 'Configuration Error');
        return;
      }
    }

    const newSettings = {
      ...settings,
      printerType,
      printerName: cleanName,
      printerWorkflowMode: workflowMode,
      paperWidth,
      ipAddress: cleanIp,
      port: parseInt(port, 10) || 9100,
      kitchenPrinterType,
      kitchenPrinterName: cleanKitchenName,
      kitchenIpAddress: cleanKitchenIp,
      kitchenPort: parseInt(kitchenPort, 10) || 9100,
    };

    setSettings(newSettings);

    // Save to Cloud Firestore so settings survive app reinstallation
    const { tenant, activeLocationId } = useTenantStore.getState();
    if (tenant?.id) {
      await usePrinterStore.getState().saveSettingsToCloud(tenant.id, activeLocationId);
    }

    useToastStore.getState().showToast({
      type: 'success',
      title: 'Printer Settings Saved',
      message: isDualMode
        ? 'Dual Printer configured (Counter Bill + Kitchen KOT).'
        : 'Single Printer configured successfully.',
      duration: 3500,
    });
    toast.success('Thermal printer configuration has been saved and synced.', 'Settings Saved');
  };

  const testBillingPrinter = async () => {
    const isUsb = printerType === 'USB';
    const cleanName = printerName.trim();
    const targetIp = ipAddress.trim();
    const targetPort = parseInt(port, 10) || 9100;

    if (isUsb && !cleanName) {
      toast.warning('Please select or enter your Counter USB Printer Name first.', 'Printer Name Required');
      return;
    }
    if (!isUsb && !targetIp) {
      toast.warning('Please enter a valid IP address for the Counter Printer.', 'IP Required');
      return;
    }

    setIsTestingBilling(true);
    setTestResult(null);
    try {
      if (isUsb) {
        await printerService.connect(cleanName, 0, 'USB');
      } else {
        await printerService.connect(targetIp, targetPort, 'LAN');
      }

      const buffer = ESCPOSService.buildBill(
        'TEST-01',
        1,
        'POS Admin',
        [{ itemName: isUsb ? 'USB COUNTER TEST' : 'LAN COUNTER TEST', price: 100, qty: 1 }],
        { businessName: 'COUNTER PRINTER TEST', displayName: 'COUNTER TEST', receiptHeader: 'COUNTER BILL VERIFICATION', address: isUsb ? 'Windows USB Cable' : 'Local LAN', phone: '0000000000', gstin: 'TEST-GSTIN' } as any,
        'DINE_IN',
        [{ method: 'CASH', amount: 100 }]
      );

      await printerService.print(buffer, isUsb ? { printerType: 'USB', printerName: cleanName } : { printerType: 'LAN', ip: targetIp, port: targetPort });
      await printerService.disconnect();

      setTestResult({
        type: 'billing',
        success: true,
        message: isUsb
          ? `Counter USB printer "${cleanName}" printed test receipt successfully!`
          : `Counter printer at ${targetIp}:${targetPort} printed test slip successfully!`
      });
      toast.success(
        isUsb ? `Counter USB printer "${cleanName}" printed!` : `Counter printer at ${targetIp}:${targetPort} printed!`,
        'Counter Print Success'
      );
    } catch (e: any) {
      setTestResult({
        type: 'billing',
        success: false,
        message: isUsb
          ? `Failed printing to Counter USB printer "${cleanName}": ${e.message}`
          : `Connection failed to Counter printer at ${targetIp}:${targetPort} (${e.message})`
      });
      toast.error(e.message, 'Counter Print Failed');
    } finally {
      setIsTestingBilling(false);
    }
  };

  const testKitchenPrinter = async () => {
    const isKitchenUsb = kitchenPrinterType === 'USB';
    const cleanKitchenName = kitchenPrinterName.trim();
    const targetIp = (kitchenIpAddress || ipAddress).trim();
    const targetPort = parseInt(kitchenPort || port, 10) || 9100;

    if (isKitchenUsb && !cleanKitchenName) {
      toast.warning('Please select or enter your Kitchen USB Printer Name first.', 'Printer Name Required');
      return;
    }
    if (!isKitchenUsb && !targetIp) {
      toast.warning('Please enter a valid IP address for the Kitchen KOT Printer.', 'IP Required');
      return;
    }

    setIsTestingKitchen(true);
    setTestResult(null);
    try {
      if (isKitchenUsb) {
        await printerService.connect(cleanKitchenName, 0, 'USB');
      } else {
        await printerService.connect(targetIp, targetPort, 'LAN');
      }

      const buffer = ESCPOSService.buildKOT(
        'KOT-TEST',
        0,
        'POS Admin',
        [{ itemName: 'KITCHEN KOT TEST SLIP', qty: 1, note: isKitchenUsb ? 'KITCHEN USB PRINTER' : 'KITCHEN LAN PRINTER' }],
        'Kitchen Printer Online & Verified!',
        'DINE_IN'
      );

      await printerService.print(
        buffer,
        isKitchenUsb
          ? { printerType: 'USB', printerName: cleanKitchenName }
          : { printerType: 'LAN', ip: targetIp, port: targetPort }
      );
      await printerService.disconnect();

      setTestResult({
        type: 'kitchen',
        success: true,
        message: isKitchenUsb
          ? `Kitchen USB printer "${cleanKitchenName}" printed test ticket successfully!`
          : `Kitchen KOT printer at ${targetIp}:${targetPort} printed test ticket successfully!`
      });
      toast.success(
        isKitchenUsb
          ? `Kitchen USB printer "${cleanKitchenName}" printed!`
          : `Kitchen KOT printer at ${targetIp}:${targetPort} printed!`,
        'Kitchen Print Success'
      );
    } catch (e: any) {
      setTestResult({
        type: 'kitchen',
        success: false,
        message: isKitchenUsb
          ? `Failed printing to Kitchen USB printer "${cleanKitchenName}": ${e.message}`
          : `Connection failed to Kitchen printer at ${targetIp}:${targetPort} (${e.message})`
      });
      toast.error(e.message, 'Kitchen Print Failed');
    } finally {
      setIsTestingKitchen(false);
    }
  };

  const testTiffinTwoPrints = async () => {
    const isUsb = printerType === 'USB';
    const cleanName = printerName.trim();
    const targetIp = ipAddress.trim();
    const targetPort = parseInt(port, 10) || 9100;

    if (isUsb && !cleanName) {
      toast.warning('Please select or enter your USB Printer Name first.', 'Printer Name Required');
      return;
    }
    if (!isUsb && !targetIp) {
      toast.warning('Please enter a valid IP address for the Printer.', 'IP Required');
      return;
    }

    setIsTestingTiffin(true);
    setTestResult(null);
    try {
      if (isUsb) {
        await printerService.connect(cleanName, 0, 'USB');
      } else {
        await printerService.connect(targetIp, targetPort, 'LAN');
      }

      const combinedBuffer = ESCPOSService.buildCombinedTiffinPrints(
        'TIF-101',
        0,
        'Cashier',
        [
          { itemName: 'Idli (2 Pcs)', price: 40, qty: 2 },
          { itemName: 'Masala Dosa', price: 60, qty: 1 }
        ],
        { businessName: 'VASUDHA TIFFIN CENTER', displayName: 'VASUDHA', receiptHeader: 'QUICK SERVICE TOKEN', address: 'Main Road', phone: '9876543210' } as any,
        'PICKUP',
        [{ method: 'CASH', amount: 140 }]
      );

      await printerService.print(
        combinedBuffer,
        isUsb ? { printerType: 'USB', printerName: cleanName } : { printerType: 'LAN', ip: targetIp, port: targetPort }
      );
      await printerService.disconnect();

      setTestResult({
        type: 'tiffin',
        success: true,
        message: `Combined 2-Print test successful! (Customer Bill + Kitchen Slip printed together).`
      });
      toast.success('Printed Customer Bill + Kitchen Slip sequentially!', 'Combined Test Passed');
    } catch (e: any) {
      setTestResult({
        type: 'tiffin',
        success: false,
        message: `Combined print test failed: ${e.message}`
      });
      toast.error(e.message, 'Print Failed');
    } finally {
      setIsTestingTiffin(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Thermal Printers & Workflow"
        subtitle="Configure Cash Counter Bill & Kitchen KOT Printers"
      />

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom + 48, 64),
          maxWidth: 900,
          alignSelf: 'center',
          width: '100%',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Test Result Alert Banner */}
        {testResult && (
          <View
            className={`p-4 rounded-2xl mb-4 border flex-row items-center ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-rose-500/10 border-rose-500/30'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 size={20} color="#10B981" />
            ) : (
              <AlertTriangle size={20} color="#F43F5E" />
            )}
            <View className="ml-3 flex-1">
              <Text
                className={`font-black text-xs uppercase ${
                  testResult.success ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {testResult.success ? 'Print Job Dispatched' : 'Printer Error'}
              </Text>
              <Text className="text-white text-xs mt-0.5">{testResult.message}</Text>
            </View>
          </View>
        )}

        {/* 1. Workflow Operational Mode */}
        <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
          <View className="flex-row items-center mb-1">
            <Utensils size={18} color="#A78BFA" />
            <Text className="text-white font-black text-base ml-2">Printing Operational Mode</Text>
          </View>
          <Text className="text-slate-400 text-xs mb-4">
            Choose how customer receipts and kitchen tickets should be routed:
          </Text>

          {/* Mode 1: Dual Printer */}
          <TouchableOpacity
            onPress={() => setWorkflowMode('DUAL_PRINTER')}
            className={`p-4 rounded-2xl border mb-3 ${
              isDualMode
                ? 'bg-purple-900/20 border-purple-500/60'
                : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-row items-center">
                <View className={`w-3 h-3 rounded-full mr-2 ${isDualMode ? 'bg-[#5D3FD3]' : 'bg-slate-800'}`} />
                <Text className="text-white font-bold text-sm">1. Dual Printer (Counter Bill + Kitchen KOT)</Text>
              </View>
              {isDualMode && (
                <View className="bg-purple-500/20 px-2.5 py-0.5 rounded-full border border-purple-500/30">
                  <Text className="text-purple-300 font-bold text-[10px]">ACTIVE</Text>
                </View>
              )}
            </View>
            <Text className="text-slate-400 text-xs ml-5 leading-relaxed">
              Cash counter prints Customer Bill upon settlement. Separate Kitchen printer receives KOT tickets via <Text className="text-purple-300 font-bold">"Send KOT"</Text> button.
            </Text>
          </TouchableOpacity>

          {/* Mode 2: Single Combined */}
          <TouchableOpacity
            onPress={() => setWorkflowMode('SINGLE_COMBINED')}
            className={`p-4 rounded-2xl border mb-3 ${
              isCombinedMode
                ? 'bg-emerald-950/30 border-emerald-500/60'
                : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-row items-center">
                <View className={`w-3 h-3 rounded-full mr-2 ${isCombinedMode ? 'bg-emerald-600' : 'bg-slate-800'}`} />
                <Text className="text-white font-bold text-sm">2. Single Printer (Bill + Kitchen Slip Together)</Text>
              </View>
              {isCombinedMode && (
                <View className="bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  <Text className="text-emerald-300 font-bold text-[10px]">ACTIVE</Text>
                </View>
              )}
            </View>
            <Text className="text-slate-400 text-xs ml-5 leading-relaxed">
              1 printer prints Customer Bill and Kitchen Slip one after the other on payment. <Text className="text-slate-300 font-semibold">"Send KOT" button is hidden.</Text>
            </Text>
          </TouchableOpacity>

          {/* Mode 3: Single Bill Only */}
          <TouchableOpacity
            onPress={() => setWorkflowMode('SINGLE_BILL_ONLY')}
            className={`p-4 rounded-2xl border ${
              isSingleBillMode
                ? 'bg-amber-950/30 border-amber-500/60'
                : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-row items-center">
                <View className={`w-3 h-3 rounded-full mr-2 ${isSingleBillMode ? 'bg-amber-600' : 'bg-slate-800'}`} />
                <Text className="text-white font-bold text-sm">3. Single Printer (Bill Only - Quick Service)</Text>
              </View>
              {isSingleBillMode && (
                <View className="bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                  <Text className="text-amber-300 font-bold text-[10px]">ACTIVE</Text>
                </View>
              )}
            </View>
            <Text className="text-slate-400 text-xs ml-5 leading-relaxed">
              1 printer prints Customer Bill only. No kitchen tickets, and <Text className="text-slate-300 font-semibold">"Send KOT" button is hidden.</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Paper Roll Width Configuration */}
        <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
          <Text className="text-white font-black text-sm mb-1">Thermal Receipt Roll Width</Text>
          <Text className="text-slate-400 text-xs mb-3">
            Sets the printable character column count to ensure receipts fill the roll edge-to-edge:
          </Text>
          <View className="flex-row bg-slate-950 p-1 rounded-2xl border border-slate-800">
            {[
              { id: '80mm_48', label: '80mm Wide (48 Cols)' },
              { id: '80mm_42', label: '80mm Standard (42 Cols)' },
              { id: '58mm_32', label: '58mm Compact (32 Cols)' }
            ].map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setPaperWidth(p.id as any)}
                className={`flex-1 py-2 rounded-xl items-center ${
                  paperWidth === p.id ? 'bg-[#5D3FD3]' : 'bg-transparent'
                }`}
              >
                <Text className={`text-[11px] font-bold ${
                  paperWidth === p.id ? 'text-white' : 'text-slate-400'
                }`}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 2. Billing Counter Printer (Used by all modes) */}
        <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
          <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <View className="flex-row items-center">
              <Printer size={18} color="#818CF8" />
              <Text className="text-white font-black text-base ml-2">
                {isDualMode
                  ? '1. Billing Counter Printer (Customer Bill)'
                  : isCombinedMode
                  ? 'Main Counter Printer (Combined Bill + Kitchen Slip)'
                  : 'Main Counter Printer (Bill Only)'}
              </Text>
            </View>
            <View className="bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
              <Text className="text-indigo-400 font-black text-[10px]">
                {printerType === 'USB' ? 'USB MODE' : 'NETWORK LAN'}
              </Text>
            </View>
          </View>

          {/* Connection Type Switcher */}
          <Text className="text-slate-300 font-bold text-xs mb-2">Connection Interface</Text>
          <View className="flex-row bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-4">
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPrinterType('LAN')}
              className={`flex-1 py-2 rounded-xl flex-row items-center justify-center ${
                printerType === 'LAN' ? 'bg-[#5D3FD3]' : ''
              }`}
            >
              <Wifi size={14} color={printerType === 'LAN' ? '#FFF' : '#94A3B8'} />
              <Text className={`text-xs font-black ml-1.5 ${printerType === 'LAN' ? 'text-white' : 'text-slate-400'}`}>
                LAN / Wi-Fi (IP)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPrinterType('USB')}
              className={`flex-1 py-2 rounded-xl flex-row items-center justify-center ${
                printerType === 'USB' ? 'bg-indigo-600' : ''
              }`}
            >
              <Usb size={14} color={printerType === 'USB' ? '#FFF' : '#94A3B8'} />
              <Text className={`text-xs font-black ml-1.5 ${printerType === 'USB' ? 'text-white' : 'text-slate-400'}`}>
                USB (Windows Cable)
              </Text>
            </TouchableOpacity>
          </View>

          {printerType === 'USB' ? (
            <View className="mb-2">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-slate-300 font-bold text-xs">Installed Windows Printers</Text>
                <TouchableOpacity
                  onPress={refreshWindowsPrinters}
                  className="flex-row items-center bg-white/5 px-2 py-1 rounded-lg border border-white/10 active:bg-white/10"
                >
                  <RefreshCw size={11} color="#818CF8" />
                  <Text className="text-indigo-400 text-[10px] font-bold ml-1">Scan Printers</Text>
                </TouchableOpacity>
              </View>

              {detectedPrinters.length > 0 ? (
                <View className="bg-slate-950 rounded-2xl p-2 border border-slate-800 mb-3">
                  {detectedPrinters.map((name) => {
                    const isSelected = printerName === name;
                    return (
                      <TouchableOpacity
                        key={name}
                        onPress={() => setPrinterName(name)}
                        className={`flex-row items-center justify-between p-2.5 rounded-xl mb-1 ${
                          isSelected ? 'bg-indigo-600/20 border border-indigo-500/30' : 'bg-transparent'
                        }`}
                      >
                        <View className="flex-row items-center flex-1 mr-2">
                          <Printer size={15} color={isSelected ? '#818CF8' : '#64748B'} />
                          <Text className={`text-xs ml-2 font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {name}
                          </Text>
                        </View>
                        {isSelected && <CheckCircle2 size={16} color="#818CF8" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800 mb-3">
                  <Text className="text-slate-400 text-xs">
                    {isLoadingPrinters ? 'Scanning printers on Windows...' : 'No printers detected. Ensure USB thermal printer is plugged in and turned ON.'}
                  </Text>
                </View>
              )}

              {/* Quick Presets for Windows */}
              <View className="flex-row gap-2 mb-3">
                <TouchableOpacity
                  onPress={() => setPrinterName('POS-80')}
                  className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl active:bg-white/10"
                >
                  <Text className="text-indigo-300 font-bold text-[11px]">Set: POS-80</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPrinterName('Gobbler 80mm')}
                  className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl active:bg-white/10"
                >
                  <Text className="text-indigo-300 font-bold text-[11px]">Set: Gobbler 80mm</Text>
                </TouchableOpacity>
              </View>

              <Input
                label="Selected USB Printer Name"
                placeholder="e.g. POS-80, Thermal USB Printer, Gobbler"
                value={printerName}
                onChangeText={setPrinterName}
              />

              <Button
                title="Test Counter Bill Printer"
                variant="secondary"
                onPress={testBillingPrinter}
                isLoading={isTestingBilling}
                size="sm"
                className="mt-1"
              />
            </View>
          ) : (
            <View className="mb-2">
              <Input
                label="Billing Counter IP Address"
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
                title="Test Counter Bill Printer"
                variant="secondary"
                onPress={testBillingPrinter}
                isLoading={isTestingBilling}
                size="sm"
                className="mt-1"
              />
            </View>
          )}
        </View>

        {/* 3. Kitchen Thermal KOT Printer (Only visible when Dual Printer mode is active) */}
        {isDualMode && (
          <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
            <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <View className="flex-row items-center">
                <Printer size={18} color="#F59E0B" />
                <Text className="text-white font-black text-base ml-2">2. Kitchen Thermal KOT Printer</Text>
              </View>
              <View className="bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                <Text className="text-amber-400 font-black text-[10px]">
                  {kitchenPrinterType === 'USB' ? 'USB KITCHEN' : 'NETWORK LAN KITCHEN'}
                </Text>
              </View>
            </View>

            {/* Kitchen Connection Type Switcher */}
            <Text className="text-slate-300 font-bold text-xs mb-2">Kitchen Connection Interface</Text>
            <View className="flex-row bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-4">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setKitchenPrinterType('LAN')}
                className={`flex-1 py-2 rounded-xl flex-row items-center justify-center ${
                  kitchenPrinterType === 'LAN' ? 'bg-[#5D3FD3]' : ''
                }`}
              >
                <Wifi size={14} color={kitchenPrinterType === 'LAN' ? '#FFF' : '#94A3B8'} />
                <Text className={`text-xs font-black ml-1.5 ${kitchenPrinterType === 'LAN' ? 'text-white' : 'text-slate-400'}`}>
                  LAN / Wi-Fi (IP)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setKitchenPrinterType('USB')}
                className={`flex-1 py-2 rounded-xl flex-row items-center justify-center ${
                  kitchenPrinterType === 'USB' ? 'bg-amber-600' : ''
                }`}
              >
                <Usb size={14} color={kitchenPrinterType === 'USB' ? '#FFF' : '#94A3B8'} />
                <Text className={`text-xs font-black ml-1.5 ${kitchenPrinterType === 'USB' ? 'text-white' : 'text-slate-400'}`}>
                  USB (Windows Cable)
                </Text>
              </TouchableOpacity>
            </View>

            {kitchenPrinterType === 'USB' ? (
              <View className="mb-2">
                <Text className="text-slate-300 font-bold text-xs mb-2">Select Kitchen USB Printer</Text>
                {detectedPrinters.length > 0 ? (
                  <View className="bg-slate-950 rounded-2xl p-2 border border-slate-800 mb-3">
                    {detectedPrinters.map((name) => {
                      const isSelected = kitchenPrinterName === name;
                      return (
                        <TouchableOpacity
                          key={name}
                          onPress={() => setKitchenPrinterName(name)}
                          className={`flex-row items-center justify-between p-2.5 rounded-xl mb-1 ${
                            isSelected ? 'bg-amber-600/20 border border-amber-500/30' : 'bg-transparent'
                          }`}
                        >
                          <View className="flex-row items-center flex-1 mr-2">
                            <Printer size={15} color={isSelected ? '#F59E0B' : '#64748B'} />
                            <Text className={`text-xs ml-2 font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                              {name}
                            </Text>
                          </View>
                          {isSelected && <CheckCircle2 size={16} color="#F59E0B" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800 mb-3">
                    <Text className="text-slate-400 text-xs">No USB printers detected.</Text>
                  </View>
                )}

                <Input
                  label="Kitchen USB Printer Name"
                  placeholder="e.g. Kitchen-POS, POS-80"
                  value={kitchenPrinterName}
                  onChangeText={setKitchenPrinterName}
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
            ) : (
              <View className="mb-2">
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

          {isDualMode && (
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
                    <Text className="text-indigo-300 font-bold text-xs mt-1">Test Counter Bill</Text>
                    <Text className="text-slate-400 text-[10px] mt-0.5" numberOfLines={1}>
                      {printerType === 'USB' ? (printerName || 'USB') : (ipAddress || 'Not set')}
                    </Text>
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
                    <Text className="text-amber-300 font-bold text-xs mt-1">Test Kitchen KOT</Text>
                    <Text className="text-slate-400 text-[10px] mt-0.5" numberOfLines={1}>
                      {kitchenPrinterType === 'USB' ? (kitchenPrinterName || 'USB') : (kitchenIpAddress || 'Not set')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {isSingleBillMode && (
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
                  <Text className="text-slate-400 text-[10px] mt-0.5">
                    {printerType === 'USB' ? printerName : `${ipAddress}:${port}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {isCombinedMode && (
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
                  <Text className="text-emerald-300 font-bold text-xs mt-1">Test 2-Print Slip (Bill + Kitchen Slip)</Text>
                  <Text className="text-slate-400 text-[10px] mt-0.5">
                    {printerType === 'USB' ? printerName : `${ipAddress}:${port}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
