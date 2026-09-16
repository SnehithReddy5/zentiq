import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  X,
  Settings,
  LogOut,
  Users,
  ClipboardList,
  Utensils,
  MapPin,
  Building,
  LayoutGrid,
  ChevronRight,
  Printer,
  Sparkles,
  ShieldAlert
} from 'lucide-react-native';
import { Routes } from '../../constants/routes';
import { useAuthStore } from '../../store/auth.store';
import { useTenantStore } from '../../store/tenant.store';

interface HamburgerMenuProps {
  isVisible: boolean;
  onClose: () => void;
}

export const HamburgerMenu = ({ isVisible, onClose }: HamburgerMenuProps) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { logout, user } = useAuthStore();
  const { tenant, branding, features, getActiveLocation } = useTenantStore();

  if (!isVisible) return null;

  const navigateTo = (route: string) => {
    onClose();
    navigation.navigate(route);
  };

  const isSuperAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';
  const isManager = isSuperAdmin || user?.role === 'MANAGER' || user?.role === 'manager';
  const isBiller = isManager || user?.role === 'BILLER' || user?.role === 'CASHIER';

  const activeLocation = getActiveLocation();
  const businessName = branding?.displayName || branding?.businessName || tenant?.businessName || 'Zentiq POS';

  return (
    <Modal visible={isVisible} transparent animationType="fade">
      <View className="flex-1 flex-row">
        {/* Sidebar */}
        <View className="w-4/5 max-w-[320px] bg-[#090D1A] border-r border-slate-800 p-6 justify-between" style={{ paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header Brand */}
            <View className="flex-row items-center justify-between pb-6 border-b border-slate-800">
              <View className="flex-row items-center flex-1 mr-2">
                <View className="w-10 h-10 rounded-2xl bg-indigo-600 items-center justify-center mr-3 shadow-lg shadow-indigo-500/30">
                  <Utensils size={20} color="white" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-black text-base" numberOfLines={1}>
                    {businessName}
                  </Text>
                  <View className="flex-row items-center mt-0.5">
                    <MapPin size={11} color="#818CF8" />
                    <Text className="text-slate-400 text-xs ml-1" numberOfLines={1}>
                      {activeLocation?.name || 'No Branch Selected'}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} className="p-1.5 rounded-xl bg-slate-800">
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* User Role Card */}
            <View className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl my-4">
              <Text className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Logged In Staff</Text>
              <Text className="text-white font-bold text-sm mt-0.5">{user?.name || 'Staff'}</Text>
              <View className="mt-1 bg-indigo-500/10 px-2 py-0.5 rounded self-start border border-indigo-500/20">
                <Text className="text-indigo-400 text-[10px] font-bold">
                  ROLE: {user?.role || 'WAITER'}
                </Text>
              </View>
            </View>

            {/* Navigation Items (Filtered by Role) */}
            <View className="space-y-1.5">
              {/* Tables: Available to All */}
              {features.tablesEnabled && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.TABLES)}
                  className="flex-row items-center justify-between p-3 rounded-2xl hover:bg-slate-800"
                >
                  <View className="flex-row items-center">
                    <LayoutGrid size={18} color="#818CF8" />
                    <Text className="text-slate-200 text-sm font-semibold ml-3">Floor Plan & Tables</Text>
                  </View>
                  <ChevronRight size={16} color="#64748B" />
                </TouchableOpacity>
              )}

              {/* Running Orders: Available to All */}
              <TouchableOpacity
                onPress={() => navigateTo(Routes.ORDERS)}
                className="flex-row items-center justify-between p-3 rounded-2xl hover:bg-slate-800"
              >
                <View className="flex-row items-center">
                  <ClipboardList size={18} color="#818CF8" />
                  <Text className="text-slate-200 text-sm font-semibold ml-3">Orders History & Ledger</Text>
                </View>
                <ChevronRight size={16} color="#64748B" />
              </TouchableOpacity>

              {/* Menu Management: Managers and Admins */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.MENU_MANAGEMENT)}
                  className="flex-row items-center justify-between p-3 rounded-2xl hover:bg-slate-800"
                >
                  <View className="flex-row items-center">
                    <Utensils size={18} color="#818CF8" />
                    <Text className="text-slate-200 text-sm font-semibold ml-3">Edit Menu & Favorites</Text>
                  </View>
                  <ChevronRight size={16} color="#64748B" />
                </TouchableOpacity>
              )}

              {/* Printer Settings: Managers and Admins */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.SETTINGS)}
                  className="flex-row items-center justify-between p-3 rounded-2xl hover:bg-slate-800"
                >
                  <View className="flex-row items-center">
                    <Printer size={18} color="#818CF8" />
                    <Text className="text-slate-200 text-sm font-semibold ml-3">Thermal Printers (LAN)</Text>
                  </View>
                  <ChevronRight size={16} color="#64748B" />
                </TouchableOpacity>
              )}

              {/* Staff & User Management: Admin Only */}
              {isSuperAdmin && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.USER_MANAGEMENT)}
                  className="flex-row items-center justify-between p-3 rounded-2xl hover:bg-slate-800"
                >
                  <View className="flex-row items-center">
                    <Users size={18} color="#818CF8" />
                    <Text className="text-slate-200 text-sm font-semibold ml-3">Staff & User Roles</Text>
                  </View>
                  <ChevronRight size={16} color="#64748B" />
                </TouchableOpacity>
              )}

              {/* Branch Locations: Admin Only */}
              {isSuperAdmin && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.LOCATION_MANAGEMENT)}
                  className="flex-row items-center justify-between p-3 rounded-2xl hover:bg-slate-800"
                >
                  <View className="flex-row items-center">
                    <Building size={18} color="#818CF8" />
                    <Text className="text-slate-200 text-sm font-semibold ml-3">Branch Management</Text>
                  </View>
                  <ChevronRight size={16} color="#64748B" />
                </TouchableOpacity>
              )}

              {/* Store & Payment Settings: Managers and Admins */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.BUSINESS_PROFILE)}
                  className="flex-row items-center justify-between p-3 rounded-2xl hover:bg-slate-800"
                >
                  <View className="flex-row items-center">
                    <Settings size={18} color="#818CF8" />
                    <Text className="text-slate-200 text-sm font-semibold ml-3">Store & Payment Settings</Text>
                  </View>
                  <ChevronRight size={16} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          {/* Logout Footer */}
          <View className="pt-4 border-t border-slate-800">
            <TouchableOpacity
              onPress={() => {
                onClose();
                logout();
              }}
              className="flex-row items-center p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20"
            >
              <LogOut size={18} color="#F43F5E" />
              <Text className="text-rose-400 font-bold text-sm ml-3">Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Backdrop Tap to Close */}
        <TouchableOpacity className="flex-1 bg-black/60" activeOpacity={1} onPress={onClose} />
      </View>
    </Modal>
  );
};
