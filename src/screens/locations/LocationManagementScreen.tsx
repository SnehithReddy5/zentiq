import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, Plus, CheckCircle2, Clock, Ban, Lock, X } from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { DBServices } from '../../services/firebase/db';

export const LocationManagementScreen = () => {
  const insets = useSafeAreaInsets();
  const { tenant, features, locations, activeLocationId, setActiveLocationId } = useTenantStore();
  const { user } = useAuthStore();

  const [isModalOpen, setModalOpen] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [newLocPhone, setNewLocPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMultiLocationAllowed = tenant?.multiLocationEnabled !== false && features.multiLocationEnabled !== false;

  const handleRequestLocation = async () => {
    if (!newLocName.trim() || !newLocAddress.trim()) {
      Alert.alert('Required Fields', 'Location Name and Address are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await DBServices.requestLocation(tenant?.id || '', {
        requestedByUserId: user?.id || '',
        locationName: newLocName.trim(),
        address: newLocAddress.trim(),
        phone: newLocPhone.trim(),
      });

      setNewLocName('');
      setNewLocAddress('');
      setNewLocPhone('');
      setModalOpen(false);

      Alert.alert(
        'Request Submitted',
        'Your branch request has been sent to platform administration for licensing approval.'
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Branch Locations"
        subtitle={isMultiLocationAllowed ? `${locations.length} approved branches` : 'Single Location Mode'}
        rightElement={
          isMultiLocationAllowed ? (
            <TouchableOpacity
              className="bg-[#5D3FD3] px-3 py-1.5 rounded-xl flex-row items-center"
              onPress={() => setModalOpen(true)}
            >
              <Plus size={16} color="white" />
              <Text className="text-white font-bold text-xs ml-1">Request Branch</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Multi-Location Disabled Banner */}
      {!isMultiLocationAllowed && (
        <View className="m-4 p-4 rounded-2xl bg-slate-900 border border-slate-800 flex-row items-center">
          <Ban size={24} color="#94A3B8" />
          <View className="flex-1 ml-3">
            <Text className="text-white font-bold text-sm">Multi-Location Disabled</Text>
            <Text className="text-slate-400 text-xs mt-0.5">
              Multi-branch expansion is disabled for this restaurant by platform administration.
            </Text>
          </View>
        </View>
      )}

      <FlatList
        data={locations}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 36, 52) }}
        renderItem={({ item }) => {
          const isSelected = activeLocationId === item.id;
          const isDisabled = item.status === 'DISABLED';
          return (
            <TouchableOpacity
              onPress={() => {
                if (isDisabled) {
                  Alert.alert('Branch Disabled', 'This branch has been disabled by platform administration and cannot be accessed.');
                  return;
                }
                setActiveLocationId(item.id);
                Alert.alert('Active Branch Updated', `Device switched to ${item.name} successfully!`);
              }}
              className={`p-4 rounded-2xl mb-3 border ${
                isDisabled
                  ? 'bg-slate-950/60 border-slate-800/50 opacity-50'
                  : isSelected
                  ? 'bg-purple-600/15 border-[#5D3FD3]'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-white font-bold text-base">{item.name}</Text>
                    {isDisabled && (
                      <View className="bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 flex-row items-center">
                        <Lock size={10} color="#F43F5E" />
                        <Text className="text-rose-400 text-[10px] font-bold ml-1">Disabled by Admin</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-slate-400 text-xs mt-1">📍 {item.address}</Text>
                  {item.phone && <Text className="text-slate-500 text-[11px] mt-0.5">📞 {item.phone}</Text>}
                </View>

                {isSelected && <CheckCircle2 size={24} color="#8B5CF6" />}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Request Modal */}
      {isModalOpen && (
        <Modal visible={true} transparent animationType="slide">
          <View className="flex-1 justify-center items-center bg-black/75 p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md">
              <View className="flex-row justify-between items-center mb-4 border-b border-slate-800 pb-2">
                <Text className="text-white font-black text-lg">Request New Branch</Text>
                <TouchableOpacity onPress={() => setModalOpen(false)}>
                  <X size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <Input
                label="Branch Name *"
                placeholder="e.g. Madhapur Cyber Towers"
                value={newLocName}
                onChangeText={setNewLocName}
              />

              <Input
                label="Full Address *"
                placeholder="e.g. Ground Floor, Cyber Gateway, Madhapur"
                value={newLocAddress}
                onChangeText={setNewLocAddress}
              />

              <Input
                label="Branch Contact Phone"
                placeholder="e.g. 9876543210"
                keyboardType="phone-pad"
                value={newLocPhone}
                onChangeText={setNewLocPhone}
              />

              <View className="flex-row gap-2 mt-4">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setModalOpen(false)}
                  className="flex-1"
                />
                <Button
                  title="Submit Request"
                  onPress={handleRequestLocation}
                  isLoading={isSubmitting}
                  className="flex-1"
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};
