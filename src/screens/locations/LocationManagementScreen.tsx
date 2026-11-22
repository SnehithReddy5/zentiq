import { toast } from '../../utils/toast';
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, ScrollView, Switch } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, Plus, CheckCircle2, Clock, Ban, Lock, X, ShieldCheck, Copy, Check } from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { DBServices } from '../../services/firebase/db';

export const LocationManagementScreen = () => {
  const insets = useSafeAreaInsets();
  const { tenant, features, locations, activeLocationId, setActiveLocationId } = useTenantStore();
  const { user } = useAuthStore();
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  const [isModalOpen, setModalOpen] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [newLocPhone, setNewLocPhone] = useState('');

  // Initial Branch Admin Credentials (Scoped strictly to this branch)
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [cloneMenu, setCloneMenu] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMultiLocationAllowed = tenant?.multiLocationEnabled !== false && features.multiLocationEnabled !== false;

  const handleCreateBranch = async () => {
    if (!newLocName.trim() || !newLocAddress.trim()) {
      toast.warning('Branch Name and Address are required.', 'Required');
      return;
    }

    const effectiveTenantId = tenant?.id || user?.tenantId;
    if (!effectiveTenantId) {
      toast.error('Tenant ID not found. Please log in again.', 'Error');
      return;
    }

    setIsSubmitting(true);
    try {
      await DBServices.createLocationWithAdmin(
        effectiveTenantId,
        {
          name: newLocName.trim(),
          address: newLocAddress.trim(),
          phone: newLocPhone.trim(),
        },
        adminUsername.trim()
          ? {
              name: adminName.trim() || `${newLocName.trim()} Admin`,
              mobile: adminUsername.trim(),
              password: adminPassword.trim() || '123456',
            }
          : undefined,
        cloneMenu && locations.length > 0 ? (activeLocationId || locations[0].id) : undefined
      );

      setNewLocName('');
      setNewLocAddress('');
      setNewLocPhone('');
      setAdminName('');
      setAdminUsername('');
      setAdminPassword('');
      setModalOpen(false);

      toast.success(
        adminUsername.trim()
          ? `Branch "${newLocName.trim()}" and its dedicated Admin (${adminUsername.trim()}) created successfully!`
          : `Branch "${newLocName.trim()}" created successfully!`,
        'Branch Created'
      );
    } catch (e: any) {
      toast.error(e.message, 'Location Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#090D1A]' : 'bg-[#F8FAFC]'}`}>
      <Header
        title="Branch Locations"
        subtitle={isMultiLocationAllowed ? `${locations.length} approved branches` : 'Single Location Mode'}
        rightElement={
          isMultiLocationAllowed ? (
            <TouchableOpacity
              className="bg-[#5D3FD3] px-2.5 sm:px-3 py-1.5 rounded-xl flex-row items-center shrink-0 shadow-sm shadow-purple-500/25"
              onPress={() => setModalOpen(true)}
            >
              <Plus size={15} color="white" />
              <Text className="text-white font-bold text-xs ml-1" numberOfLines={1} ellipsizeMode="tail">
                Request Branch
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Multi-Location Disabled Banner */}
      {!isMultiLocationAllowed && (
        <View
          className={`m-4 p-4 rounded-2xl border flex-row items-center ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <Ban size={24} color="#94A3B8" />
          <View className="flex-1 ml-3">
            <Text className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Multi-Location Disabled
            </Text>
            <Text className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Multi-branch expansion is disabled for this restaurant by platform administration.
            </Text>
          </View>
        </View>
      )}

      <FlatList
        className="flex-1"
        style={{ flex: 1 }}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={true}
        data={locations}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 36, 52), maxWidth: 1000, alignSelf: "center", width: "100%" }}
        renderItem={({ item }) => {
          const isSelected = activeLocationId === item.id;
          const isDisabled = item.status === 'DISABLED';
          return (
            <TouchableOpacity
              onPress={() => {
                if (isDisabled) {
                  toast.error('This branch has been disabled by platform administration.', 'Branch Disabled');
                  return;
                }
                setActiveLocationId(item.id);
                toast.success(`Device switched to ${item.name} successfully!`, 'Active Branch Updated');
              }}
              className={`p-4 rounded-2xl mb-3 border transition-all ${
                isDisabled
                  ? isDark
                    ? 'bg-slate-950/60 border-slate-800/50 opacity-50'
                    : 'bg-slate-100 border-slate-200 opacity-50'
                  : isSelected
                  ? isDark
                    ? 'bg-purple-950/30 border-2 border-[#5D3FD3] shadow-sm'
                    : 'bg-purple-50/90 border-2 border-[#5D3FD3] shadow-sm'
                  : isDark
                  ? 'bg-slate-900 border-slate-800 active:bg-slate-850'
                  : 'bg-white border-slate-200 active:bg-slate-50 shadow-sm'
              }`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <View className="flex-row items-center flex-wrap gap-1.5">
                    <Text className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {item.name}
                    </Text>
                    {isDisabled && (
                      <View className="bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 flex-row items-center shrink-0">
                        <Lock size={10} color="#F43F5E" />
                        <Text className="text-rose-400 text-[10px] font-bold ml-1">Disabled by Admin</Text>
                      </View>
                    )}
                  </View>
                  <Text className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    📍 {item.address}
                  </Text>
                  {item.phone && (
                    <Text className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      📞 {item.phone}
                    </Text>
                  )}
                </View>

                {isSelected && <CheckCircle2 size={24} color="#8B5CF6" />}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Create / Request Branch Modal */}
      {isModalOpen && (
        <Modal visible={true} transparent animationType="slide">
          <View className="flex-1 justify-center items-center bg-black/60 p-4">
            <View
              className={`border rounded-3xl p-5 w-full max-w-lg shadow-2xl ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
              style={{ maxHeight: '90%' }}
            >
              <View
                className={`flex-row justify-between items-center mb-3 border-b pb-3 ${
                  isDark ? 'border-slate-800' : 'border-slate-100'
                }`}
              >
                <View>
                  <Text className={`font-black text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Add New Branch
                  </Text>
                  <Text className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Isolated menu, thermal printers, and dedicated branch admin
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModalOpen(false)}
                  className={`p-1.5 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}
                >
                  <X size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text className="text-purple-400 font-bold text-xs uppercase tracking-wider mb-2">
                  1. Branch Location Details
                </Text>

                <Input
                  label="Branch Name *"
                  placeholder="e.g. Branch B - Kukatpally"
                  value={newLocName}
                  onChangeText={setNewLocName}
                />

                <Input
                  label="Full Address *"
                  placeholder="e.g. Pillar 120, KPHB Colony, Hyderabad"
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

                {/* Section 2: Dedicated Branch Admin */}
                <View
                  className={`p-4 rounded-2xl my-3 border ${
                    isDark ? 'bg-purple-950/20 border-purple-800/40' : 'bg-purple-50/80 border-purple-200'
                  }`}
                >
                  <View className="flex-row items-center mb-1">
                    <ShieldCheck size={16} color="#8B5CF6" />
                    <Text className={`font-bold text-xs ml-1.5 ${isDark ? 'text-purple-300' : 'text-purple-900'}`}>
                      Dedicated Branch Admin (Optional)
                    </Text>
                  </View>
                  <Text className={`text-[11px] mb-3 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Create an admin login scoped exclusively to this branch. This admin will only manage this branch's menu, printers, and staff.
                  </Text>

                  <Input
                    label="Admin Full Name"
                    placeholder="e.g. Rajesh Kumar (Branch Manager)"
                    value={adminName}
                    onChangeText={setAdminName}
                  />

                  <Input
                    label="Admin Login Username / Mobile *"
                    placeholder="e.g. admin_kukatpally"
                    value={adminUsername}
                    onChangeText={setAdminUsername}
                    autoCapitalize="none"
                  />

                  <Input
                    label="Admin Password *"
                    placeholder="Set temporary password (e.g. pass123)"
                    secureTextEntry
                    value={adminPassword}
                    onChangeText={setAdminPassword}
                  />
                </View>

                {/* Section 3: Starter Menu Cloning */}
                {locations.length > 0 && (
                  <View
                    className={`flex-row items-center justify-between p-3.5 rounded-2xl mb-4 border ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center">
                        <Copy size={15} color="#10B981" />
                        <Text className={`font-bold text-xs ml-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          Copy Starter Menu from Existing Branch
                        </Text>
                      </View>
                      <Text className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Imports existing dishes as a starting template. Branch B can customize prices and items later.
                      </Text>
                    </View>
                    <Switch
                      value={cloneMenu}
                      onValueChange={setCloneMenu}
                      trackColor={{ false: '#334155', true: '#10B981' }}
                      thumbColor={cloneMenu ? '#FFFFFF' : '#94A3B8'}
                    />
                  </View>
                )}
              </ScrollView>

              <View className="flex-row gap-2 mt-4 pt-3 border-t border-slate-800">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setModalOpen(false)}
                  className="flex-1"
                />
                <Button
                  title="Create Branch & Admin"
                  onPress={handleCreateBranch}
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
