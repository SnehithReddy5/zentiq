import { toast } from '../../utils/toast';
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, Alert, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Trash2, Pencil, Users, MapPin, X, Check, Building } from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useTenantStore } from '../../store/tenant.store';
import { DBServices } from '../../services/firebase/db';
import { UserRole } from '../../types/auth.types';

export const UserManagementScreen = () => {
  const insets = useSafeAreaInsets();
  const { tenant, locations } = useTenantStore();
  const [users, setUsers] = useState<any[]>([]);
  const [isModalOpen, setModalOpen] = useState(false);

  // Edit vs Add State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('WAITER');
  const [selectedLocId, setSelectedLocId] = useState<string>(locations[0]?.id || '*');

  useEffect(() => {
    const unsub = DBServices.subscribeToUsers((u) => setUsers(u), tenant?.id);
    return () => unsub();
  }, [tenant?.id]);

  const openAddModal = () => {
    setEditingUserId(null);
    setName('');
    setMobile('');
    setPassword('');
    setRole('WAITER');
    setSelectedLocId(locations[0]?.id || '*');
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingUserId(item.id);
    setName(item.name || '');
    setMobile(item.mobile || item.id || '');
    setPassword(''); // leave blank to keep existing
    setRole(item.role || 'WAITER');
    const assignedLoc = item.assignedLocationId || (item.locationIds && item.locationIds[0] ? item.locationIds[0] : (locations[0]?.id || '*'));
    setSelectedLocId(assignedLoc);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !mobile.trim()) {
      toast.warning('Name and mobile/ID are required.', 'Required');
      return;
    }

    if (!editingUserId && !password.trim()) {
      toast.warning('Please enter a password for this new staff member.', 'Password Required');
      return;
    }

    try {
      if (editingUserId) {
        // Edit existing staff
        const updates: any = {
          name: name.trim(),
          mobile: mobile.trim(),
          role,
          locationIds: selectedLocId ? [selectedLocId] : ['*'],
          assignedLocationId: selectedLocId !== '*' ? selectedLocId : null,
        };
        if (password.trim()) {
          updates.password = password.trim();
        }

        await DBServices.updateUser(editingUserId, updates, tenant?.id);
        toast.success('Staff member details updated successfully!');
      } else {
        // Create new staff
        await DBServices.addUser({
          name: name.trim(),
          mobile: mobile.trim(),
          password: password.trim(),
          role,
          tenantId: tenant?.id,
          locationIds: selectedLocId ? [selectedLocId] : ['*'],
          assignedLocationId: selectedLocId !== '*' ? selectedLocId : null,
        }, tenant?.id);
        toast.success('Staff member created successfully!');
      }

      setModalOpen(false);
    } catch (e: any) {
      toast.error(e.message, 'User Management Error');
    }
  };

  const getRoleBadgeColor = (r: string) => {
    switch (r) {
      case 'CLIENT_ADMIN':
      case 'ADMIN':
      case 'TENANT_SUPER_ADMIN':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'MANAGER':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      case 'BILLER':
      case 'CASHIER':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    }
  };

  const getAssignedBranchName = (item: any) => {
    const locId = item.assignedLocationId || (item.locationIds && item.locationIds[0]);
    if (!locId || locId === '*') return 'All Branches (Floating)';
    const found = locations.find(l => l.id === locId);
    return found ? found.name : 'Branch Assigned';
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Staff & User Roles"
        subtitle={`${users.length} staff accounts • Branch access restricted`}
        rightElement={
          <TouchableOpacity
            className="bg-[#5D3FD3] px-3 py-1.5 rounded-xl flex-row items-center"
            onPress={openAddModal}
          >
            <Plus size={16} color="white" />
            <Text className="text-white font-bold text-xs ml-1">Add Staff</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 36, 52), maxWidth: 1000, alignSelf: "center", width: "100%" }}
        renderItem={({ item }) => (
          <View className="bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-3 flex-row items-center justify-between">
            <View className="flex-1 min-w-0 pr-3">
              <View className="flex-row items-center flex-wrap gap-2 mb-1">
                <Text className="text-white font-bold text-base" numberOfLines={1}>
                  {item.name}
                </Text>
                <View className={`px-2 py-0.5 rounded border ${getRoleBadgeColor(item.role)}`}>
                  <Text className="text-[10px] font-bold uppercase">{item.role}</Text>
                </View>
              </View>

              <Text className="text-slate-400 text-xs" numberOfLines={1}>
                ID/Phone: {item.mobile || item.id}
              </Text>

              <View className="flex-row items-center mt-1.5">
                <MapPin size={11} color="#A78BFA" />
                <Text className="text-purple-300 text-xs font-medium ml-1" numberOfLines={1}>
                  {getAssignedBranchName(item)}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center flex-shrink-0">
              {/* Edit Button */}
              <TouchableOpacity
                onPress={() => openEditModal(item)}
                activeOpacity={0.7}
                className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mr-2 items-center justify-center"
              >
                <Pencil size={15} color="#818CF8" />
              </TouchableOpacity>

              {/* Delete Button */}
              <TouchableOpacity
                onPress={() => {
                  Alert.alert('Delete Staff', `Delete "${item.name}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => DBServices.deleteUserAccount(item.id, tenant?.id) }
                  ]);
                }}
                activeOpacity={0.7}
                className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 items-center justify-center"
              >
                <Trash2 size={15} color="#F43F5E" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="py-16 items-center">
            <Users size={36} color="#475569" />
            <Text className="text-slate-400 text-xs mt-3">No staff members created yet.</Text>
          </View>
        }
      />

      {/* Add / Edit Staff Modal */}
      {isModalOpen && (
        <Modal visible={true} transparent animationType="slide">
          <View className="flex-1 justify-center items-center bg-black/80 p-4" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md max-h-[90%] shadow-2xl">
              <View className="flex-row justify-between items-center mb-4 border-b border-slate-800 pb-3">
                <View>
                  <Text className="text-white font-black text-lg">
                    {editingUserId ? 'Edit Staff Member' : 'Add New Staff Member'}
                  </Text>
                  <Text className="text-slate-400 text-xs">
                    {editingUserId ? 'Update staff info and assigned branch' : 'Setup login credentials and branch permissions'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setModalOpen(false)}>
                  <X size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Input
                  label="Staff Full Name *"
                  placeholder="e.g. Ramesh Kumar"
                  value={name}
                  onChangeText={setName}
                />

                <Input
                  label="Login ID / Mobile Number *"
                  placeholder="e.g. 9876543210 or waiter1"
                  value={mobile}
                  onChangeText={setMobile}
                />

                <Input
                  label={editingUserId ? "Password (Leave blank to keep current)" : "Password *"}
                  placeholder={editingUserId ? "Enter new password or leave blank" : "Enter login password"}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                {/* Role Picker */}
                <View className="mb-4">
                  <Text className="text-slate-300 font-bold text-xs mb-2">Select Staff Role *</Text>
                  <View className="space-y-2">
                    {[
                      { r: 'WAITER', title: 'Waiter / Captain', desc: 'Order entry & KOT printing only' },
                      { r: 'BILLER', title: 'Biller / Cashier', desc: 'Orders, KOT, checkout & bill settlement' },
                      { r: 'MANAGER', title: 'Manager', desc: 'Orders, billing, tables, printer config & discounts' },
                      { r: 'CLIENT_ADMIN', title: 'Client Admin (Owner)', desc: 'Full restaurant control & branch switching' },
                    ].map(opt => (
                      <TouchableOpacity
                        key={opt.r}
                        onPress={() => {
                          setRole(opt.r as UserRole);
                          if (opt.r === 'CLIENT_ADMIN') {
                            setSelectedLocId('*');
                          } else if (selectedLocId === '*' && locations.length > 0) {
                            setSelectedLocId(locations[0].id);
                          }
                        }}
                        className={`p-3 rounded-xl border flex-row items-center justify-between ${
                          role === opt.r
                            ? 'bg-indigo-600/20 border-indigo-500'
                            : 'bg-slate-800/60 border-slate-700'
                        }`}
                      >
                        <View>
                          <Text className={`font-bold text-xs ${role === opt.r ? 'text-indigo-300' : 'text-white'}`}>
                            {opt.title}
                          </Text>
                          <Text className="text-slate-400 text-[11px] mt-0.5">{opt.desc}</Text>
                        </View>
                        {role === opt.r && (
                          <View className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Branch Assignment Section (Staff is locked to this branch) */}
                <View className="mb-5">
                  <Text className="text-slate-300 font-bold text-xs mb-1">
                    Assign Operating Branch *
                  </Text>
                  <Text className="text-slate-400 text-[11px] mb-2">
                    {role === 'CLIENT_ADMIN'
                      ? 'Client Admins can access all branches or choose a primary branch.'
                      : 'Staff member is strictly locked to this branch and cannot switch.'}
                  </Text>

                  <View className="space-y-2">
                    {role === 'CLIENT_ADMIN' && (
                      <TouchableOpacity
                        onPress={() => setSelectedLocId('*')}
                        className={`p-3 rounded-xl border flex-row items-center justify-between ${
                          selectedLocId === '*'
                            ? 'bg-purple-600/20 border-purple-500'
                            : 'bg-slate-800/60 border-slate-700'
                        }`}
                      >
                        <View className="flex-row items-center">
                          <Building size={16} color={selectedLocId === '*' ? '#C4B5FD' : '#94A3B8'} />
                          <View className="ml-2">
                            <Text className={`font-bold text-xs ${selectedLocId === '*' ? 'text-purple-300' : 'text-white'}`}>
                              All Branches (Unrestricted Access)
                            </Text>
                            <Text className="text-slate-400 text-[10px]">Can switch between any active restaurant location</Text>
                          </View>
                        </View>
                        {selectedLocId === '*' && <Check size={16} color="#A78BFA" />}
                      </TouchableOpacity>
                    )}

                    {locations.length === 0 ? (
                      <Text className="text-slate-500 text-xs py-2">No branches configured yet.</Text>
                    ) : (
                      locations.map(loc => {
                        const isSelected = selectedLocId === loc.id;
                        return (
                          <TouchableOpacity
                            key={loc.id}
                            onPress={() => setSelectedLocId(loc.id)}
                            className={`p-3 rounded-xl border flex-row items-center justify-between ${
                              isSelected
                                ? 'bg-indigo-600/20 border-indigo-500'
                                : 'bg-slate-800/60 border-slate-700'
                            }`}
                          >
                            <View className="flex-row items-center flex-1 mr-2">
                              <MapPin size={16} color={isSelected ? '#818CF8' : '#94A3B8'} />
                              <View className="ml-2 flex-1">
                                <Text className={`font-bold text-xs ${isSelected ? 'text-indigo-300' : 'text-white'}`} numberOfLines={1}>
                                  {loc.name}
                                </Text>
                                <Text className="text-slate-400 text-[10px]" numberOfLines={1}>
                                  {loc.address || 'Operating Branch'}
                                </Text>
                              </View>
                            </View>
                            {isSelected && <Check size={16} color="#818CF8" />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                </View>

                <View className="flex-row gap-2 mt-2 mb-4">
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setModalOpen(false)}
                    className="flex-1"
                  />
                  <Button
                    title={editingUserId ? "Update Staff" : "Create Staff"}
                    onPress={handleSave}
                    className="flex-1"
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};
