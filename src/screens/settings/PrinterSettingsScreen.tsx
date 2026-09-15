import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { usePrinterStore } from '../../store/printer.store';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { Printer } from 'lucide-react-native';

export const PrinterSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const { settings, setSettings } = usePrinterStore();

  const [ipAddress, setIpAddress] = useState(settings.ipAddress);
  const [port, setPort] = useState(settings.port.toString());
  const [kitchenIpAddress, setKitchenIpAddress] = useState(settings.kitchenIpAddress);
  const [kitchenPort, setKitchenPort] = useState(settings.kitchenPort.toString());
  const [isTesting, setIsTesting] = useState(false);

  const handleSave = () => {
    setSettings({
      ...settings,
      ipAddress,
      port: parseInt(port, 10) || 9100,
      kitchenIpAddress,
      kitchenPort: parseInt(kitchenPort, 10) || 9100,
    });
    Alert.alert('Success', 'Printer settings saved to local device!');
  };

  const testBillingPrinter = async () => {
    setIsTesting(true);
    try {
      await printerService.connect(ipAddress, parseInt(port, 10) || 9100);
      const buffer = ESCPOSService.buildKOT('TEST', 0, 'Tester', [{ itemName: 'Billing Printer Test', qty: 1 }]);
      await printerService.print(buffer);
      await printerService.disconnect();
      Alert.alert('Success', 'Billing printer test ticket printed!');
    } catch (e: any) {
      Alert.alert('Printer Error', `Could not connect to ${ipAddress}:${port}. ${e.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header title="Thermal Printers" subtitle="Port 9100 RAW ESC/POS LAN Configuration" />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom + 40, 60), maxWidth: 800, alignSelf: "center", width: "100%" }} keyboardShouldPersistTaps="handled">
        <View className="bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-5">
          <Text className="text-white font-bold text-base mb-3">Billing Counter Printer</Text>
          <Input label="IP Address" placeholder="e.g. 192.168.1.100" value={ipAddress} onChangeText={setIpAddress} keyboardType="numeric" />
          <Input label="Port (Standard: 9100)" placeholder="9100" value={port} onChangeText={setPort} keyboardType="numeric" />
          <Button title="Test Billing Printer" variant="secondary" onPress={testBillingPrinter} isLoading={isTesting} size="sm" />
        </View>

        <View className="bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-5">
          <Text className="text-white font-bold text-base mb-3">Kitchen KOT Printer</Text>
          <Input label="IP Address" placeholder="e.g. 192.168.1.101" value={kitchenIpAddress} onChangeText={setKitchenIpAddress} keyboardType="numeric" />
          <Input label="Port (Standard: 9100)" placeholder="9100" value={kitchenPort} onChangeText={setKitchenPort} keyboardType="numeric" />
        </View>

        <Button title="Save Printer Settings" onPress={handleSave} size="lg" className="mb-8" />
      </ScrollView>
    </SafeAreaView>
  );
};
