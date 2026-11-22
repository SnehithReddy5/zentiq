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
  Boxes,
  ChefHat,
  Store,
  Utensils,
  MapPin,
  Building,
  LayoutGrid,
  QrCode,
  ChevronRight,
  Printer,
  Sparkles,
  ShieldAlert,
  Sun,
  Moon
} from 'lucide-react-native';
import { Routes } from '../../constants/routes';
import { useAuthStore } from '../../store/auth.store';
import { useTenantStore } from '../../store/tenant.store';
import { useThemeStore } from '../../store/theme.store';
import packageJson from '../../../package.json';

interface HamburgerMenuProps {
  isVisible: boolean;
  onClose: () => void;
}

export const HamburgerMenu = ({ isVisible, onClose }: HamburgerMenuProps) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { logout, user } = useAuthStore();
  const { tenant, branding, features, getActiveLocation } = useTenantStore();
  const { themeMode, toggleTheme } = useThemeStore();
  const isDark = themeMode === 'dark';

  if (!isVisible) return null;

  const navigateTo = (route: string) => {
    onClose();
    navigation.navigate(route);
  };

  const isSuperAdmin = user?.role === 'PLATFORM_ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';
  const isManager = isSuperAdmin || user?.role === 'MANAGER' || user?.role === 'manager';
  const isBiller = isManager || user?.role === 'BILLER' || user?.role === 'CASHIER';
  const isKitchenStaff = user?.role === 'KITCHEN' || user?.role === 'KITCHEN_STAFF';

  const activeLocation = getActiveLocation();
  const businessName = branding?.displayName || branding?.businessName || tenant?.businessName || 'Zentiq POS';

  return (
    <Modal visible={isVisible} transparent animationType="fade">
      <View className="flex-1 flex-row">
        {/* Sidebar */}
        <View
          className={`w-4/5 max-w-[320px] border-r p-6 justify-between ${
            isDark ? 'bg-[#090D1A] border-slate-800' : 'bg-white border-slate-200'
          }`}
          style={{ paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header Brand */}
            <View
              className={`flex-row items-center justify-between pb-6 border-b ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              <View className="flex-row items-center flex-1 mr-2">
                <View className="w-10 h-10 rounded-2xl bg-[#5D3FD3] items-center justify-center mr-3 shadow-lg shadow-purple-500/30">
                  <Utensils size={20} color="white" />
                </View>
                <View className="flex-1">
                  <Text
                    className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}
                    numberOfLines={1}
                  >
                    {businessName}
                  </Text>
                  <View className="flex-row items-center mt-0.5">
                    <MapPin size={11} color="#A855F7" />
                    <Text className="text-slate-400 text-xs ml-1" numberOfLines={1}>
                      {activeLocation?.name || 'No Branch Selected'}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                className={`p-1.5 rounded-xl border ${
                  isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <X size={18} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            {/* User Role Card */}
            <View
              className={`p-3.5 rounded-2xl my-4 border ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <Text className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Logged In Staff</Text>
              <Text
                className={`font-bold text-sm mt-0.5 ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {user?.name || 'Staff'}
              </Text>
              <View className="mt-1 bg-purple-500/10 px-2 py-0.5 rounded self-start border border-purple-500/20">
                <Text className="text-purple-400 text-[10px] font-bold">
                  ROLE: {user?.role || 'WAITER'}
                </Text>
              </View>
            </View>

            {/* Theme Mode Switcher Tile */}
            <TouchableOpacity
              onPress={toggleTheme}
              className={`flex-row items-center justify-between p-3 rounded-2xl mb-3 border ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <View className="flex-row items-center">
                {isDark ? (
                  <Sun size={18} color="#FBBF24" />
                ) : (
                  <Moon size={18} color="#6366F1" />
                )}
                <Text
                  className={`text-sm font-semibold ml-3 ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  Theme Mode
                </Text>
              </View>
              <View
                className={`px-2 py-0.5 rounded-full ${
                  isDark ? 'bg-amber-500/15' : 'bg-indigo-500/15'
                }`}
              >
                <Text
                  className={`text-[10px] font-bold ${
                    isDark ? 'text-amber-400' : 'text-indigo-600'
                  }`}
                >
                  {isDark ? '🌙 Dark' : '☀️ Light'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Navigation Items (Filtered by Role - Kitchen Staff gets 0 access to POS modules) */}
            {!isKitchenStaff && (
              <View className="space-y-1.5">
                {/* Tables & Floor Plan */}
                {features.tablesEnabled && (
                  <TouchableOpacity
                    onPress={() => navigateTo(Routes.TABLES)}
                    className={`flex-row items-center justify-between p-3 rounded-2xl ${
                      isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <LayoutGrid size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                      <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Floor Plan & Tables</Text>
                    </View>
                    <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>
                )}

                {/* Running Orders: Available to All */}
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.ORDERS)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <ClipboardList size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Orders History & Ledger</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>

              {/* Kitchen Inventory & Store Load */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.INVENTORY)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <Boxes size={18} color="#10B981" />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Kitchen Inventory & Stock</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>
              )}

              {/* Central Kitchen Hub: Supplier */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.CENTRAL_KITCHEN)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <ChefHat size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Central Kitchen Hub (Supply)</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>
              )}

              {/* Central Kitchen Ordering: Buyer Outlet */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.CENTRAL_KITCHEN_ORDERING)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <Store size={18} color={isDark ? '#38BDF8' : '#0284C7'} />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Order from Central Kitchen</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>
              )}

              {/* Menu Management: Managers and Admins */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.MENU_MANAGEMENT)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <Utensils size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Edit Menu & Favorites</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>
              )}

              {/* Printer Settings: Managers and Admins */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.SETTINGS)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <Printer size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Thermal Printers (LAN)</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>
              )}

              {/* Staff & User Management: Admin Only */}
              {isSuperAdmin && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.USER_MANAGEMENT)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <Users size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Staff & User Roles</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>
              )}

              {/* Branch Locations: Admin Only */}
              {isSuperAdmin && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.LOCATION_MANAGEMENT)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <Building size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Branch Management</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>
              )}

              {/* Store & Payment Settings: Managers and Admins */}
              {isManager && (
                <TouchableOpacity
                  onPress={() => navigateTo(Routes.BUSINESS_PROFILE)}
                  className={`flex-row items-center justify-between p-3 rounded-2xl ${
                    isDark ? 'active:bg-slate-800' : 'active:bg-slate-100'
                  }`}
                >
                  <View className="flex-row items-center">
                    <Settings size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                    <Text className={`text-sm font-semibold ml-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Store & Payment Settings</Text>
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </TouchableOpacity>
              )}
            </View>
            )}
          </ScrollView>

          {/* Logout Footer */}
          <View className={`pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            {/* App Version Row */}
            <View className="flex-row items-center justify-between px-2 pb-3 mb-1">
              <Text className="text-slate-500 text-xs font-medium">App Version</Text>
              <View
                className={`px-2.5 py-0.5 rounded-full border ${
                  isDark
                    ? 'bg-slate-800/80 border-slate-700/60'
                    : 'bg-slate-100 border-slate-200'
                }`}
              >
                <Text className="text-purple-500 text-xs font-bold font-mono">v{packageJson.version}</Text>
              </View>
            </View>

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
