import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Switch,
  Alert
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Menu as MenuIcon,
  LayoutGrid,
  Utensils,
  ShoppingBag,
  TrendingUp,
  MapPin,
  CheckCircle2,
  Lock,
  X,
  Printer,
  ChevronRight,
  Clock,
  Bike,
  Sparkles,
  Receipt,
  Bell,
  Users,
  Settings,
  Plus
} from 'lucide-react-native';
import { useTenantStore } from '../../store/tenant.store';
import { useOrderStore } from '../../store/order.store';
import { useTableStore } from '../../store/table.store';
import { usePrinterStore } from '../../store/printer.store';
import { useAuthStore } from '../../store/auth.store';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { HamburgerMenu } from '../../components/common/HamburgerMenu';
import { Button } from '../../components/common/Button';
import { Routes } from '../../constants/routes';

interface OnlineOrder {
  id: string;
  platform: 'zomato' | 'swiggy';
  orderNo: string;
  customerName: string;
  items: { name: string; qty: number; price: number }[];
  totalAmount: number;
  riderName?: string;
  riderPhone?: string;
  otp: string;
  status: 'NEW' | 'PREPARING' | 'READY';
  placedTime: string;
}

const INITIAL_ONLINE_ORDERS: OnlineOrder[] = [
  {
    id: 'ord_zom_1',
    platform: 'zomato',
    orderNo: '#ZOM-8492',
    customerName: 'Arjun S.',
    items: [
      { name: 'Butter Chicken', qty: 1, price: 340 },
      { name: 'Butter Naan', qty: 4, price: 160 },
      { name: 'Jeera Rice', qty: 1, price: 120 }
    ],
    totalAmount: 620,
    riderName: 'Ramesh (Zomato Rider)',
    riderPhone: '9876543210',
    otp: '4921',
    status: 'PREPARING',
    placedTime: '5 mins ago'
  },
  {
    id: 'ord_swg_1',
    platform: 'swiggy',
    orderNo: '#SWG-3190',
    customerName: 'Sneha R.',
    items: [
      { name: 'Paneer Tikka Biryani', qty: 1, price: 290 },
      { name: 'Gulab Jamun (2 pcs)', qty: 1, price: 90 }
    ],
    totalAmount: 380,
    riderName: 'Assigning Delivery Partner...',
    otp: '8812',
    status: 'NEW',
    placedTime: 'Just now'
  }
];

export const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { tenant, branding, features, locations, activeLocationId, setActiveLocationId, getActiveLocation } = useTenantStore();
  const { orders, subscribeToOrders } = useOrderStore();
  const { tables, subscribeToTables } = useTableStore();
  const { settings } = usePrinterStore();
  const { user } = useAuthStore();
  const { isLargePOS, isDesktop } = useResponsiveLayout();

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isBranchModalOpen, setBranchModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Zomato & Swiggy Online Store Status
  const [isZomatoOnline, setZomatoOnline] = useState(true);
  const [isSwiggyOnline, setSwiggyOnline] = useState(true);
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>(INITIAL_ONLINE_ORDERS);
  const [selectedAggregator, setSelectedAggregator] = useState<'zomato' | 'swiggy' | null>(null);

  useEffect(() => {
    const unsubOrders = subscribeToOrders();
    const unsubTables = subscribeToTables();
    return () => {
      unsubOrders();
      unsubTables();
    };
  }, [tenant?.id, activeLocationId]);

  const isClientAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';
  const activeLocation = getActiveLocation();
  const businessTitle = branding?.displayName || branding?.businessName || tenant?.businessName || 'Zentiq POS';

  const now = new Date();
  const todayOrders = orders.filter(o => {
    if (!o.createdAt) return false;
    const orderDate = new Date(o.createdAt.seconds ? o.createdAt.seconds * 1000 : o.createdAt);
    return (
      orderDate.getDate() === now.getDate() &&
      orderDate.getMonth() === now.getMonth() &&
      orderDate.getFullYear() === now.getFullYear()
    );
  });

  const todaySales = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const occupiedTables = tables.filter(t => 
    t.status === 'running' || 
    t.status === 'OCCUPIED' || 
    ((t as any).cartItems && (t as any).cartItems.length > 0)
  );
  const occupiedTablesCount = occupiedTables.length;
  const availableTablesCount = Math.max(0, tables.length - occupiedTablesCount);

  const zomatoOrdersCount = onlineOrders.filter(o => o.platform === 'zomato').length;
  const swiggyOrdersCount = onlineOrders.filter(o => o.platform === 'swiggy').length;
  const totalOnlineCount = zomatoOrdersCount + swiggyOrdersCount;

  const handleSelectBranch = (loc: any) => {
    if (loc.status === 'DISABLED') return;
    setActiveLocationId(loc.id);
    setBranchModalOpen(false);
  };

  const handleAcceptOnlineOrder = (orderId: string) => {
    setOnlineOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'PREPARING' } : o));
    Alert.alert('KOT Dispatched', 'Online order accepted! KOT sent to kitchen printer.');
  };

  const handleMarkOrderReady = (orderId: string) => {
    setOnlineOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'READY' } : o));
    Alert.alert('Rider Notified', 'Order marked ready! Delivery rider notified for pickup.');
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <HamburgerMenu isVisible={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Top Header */}
      <View className="flex-row items-center justify-between px-5 py-3.5 bg-[#111827] border-b border-slate-800">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={() => setSidebarOpen(true)}
            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 mr-3"
            accessibilityLabel="Open Navigation Menu"
          >
            <MenuIcon size={20} color="#CBD5E1" />
          </TouchableOpacity>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-white font-black text-lg" numberOfLines={1}>{businessTitle}</Text>
              {isDesktop && (
                <View className="bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded">
                  <Text className="text-indigo-300 text-[10px] font-bold">DESKTOP POS TERMINAL</Text>
                </View>
              )}
            </View>
            {isClientAdmin ? (
              <TouchableOpacity
                className="flex-row items-center mt-0.5"
                onPress={() => setBranchModalOpen(true)}
              >
                <MapPin size={12} color="#A855F7" />
                <Text className="text-purple-400 text-xs font-bold ml-1" numberOfLines={1}>
                  {activeLocation?.name || 'Tap to Select Branch'} ▾
                </Text>
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center mt-0.5">
                <MapPin size={12} color="#10B981" />
                <Text className="text-emerald-400 text-xs font-bold ml-1" numberOfLines={1}>
                  {activeLocation?.name || 'Assigned Branch'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Header Right Actions for Large POS */}
        {isLargePOS && (
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => navigation.navigate(Routes.ORDERS)}
              className="flex-row items-center bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl"
            >
              <Receipt size={14} color="#CBD5E1" />
              <Text className="text-slate-200 text-xs font-bold ml-1.5">Bill History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate(Routes.SETTINGS)}
              className="flex-row items-center bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl"
            >
              <Printer size={14} color={settings.ipAddress ? '#10B981' : '#F59E0B'} />
              <Text className="text-slate-200 text-xs font-bold ml-1.5">
                {settings.ipAddress ? 'Printer Connected' : 'Printer Offline'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Unselected Branch Alert Banner */}
      {isClientAdmin && !activeLocationId && (
        <View className="bg-amber-500/15 border-b border-amber-500/30 px-5 py-3 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-3">
            <MapPin size={18} color="#F59E0B" />
            <Text className="text-amber-300 text-xs font-bold ml-2">
              No branch active. Please pick a location to start taking orders.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setBranchModalOpen(true)}
            className="bg-amber-500 px-3 py-1 rounded-lg"
          >
            <Text className="text-black text-xs font-bold">Select</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: isLargePOS ? 24 : 16,
          paddingBottom: Math.max(insets.bottom + 36, 52),
          maxWidth: 1600,
          alignSelf: 'center',
          width: '100%'
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}
      >
        {/* Top 4 KPI Dashboard Cards */}
        <View className="flex-row flex-wrap gap-3 mb-6">
          <View className="flex-1 min-w-[160px] bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-md">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Today's Sales</Text>
              <TrendingUp size={16} color="#10B981" />
            </View>
            <Text className="text-white font-black text-2xl">₹{todaySales.toFixed(2)}</Text>
            <Text className="text-slate-500 text-[11px] mt-1">{todayOrders.length} order{todayOrders.length === 1 ? '' : 's'} recorded</Text>
          </View>

          <View className="flex-1 min-w-[160px] bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-md">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Today's Orders</Text>
              <ShoppingBag size={16} color="#818CF8" />
            </View>
            <Text className="text-white font-black text-2xl">{todayOrders.length}</Text>
            <Text className="text-slate-500 text-[11px] mt-1">Settled at this branch</Text>
          </View>

          <View className="flex-1 min-w-[160px] bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-md">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Table Occupancy</Text>
              <LayoutGrid size={16} color="#F59E0B" />
            </View>
            <View className="flex-row items-baseline gap-2">
              <Text className="text-amber-400 font-black text-2xl">{occupiedTablesCount}</Text>
              <Text className="text-slate-400 text-xs font-medium">/ {tables.length} Total</Text>
            </View>
            <Text className="text-emerald-400 text-[11px] mt-1">{availableTablesCount} available for guests</Text>
          </View>

          <View className="flex-1 min-w-[160px] bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-md">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Online Deliveries</Text>
              <Bike size={16} color="#E23744" />
            </View>
            <Text className="text-white font-black text-2xl">{totalOnlineCount}</Text>
            <Text className="text-slate-400 text-[11px] mt-1">Zomato & Swiggy active</Text>
          </View>
        </View>

        {/* Main Content Layout: Split 2-Column on Tablet/Desktop, Stacked on Mobile */}
        <View className={isLargePOS ? 'flex-row gap-6 items-start' : ''}>
          {/* Left Column (60% on desktop): Fast Launch & Live Table Grid */}
          <View className={isLargePOS ? 'flex-1' : ''}>
            {/* Launch New Order Actions */}
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white font-black text-lg">Launch New Order</Text>
              {isLargePOS && (
                <Text className="text-slate-500 text-xs">Equal Sized Launch Hub</Text>
              )}
            </View>

            <View className="flex-row gap-3 mb-6">
              {features.dineInEnabled !== false && (
                features.tablesEnabled ? (
                  <TouchableOpacity
                    className="flex-1 bg-[#5D3FD3] border border-indigo-500/40 p-4 rounded-3xl shadow-lg shadow-purple-500/25 items-center justify-center min-h-[148px]"
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate(Routes.TABLES)}
                  >
                    <View className="w-12 h-12 rounded-2xl bg-white/10 items-center justify-center mb-1">
                      <LayoutGrid size={26} color="white" />
                    </View>
                    <Text className="text-white font-black text-base mt-1">Dine In</Text>
                    <Text className="text-purple-200 text-xs font-medium">Select Table</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    className="flex-1 bg-[#5D3FD3] border border-indigo-500/40 p-4 rounded-3xl shadow-lg shadow-purple-500/25 items-center justify-center min-h-[148px]"
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate(Routes.MENU, { tableNo: 0, orderType: 'DINE_IN' })}
                  >
                    <View className="w-12 h-12 rounded-2xl bg-white/10 items-center justify-center mb-1">
                      <Utensils size={26} color="white" />
                    </View>
                    <Text className="text-white font-black text-base mt-1">Dine In</Text>
                    <Text className="text-purple-200 text-xs font-medium">Fast Counter</Text>
                  </TouchableOpacity>
                )
              )}

              {features.pickupEnabled !== false && (
                <TouchableOpacity
                  className="flex-1 bg-slate-900 border border-slate-700/80 p-4 rounded-3xl shadow-lg shadow-black/40 items-center justify-center min-h-[148px]"
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate(Routes.MENU, { tableNo: 0, orderType: 'PICKUP' })}
                >
                  <View className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 items-center justify-center mb-1">
                    <ShoppingBag size={26} color="#818CF8" />
                  </View>
                  <Text className="text-white font-black text-base mt-1">Pick Up</Text>
                  <Text className="text-slate-400 text-xs font-medium">Takeaway Parcel</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Live Interactive Floor & Table Quick Hub */}
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-6 shadow-md">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View className="flex-row items-center">
                  <LayoutGrid size={18} color="#818CF8" />
                  <Text className="text-white font-black text-base ml-2">Floor Tables Quick Access</Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate(Routes.TABLES)}
                  className="bg-purple-500/15 border border-purple-500/30 px-3 py-1 rounded-xl flex-row items-center"
                >
                  <Text className="text-purple-300 font-bold text-xs">Full Floor Plan →</Text>
                </TouchableOpacity>
              </View>

              {/* Table Quick Matrix */}
              {tables.length === 0 ? (
                <View className="py-8 items-center justify-center">
                  <Text className="text-slate-500 text-xs">No dining tables configured yet.</Text>
                  <TouchableOpacity
                    onPress={() => navigation.navigate(Routes.TABLES)}
                    className="mt-2 bg-[#5D3FD3] px-3 py-1 rounded-lg"
                  >
                    <Text className="text-white font-bold text-xs">+ Setup Tables</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="mt-4">
                  <View className="flex-row flex-wrap gap-2.5">
                    {tables.slice(0, isDesktop ? 18 : 10).map(item => {
                      const isOccupied = item.status === 'running' || item.status === 'OCCUPIED' || ((item as any).cartItems && (item as any).cartItems.length > 0);
                      const waiterName = (item as any).activeWaiterName;
                      const itemCount = (item as any).cartItems?.reduce((s: number, i: any) => s + (i.qty || 0), 0) || 0;

                      return (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => navigation.navigate(Routes.MENU, { tableId: item.id, tableNo: item.tableNo, orderType: 'DINE_IN' })}
                          className={'w-[78px] h-[78px] rounded-2xl border p-2 justify-between ' + (
                            isOccupied
                              ? 'bg-amber-950/30 border-amber-500/50'
                              : 'bg-emerald-950/20 border-emerald-500/40'
                          )}
                        >
                          <View className="flex-row items-center justify-between">
                            <View className={'w-2 h-2 rounded-full ' + (isOccupied ? 'bg-amber-500' : 'bg-emerald-500')} />
                            <Text className={'text-[9px] font-bold ' + (isOccupied ? 'text-amber-400' : 'text-emerald-400')}>
                              {isOccupied ? 'RUN' : 'AVL'}
                            </Text>
                          </View>
                          <Text className="text-white font-black text-center text-lg">{item.tableNo}</Text>
                          <Text className="text-slate-400 text-[9px] text-center" numberOfLines={1}>
                            {isOccupied && waiterName ? waiterName : (isOccupied && itemCount > 0 ? (itemCount + ' items') : 'Table')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {tables.length > (isDesktop ? 18 : 10) && (
                    <TouchableOpacity
                      onPress={() => navigation.navigate(Routes.TABLES)}
                      className="mt-3 py-1.5 bg-slate-800/80 rounded-xl items-center"
                    >
                      <Text className="text-slate-400 text-xs font-semibold">
                        + {tables.length - (isDesktop ? 18 : 10)} more tables in Floor Plan
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Right Column (40% on desktop): Aggregators & Hardware Station */}
          <View className={isLargePOS ? 'w-[400px]' : ''}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Bike size={18} color="#F59E0B" />
                <Text className="text-white font-black text-lg ml-2">Online Channels</Text>
              </View>
              <View className="bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                <Text className="text-amber-400 text-[10px] font-bold">Aggregator Sync</Text>
              </View>
            </View>

            {/* Zomato & Swiggy Cards */}
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-3xl justify-between">
                <View>
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="bg-[#E23744] px-2.5 py-1 rounded-lg shadow-sm">
                      <Text className="text-white font-black text-xs tracking-wider">ZOMATO</Text>
                    </View>
                    <Switch
                      value={isZomatoOnline}
                      onValueChange={setZomatoOnline}
                      trackColor={{ false: '#334155', true: '#E23744' }}
                      thumbColor={isZomatoOnline ? '#FFFFFF' : '#94A3B8'}
                    />
                  </View>
                  <Text className="text-white font-bold text-sm mt-1">
                    {isZomatoOnline ? 'Live & Accepting' : 'Store Paused'}
                  </Text>
                  <Text className="text-slate-400 text-[11px] mt-0.5">
                    {isZomatoOnline ? (zomatoOrdersCount + ' Incoming') : 'Offline'}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedAggregator('zomato')}
                  className="mt-3 bg-slate-800 border border-slate-700/80 py-2 px-3 rounded-xl flex-row items-center justify-between"
                >
                  <Text className="text-slate-200 text-xs font-semibold">Orders ({zomatoOrdersCount})</Text>
                  <ChevronRight size={14} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View className="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-3xl justify-between">
                <View>
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="bg-[#FC8019] px-2.5 py-1 rounded-lg shadow-sm">
                      <Text className="text-white font-black text-xs tracking-wider">SWIGGY</Text>
                    </View>
                    <Switch
                      value={isSwiggyOnline}
                      onValueChange={setSwiggyOnline}
                      trackColor={{ false: '#334155', true: '#FC8019' }}
                      thumbColor={isSwiggyOnline ? '#FFFFFF' : '#94A3B8'}
                    />
                  </View>
                  <Text className="text-white font-bold text-sm mt-1">
                    {isSwiggyOnline ? 'Live & Accepting' : 'Store Paused'}
                  </Text>
                  <Text className="text-slate-400 text-[11px] mt-0.5">
                    {isSwiggyOnline ? (swiggyOrdersCount + ' Incoming') : 'Offline'}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedAggregator('swiggy')}
                  className="mt-3 bg-slate-800 border border-slate-700/80 py-2 px-3 rounded-xl flex-row items-center justify-between"
                >
                  <Text className="text-slate-200 text-xs font-semibold">Orders ({swiggyOrdersCount})</Text>
                  <ChevronRight size={14} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Hardware Status & Quick Management Panel */}
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-4 mb-6 shadow-md">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Station & Hardware</Text>
              
              <View className="flex-row items-center justify-between py-2 border-b border-slate-800">
                <View className="flex-row items-center">
                  <Printer size={15} color={settings.ipAddress ? '#10B981' : '#F59E0B'} />
                  <Text className="text-slate-200 text-xs font-medium ml-2">Kitchen Thermal KOT</Text>
                </View>
                <Text className={'text-xs font-bold ' + (settings.ipAddress ? 'text-emerald-400' : 'text-amber-400')}>
                  {settings.ipAddress ? settings.ipAddress : 'Not Set'}
                </Text>
              </View>

              <View className="flex-row items-center justify-between py-2 border-b border-slate-800">
                <View className="flex-row items-center">
                  <CheckCircle2 size={15} color="#10B981" />
                  <Text className="text-slate-200 text-xs font-medium ml-2">Billing Shift</Text>
                </View>
                <Text className="text-emerald-400 text-xs font-bold">Active</Text>
              </View>

              {/* Management Shortcuts for Desktop Cashier */}
              <View className="flex-row gap-2 mt-3 pt-2">
                <TouchableOpacity
                  onPress={() => navigation.navigate(Routes.MENU_MANAGEMENT)}
                  className="flex-1 bg-slate-800 py-2 px-2.5 rounded-xl items-center"
                >
                  <Text className="text-slate-300 text-[11px] font-bold">Menu Setup</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate(Routes.ORDERS)}
                  className="flex-1 bg-slate-800 py-2 px-2.5 rounded-xl items-center"
                >
                  <Text className="text-slate-300 text-[11px] font-bold">Orders Log</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate(Routes.SETTINGS)}
                  className="flex-1 bg-slate-800 py-2 px-2.5 rounded-xl items-center"
                >
                  <Text className="text-slate-300 text-[11px] font-bold">Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Aggregator Live Orders Modal */}
      <Modal visible={selectedAggregator !== null} transparent animationType="slide">
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 max-h-[85%]">
            <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
              <View className="flex-row items-center">
                <View className={'px-2.5 py-1 rounded-lg mr-2 ' + (selectedAggregator === 'zomato' ? 'bg-[#E23744]' : 'bg-[#FC8019]')}>
                  <Text className="text-white font-black text-xs uppercase">{selectedAggregator}</Text>
                </View>
                <Text className="text-white font-black text-lg">Incoming Online Orders</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedAggregator(null)} className="p-1 rounded-full bg-slate-800">
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView className="mt-3">
              {onlineOrders.filter(o => o.platform === selectedAggregator).length === 0 ? (
                <View className="py-12 items-center">
                  <Bike size={36} color="#64748B" />
                  <Text className="text-slate-400 text-sm font-bold mt-2">No active orders from {selectedAggregator}</Text>
                </View>
              ) : (
                onlineOrders
                  .filter(o => o.platform === selectedAggregator)
                  .map(order => (
                    <View key={order.id} className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 mb-3">
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center">
                          <Text className="text-white font-black text-base mr-2">{order.orderNo}</Text>
                          <View className="bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                            <Text className="text-purple-300 text-[10px] font-bold">OTP: {order.otp}</Text>
                          </View>
                        </View>
                        <View className="flex-row items-center">
                          <Clock size={12} color="#94A3B8" />
                          <Text className="text-slate-400 text-[11px] ml-1">{order.placedTime}</Text>
                        </View>
                      </View>

                      <Text className="text-slate-300 text-xs font-semibold mb-2">Customer: {order.customerName}</Text>

                      <View className="bg-slate-900/90 rounded-xl p-3 mb-3 border border-slate-800">
                        {order.items.map((item, idx) => (
                          <View key={idx} className="flex-row justify-between py-1 border-b border-slate-800/60 last:border-b-0">
                            <Text className="text-slate-200 text-xs">{item.qty}x {item.name}</Text>
                            <Text className="text-slate-400 text-xs font-bold">₹{item.price}</Text>
                          </View>
                        ))}
                        <View className="flex-row justify-between pt-2 mt-1 border-t border-slate-800">
                          <Text className="text-slate-400 font-bold text-xs">Total Bill</Text>
                          <Text className="text-white font-black text-sm">₹{order.totalAmount}</Text>
                        </View>
                      </View>

                      {order.riderName && (
                        <View className="flex-row items-center mb-3 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl">
                          <Bike size={14} color="#818CF8" />
                          <Text className="text-indigo-300 text-xs font-medium ml-2 flex-1" numberOfLines={1}>
                            {order.riderName}
                          </Text>
                        </View>
                      )}

                      <View className="flex-row gap-2">
                        {order.status === 'NEW' && (
                          <TouchableOpacity
                            onPress={() => handleAcceptOnlineOrder(order.id)}
                            className="flex-1 bg-emerald-600 py-2.5 rounded-xl items-center justify-center flex-row shadow-sm"
                          >
                            <Printer size={15} color="white" />
                            <Text className="text-white font-bold text-xs ml-1.5">Accept & Print KOT</Text>
                          </TouchableOpacity>
                        )}

                        {order.status === 'PREPARING' && (
                          <TouchableOpacity
                            onPress={() => handleMarkOrderReady(order.id)}
                            className="flex-1 bg-amber-600 py-2.5 rounded-xl items-center justify-center flex-row shadow-sm"
                          >
                            <CheckCircle2 size={15} color="white" />
                            <Text className="text-white font-bold text-xs ml-1.5">Mark Food Ready (Alert Rider)</Text>
                          </TouchableOpacity>
                        )}

                        {order.status === 'READY' && (
                          <View className="flex-1 bg-slate-700/80 py-2.5 rounded-xl items-center justify-center flex-row">
                            <CheckCircle2 size={15} color="#10B981" />
                            <Text className="text-emerald-400 font-bold text-xs ml-1.5">Food Ready • Awaiting Rider</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Branch Selection Modal for Client Admin */}
      <Modal visible={isBranchModalOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/70 items-center justify-center p-5">
          <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl">
            <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
              <View className="flex-row items-center">
                <MapPin size={18} color="#A855F7" />
                <Text className="text-white font-black text-lg ml-2">Select Active Branch</Text>
              </View>
              <TouchableOpacity onPress={() => setBranchModalOpen(false)} className="p-1 rounded-full bg-slate-800">
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView className="my-3 max-h-72">
              {locations.map(loc => {
                const isSelected = activeLocationId === loc.id;
                const isDisabled = loc.status === 'DISABLED';
                return (
                  <TouchableOpacity
                    key={loc.id}
                    disabled={isDisabled}
                    onPress={() => handleSelectBranch(loc)}
                    className={'p-3.5 mb-2 rounded-2xl border flex-row items-center justify-between ' + (
                      isSelected
                        ? 'bg-purple-950/40 border-[#5D3FD3]'
                        : isDisabled
                        ? 'bg-slate-950/40 border-slate-850 opacity-40'
                        : 'bg-slate-800/80 border-slate-700/70'
                    )}
                  >
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center">
                        <Text className={'font-bold text-sm ' + (isSelected ? 'text-purple-300' : 'text-white')}>
                          {loc.name}
                        </Text>
                        {isDisabled && (
                          <View className="ml-2 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30">
                            <Text className="text-rose-300 text-[9px] font-bold">DISABLED</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>{loc.address}</Text>
                    </View>
                    {isSelected && <CheckCircle2 size={18} color="#A855F7" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
