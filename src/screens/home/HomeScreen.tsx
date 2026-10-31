import { toast } from '../../utils/toast';
import { MenuScreen } from '../menu/MenuScreen';
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
  Zap,
  Sliders,
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
  Boxes,
  ChefHat,
  Store,
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
import { useLiveOrderNotifications } from '../../hooks/useLiveOrderNotifications';
import { DBServices } from '../../services/firebase/db';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { AggregatorParserService } from '../../services/integrations/aggregatorParser.service';

export const HomeScreen = () => {
  useLiveOrderNotifications();
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
  const [selectedAggregator, setSelectedAggregator] = useState<'zomato' | 'swiggy' | null>(null);
  const [isSimulatingAggregator, setIsSimulatingAggregator] = useState(false);

  useEffect(() => {
    const unsubOrders = subscribeToOrders();
    const unsubTables = subscribeToTables();
    return () => {
      unsubOrders();
      unsubTables();
    };
  }, [tenant?.id, activeLocationId]);

  const isClientAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';
  const isManagerOrAbove = isClientAdmin || user?.role === 'PLATFORM_ADMIN' || user?.role === 'MANAGER' || user?.role === 'manager';
  const activeLocation = getActiveLocation();
  const businessTitle = branding?.displayName || branding?.businessName || tenant?.businessName || 'Zentiq POS';

  // Fast today boundaries in ms
  const { startOfTodayMs, endOfTodayMs } = React.useMemo(() => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { startOfTodayMs: start, endOfTodayMs: start + 86400000 };
  }, []);

  const { todayOrders, todaySales } = React.useMemo(() => {
    const todayList = orders.filter(o => {
      const raw: any = o.createdAt;
      if (!raw) return false;
      const t = raw.seconds !== undefined ? raw.seconds * 1000 : (typeof raw === 'number' ? raw : (raw instanceof Date ? raw.getTime() : (Date.parse(raw) || 0)));
      return t >= startOfTodayMs && t < endOfTodayMs;
    });
    const sales = todayList.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    return { todayOrders: todayList, todaySales: sales };
  }, [orders, startOfTodayMs, endOfTodayMs]);

  const { occupiedTablesCount, availableTablesCount } = React.useMemo(() => {
    const occupied = tables.filter(t => 
      t.status === 'running' || 
      t.status === 'OCCUPIED' || 
      ((t as any).cartItems && (t as any).cartItems.length > 0)
    );
    return {
      occupiedTablesCount: occupied.length,
      availableTablesCount: Math.max(0, tables.length - occupied.length)
    };
  }, [tables]);

  // LIVE Aggregator orders from real Firestore database (NO hardcoded fake data)
  const liveAggregatorOrders = React.useMemo(() => {
    return orders.filter(o => 
      (o.orderType === 'ONLINE_ZOMATO' || o.orderType === 'ONLINE_SWIGGY') &&
      o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
    );
  }, [orders]);

  const zomatoOrders = React.useMemo(() => 
    liveAggregatorOrders.filter(o => o.orderType === 'ONLINE_ZOMATO'),
    [liveAggregatorOrders]
  );

  const swiggyOrders = React.useMemo(() => 
    liveAggregatorOrders.filter(o => o.orderType === 'ONLINE_SWIGGY'),
    [liveAggregatorOrders]
  );

  const zomatoOrdersCount = zomatoOrders.length;
  const swiggyOrdersCount = swiggyOrders.length;
  const totalOnlineCount = liveAggregatorOrders.length;

  const handleSelectBranch = (loc: any) => {
    if (loc.status === 'DISABLED') return;
    setActiveLocationId(loc.id);
    setBranchModalOpen(false);
  };

  const handleAcceptOnlineOrder = async (order: any) => {
    try {
      // Print Kitchen KOT if printer configured
      const isKitchenUsb = settings.kitchenPrinterType === 'USB';
      const kitchenTarget = isKitchenUsb
        ? (settings.kitchenPrinterName || settings.printerName || 'POS-80')
        : (settings.kitchenIpAddress?.trim() || (settings.printerType === 'LAN' ? settings.ipAddress?.trim() : ''));
      const kitchenPort = settings.kitchenPort || settings.port || 9100;
      const kitchenType = isKitchenUsb ? 'USB' : 'LAN';

      if (kitchenTarget) {
        try {
          await printerService.connect(kitchenTarget, kitchenPort, kitchenType);
          const buffer = ESCPOSService.buildKOT(
            order.kotNo || order.orderNumber || 0,
            0,
            order.aggregatorPlatform || 'Online',
            (order.items || []).map((it: any) => ({
              itemName: it.itemName || it.name,
              qty: it.qty || 1,
              price: it.price || 0,
              note: it.note
            })),
            `ONLINE ${order.aggregatorPlatform || 'ORDER'} #${order.aggregatorOrderId || ''}`,
            order.orderType
          );
          await printerService.print(
            buffer,
            isKitchenUsb
              ? { printerType: 'USB', printerName: kitchenTarget }
              : { printerType: 'LAN', ip: kitchenTarget, port: kitchenPort }
          );
          await printerService.disconnect();
        } catch (printErr: any) {
          console.warn('Printer warning in online order accept:', printErr?.message);
        }
      }

      toast.success(`Online order #${order.aggregatorOrderId || order.kotNo} accepted & KOT dispatched!`, 'KOT Sent');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept order', 'Error');
    }
  };

  const handleMarkOrderReady = async (orderId: string, orderDisplayNo: string) => {
    try {
      await DBServices.updateOrderStatus(orderId, 'COMPLETED', tenant?.id, activeLocationId || undefined);
      toast.success(`Order #${orderDisplayNo} marked Food Ready & Completed!`, 'Dispatched');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to complete order', 'Error');
    }
  };

  const handleCancelOnlineOrder = async (orderId: string, orderDisplayNo: string) => {
    Alert.alert(
      'Cancel Online Order',
      `Are you sure you want to cancel order #${orderDisplayNo}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await DBServices.updateOrderStatus(orderId, 'CANCELLED', tenant?.id, activeLocationId || undefined);
              toast.info(`Order #${orderDisplayNo} has been cancelled.`);
            } catch (e: any) {
              toast.error(e?.message || 'Failed to cancel', 'Error');
            }
          }
        }
      ]
    );
  };

  const handleSimulateTestOrder = async (platform: 'ZOMATO' | 'SWIGGY') => {
    if (!tenant?.id) return;
    setIsSimulatingAggregator(true);
    try {
      const res = await DBServices.simulateTestAggregatorOrder(tenant.id, platform, activeLocationId || undefined);
      toast.success(`${platform} Order #${res.kotNo} Ingested! It is now live in POS.`);
    } catch (e: any) {
      toast.error(e?.message || 'Simulation error', 'Error');
    } finally {
      setIsSimulatingAggregator(false);
    }
  };

// Direct counter billing handled gracefully within dashboard (no deadlock)

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
            {isManagerOrAbove && (
              <TouchableOpacity
                onPress={() => navigation.navigate(Routes.INVENTORY)}
                className="flex-row items-center bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl"
              >
                <Boxes size={14} color="#34D399" />
                <Text className="text-slate-200 text-xs font-bold ml-1.5">Kitchen Inventory</Text>
              </TouchableOpacity>
            )}

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
        {/* MOBILE VIEW (< 768px): Thumb-friendly Hero Order Launch & Aggregators directly at top */}
        {!isLargePOS ? (
          <View className="space-y-4">
            {/* 1. HERO ORDER LAUNCH HUB (Immediately accessible, zero scrolling) */}
            <View>
              <View className="flex-row items-center justify-between mb-2.5">
                <Text className="text-white font-black text-base tracking-tight">New Order</Text>
                <View className="flex-row items-center bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
                  <Text className="text-emerald-400 text-[10px] font-bold">POS Ready</Text>
                </View>
              </View>

              {/* Fallback Banner when Dine-In and Pickup are both disabled */}
              {features.dineInEnabled === false && features.pickupEnabled === false && (
                <View className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-4 py-3 mb-3 flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-3">
                    <Sliders size={16} color="#A78BFA" />
                    <Text className="text-indigo-200 text-xs ml-2 flex-1">
                      Dine-in floor and pickup are turned off. Running in Direct Counter Billing mode.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => navigation.navigate(Routes.SETTINGS)}
                    className="bg-indigo-600 px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-white text-xs font-bold">Settings</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View className="flex-row gap-3">
                {features.dineInEnabled === false && features.pickupEnabled === false && (
                  <TouchableOpacity
                    className="flex-1 bg-gradient-to-br from-[#6A45F7] to-[#4F30D1] border border-indigo-400/40 p-4 rounded-3xl shadow-xl justify-between min-h-[135px]"
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate(Routes.MENU, { tableNo: 0, orderType: 'COUNTER' })}
                    style={{ backgroundColor: '#5D3FD3' }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="w-11 h-11 rounded-2xl bg-white/15 items-center justify-center">
                        <Zap size={22} color="white" />
                      </View>
                      <View className="bg-black/25 px-2 py-0.5 rounded-lg border border-white/10">
                        <Text className="text-purple-100 text-[10px] font-bold">Counter Billing</Text>
                      </View>
                    </View>
                    <View>
                      <Text className="text-white font-black text-xl">Quick Counter Sale</Text>
                      <Text className="text-purple-200 text-xs font-medium mt-0.5">Direct Fast Billing Mode</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {features.dineInEnabled !== false && (
                  features.tablesEnabled ? (
                    <TouchableOpacity
                      className="flex-1 bg-gradient-to-br from-[#6A45F7] to-[#4F30D1] border border-indigo-400/40 p-4 rounded-3xl shadow-xl shadow-purple-500/30 justify-between min-h-[135px]"
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate(Routes.TABLES)}
                      style={{ backgroundColor: '#5D3FD3' }}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="w-11 h-11 rounded-2xl bg-white/15 items-center justify-center">
                          <Utensils size={22} color="white" />
                        </View>
                        <View className="bg-black/25 px-2 py-0.5 rounded-lg border border-white/10">
                          <Text className="text-purple-100 text-[10px] font-bold">
                            {occupiedTablesCount} Busy • {availableTablesCount} Free
                          </Text>
                        </View>
                      </View>
                      <View>
                        <Text className="text-white font-black text-xl">Dine In</Text>
                        <Text className="text-purple-200 text-xs font-medium mt-0.5">Select Table Floor</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      className="flex-1 bg-[#5D3FD3] border border-indigo-400/40 p-4 rounded-3xl shadow-xl shadow-purple-500/30 justify-between min-h-[135px]"
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate(Routes.MENU, { tableNo: 0, orderType: 'DINE_IN' })}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="w-11 h-11 rounded-2xl bg-white/15 items-center justify-center">
                          <Utensils size={22} color="white" />
                        </View>
                        <View className="bg-black/25 px-2 py-0.5 rounded-lg border border-white/10">
                          <Text className="text-purple-100 text-[10px] font-bold">Counter</Text>
                        </View>
                      </View>
                      <View>
                        <Text className="text-white font-black text-xl">Dine In</Text>
                        <Text className="text-purple-200 text-xs font-medium mt-0.5">Fast Direct Order</Text>
                      </View>
                    </TouchableOpacity>
                  )
                )}

                {features.pickupEnabled !== false && (
                  <TouchableOpacity
                    className="flex-1 bg-slate-900 border border-slate-700/90 p-4 rounded-3xl shadow-xl shadow-black/40 justify-between min-h-[135px]"
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate(Routes.MENU, { tableNo: 0, orderType: 'PICKUP' })}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 items-center justify-center">
                        <ShoppingBag size={22} color="#818CF8" />
                      </View>
                      <View className="bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700">
                        <Text className="text-indigo-300 text-[10px] font-bold">Parcel</Text>
                      </View>
                    </View>
                    <View>
                      <Text className="text-white font-black text-xl">Pick Up</Text>
                      <Text className="text-slate-400 text-xs font-medium mt-0.5">Takeaway Counter</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* 2. ONLINE DELIVERY HUB (Swiggy & Zomato Channels) */}
            <View className="mt-2">
              <View className="flex-row items-center justify-between mb-2.5">
                <View className="flex-row items-center">
                  <Bike size={16} color="#F59E0B" />
                  <Text className="text-white font-black text-base tracking-tight ml-1.5">Online Deliveries</Text>
                </View>
                <View className="bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  <Text className="text-amber-400 text-[10px] font-bold">{totalOnlineCount} Active</Text>
                </View>
              </View>

              <View className="flex-row gap-3">
                {/* Zomato Card */}
                <View className="flex-1 bg-[#161219] border border-red-950/60 p-3.5 rounded-3xl justify-between">
                  <View>
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="bg-[#E23744] px-2.5 py-0.5 rounded-md shadow-sm">
                        <Text className="text-white font-black text-[11px] tracking-wider">ZOMATO</Text>
                      </View>
                      <Switch
                        value={isZomatoOnline}
                        onValueChange={setZomatoOnline}
                        trackColor={{ false: '#334155', true: '#E23744' }}
                        thumbColor={isZomatoOnline ? '#FFFFFF' : '#94A3B8'}
                      />
                    </View>
                    <Text className="text-white font-bold text-xs mt-0.5">
                      {isZomatoOnline ? 'Live Store' : 'Paused'}
                    </Text>
                    <Text className="text-slate-400 text-[10px]">
                      {isZomatoOnline ? `${zomatoOrdersCount} Incoming` : 'Offline'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => setSelectedAggregator('zomato')}
                    className="mt-3 bg-slate-900 border border-slate-800 py-1.5 px-2.5 rounded-xl flex-row items-center justify-between"
                  >
                    <Text className="text-slate-200 text-[11px] font-bold">Orders ({zomatoOrdersCount})</Text>
                    <ChevronRight size={13} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* Swiggy Card */}
                <View className="flex-1 bg-[#191512] border border-amber-950/60 p-3.5 rounded-3xl justify-between">
                  <View>
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="bg-[#FC8019] px-2.5 py-0.5 rounded-md shadow-sm">
                        <Text className="text-white font-black text-[11px] tracking-wider">SWIGGY</Text>
                      </View>
                      <Switch
                        value={isSwiggyOnline}
                        onValueChange={setSwiggyOnline}
                        trackColor={{ false: '#334155', true: '#FC8019' }}
                        thumbColor={isSwiggyOnline ? '#FFFFFF' : '#94A3B8'}
                      />
                    </View>
                    <Text className="text-white font-bold text-xs mt-0.5">
                      {isSwiggyOnline ? 'Live Store' : 'Paused'}
                    </Text>
                    <Text className="text-slate-400 text-[10px]">
                      {isSwiggyOnline ? `${swiggyOrdersCount} Incoming` : 'Offline'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => setSelectedAggregator('swiggy')}
                    className="mt-3 bg-slate-900 border border-slate-800 py-1.5 px-2.5 rounded-xl flex-row items-center justify-between"
                  >
                    <Text className="text-slate-200 text-[11px] font-bold">Orders ({swiggyOrdersCount})</Text>
                    <ChevronRight size={13} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* 3. SLEEK COMPACT OPERATIONS GLANCE */}
            <View className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3.5 mt-2">
              <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
                <Text className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Today's Operations Glance</Text>
                <TouchableOpacity onPress={() => navigation.navigate(Routes.ORDERS)}>
                  <Text className="text-indigo-400 text-[11px] font-bold">View History →</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center justify-between divide-x divide-slate-800">
                <View className="flex-1 pr-2">
                  <Text className="text-slate-400 text-[10px] uppercase font-semibold">Sales</Text>
                  <Text className="text-white font-black text-base mt-0.5">₹{todaySales.toFixed(0)}</Text>
                </View>
                <View className="flex-1 px-2">
                  <Text className="text-slate-400 text-[10px] uppercase font-semibold">Orders</Text>
                  <Text className="text-white font-black text-base mt-0.5">{todayOrders.length}</Text>
                </View>
                <View className="flex-1 pl-2">
                  <Text className="text-slate-400 text-[10px] uppercase font-semibold">Tables</Text>
                  <Text className="text-amber-400 font-black text-base mt-0.5">{occupiedTablesCount}/{tables.length}</Text>
                </View>
              </View>
            </View>

            {/* Quick Kitchen Inventory Banner - Store Manager and Above */}
            {isManagerOrAbove && (
              <TouchableOpacity
                onPress={() => navigation.navigate(Routes.INVENTORY)}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-3.5 mt-2 flex-row items-center justify-between active:bg-slate-850"
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <View className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mr-3">
                    <Boxes size={20} color="#34D399" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-bold text-sm">Kitchen Inventory & Stock</Text>
                    <Text className="text-slate-400 text-[11px] mt-0.5">Track raw bulk loads, kitchen issues & balance</Text>
                  </View>
                </View>
                <ChevronRight size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}

            {/* Central Kitchen B2B Banners */}
            {isManagerOrAbove && (
              <View className="flex-row gap-2 mt-2">
                <TouchableOpacity
                  onPress={() => navigation.navigate(Routes.CENTRAL_KITCHEN_ORDERING)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-3 flex-row items-center active:bg-slate-850"
                >
                  <View className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 items-center justify-center mr-2.5">
                    <Store size={18} color="#38BDF8" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-bold text-xs">Order Bulk Food</Text>
                    <Text className="text-slate-400 text-[10px]" numberOfLines={1}>From Central Kitchen</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate(Routes.CENTRAL_KITCHEN)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-3 flex-row items-center active:bg-slate-850"
                >
                  <View className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 items-center justify-center mr-2.5">
                    <ChefHat size={18} color="#818CF8" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-bold text-xs">CK Hub</Text>
                    <Text className="text-slate-400 text-[10px]" numberOfLines={1}>Manage B2B Orders</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          /* DESKTOP / LARGE POS VIEW (>= 768px): Enterprise Multi-Column Dashboard */
          <>
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

            {/* Main Content Layout: Split 2-Column on Desktop */}
            <View className="flex-row gap-6 items-start">
              {/* Left Column (60%): Fast Launch & Live Table Grid */}
              <View className="flex-1">
                {/* Launch New Order Actions */}
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-white font-black text-lg">Launch New Order</Text>
                  <Text className="text-slate-500 text-xs">Equal Sized Launch Hub</Text>
                </View>

                {features.dineInEnabled === false && features.pickupEnabled === false && (
                  <View className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-4 py-3 mb-4 flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 mr-3">
                      <Sliders size={16} color="#A78BFA" />
                      <Text className="text-indigo-200 text-xs ml-2 flex-1">
                        Dine-in floor and pickup are turned off. Running in Direct Counter Billing mode.
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => navigation.navigate(Routes.SETTINGS)}
                      className="bg-indigo-600 px-3 py-1.5 rounded-xl"
                    >
                      <Text className="text-white text-xs font-bold">Settings</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View className="flex-row gap-3 mb-6">
                  {features.dineInEnabled === false && features.pickupEnabled === false && (
                    <TouchableOpacity
                      className="flex-1 bg-[#5D3FD3] border border-indigo-500/40 p-4 rounded-3xl shadow-lg shadow-purple-500/25 items-center justify-center min-h-[148px]"
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate(Routes.MENU, { tableNo: 0, orderType: 'COUNTER' })}
                    >
                      <View className="w-12 h-12 rounded-2xl bg-white/10 items-center justify-center mb-1">
                        <Zap size={26} color="white" />
                      </View>
                      <Text className="text-white font-black text-base mt-1">Quick Counter Sale</Text>
                      <Text className="text-purple-200 text-xs font-medium">Direct Fast Billing Mode</Text>
                    </TouchableOpacity>
                  )}

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

                {/* Live Interactive Floor & Table Quick Hub (Only shown when dining tables are enabled) */}
                  {features.tablesEnabled !== false && features.dineInEnabled !== false && (
                  <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-6 shadow-md">
                  <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                    <View className="flex-row items-center">
                      <LayoutGrid size={18} color="#818CF8" />
                      <Text className="text-white font-black text-base ml-2">Floor Tables Quick Access</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => navigation.navigate(Routes.TABLES)}
                      className="bg-purple-500/15 border border-purple-500/30 px-3 py-1 rounded-xl flex-row items-center shrink-0"
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
                        className="mt-2 bg-[#5D3FD3] px-3 py-1 rounded-lg shrink-0"
                      >
                        <Text className="text-white font-bold text-xs">+ Setup Tables</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className="mt-4">
                      <View className="flex-row flex-wrap gap-2.5">
                        {tables.slice(0, 18).map(item => {
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

                      {tables.length > 18 && (
                        <TouchableOpacity
                          onPress={() => navigation.navigate(Routes.TABLES)}
                          className="mt-3 py-1.5 bg-slate-800/80 rounded-xl items-center"
                        >
                          <Text className="text-slate-400 text-xs font-semibold">
                            + {tables.length - 18} more tables in Floor Plan
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
                  )}
                </View>

                {/* Right Column (40%): Aggregators & Hardware Station */}
              <View className="w-[400px]">
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
          </>
        )}
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
              {(selectedAggregator === 'zomato' ? zomatoOrders : swiggyOrders).length === 0 ? (
                <View className="py-8 px-4 items-center">
                  <View className="w-14 h-14 rounded-full bg-slate-800 items-center justify-center mb-3">
                    <Bike size={28} color="#94A3B8" />
                  </View>
                  <Text className="text-white text-base font-bold text-center">
                    No Active Orders from {selectedAggregator === 'zomato' ? 'Zomato' : 'Swiggy'}
                  </Text>
                  <Text className="text-slate-400 text-xs text-center mt-1.5 leading-relaxed max-w-xs">
                    Orders placed on {selectedAggregator === 'zomato' ? 'Zomato' : 'Swiggy'} will automatically appear here once forwarded via email or when simulated.
                  </Text>

                  {/* 1-Tap Simulation Button to Test Real Order Flow */}
                  <TouchableOpacity
                    disabled={isSimulatingAggregator}
                    onPress={() => handleSimulateTestOrder(selectedAggregator === 'zomato' ? 'ZOMATO' : 'SWIGGY')}
                    className={'mt-5 px-5 py-3 rounded-2xl flex-row items-center ' + (
                      selectedAggregator === 'zomato' ? 'bg-[#E23744]' : 'bg-[#FC8019]'
                    )}
                  >
                    <Sparkles size={16} color="white" />
                    <Text className="text-white font-bold text-xs ml-2">
                      {isSimulatingAggregator
                        ? 'Simulating Order...'
                        : `Test Live ${selectedAggregator === 'zomato' ? 'Zomato' : 'Swiggy'} Order`}
                    </Text>
                  </TouchableOpacity>

                  <View className="mt-5 p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl w-full">
                    <Text className="text-slate-400 text-[11px] leading-relaxed">
                      💡 <Text className="font-bold text-slate-300">How to automate:</Text> Set up auto-forwarding from your registered restaurant email for {selectedAggregator === 'zomato' ? 'Zomato' : 'Swiggy'} notifications.
                    </Text>
                  </View>
                </View>
              ) : (
                (selectedAggregator === 'zomato' ? zomatoOrders : swiggyOrders).map(order => {
                  const orderDisplayNo = order.aggregatorOrderId || String(order.kotNo || order.orderNumber || order.id);
                  const isPaid = order.paymentStatus === 'PAID';
                  return (
                    <View key={order.id} className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 mb-3">
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center flex-wrap gap-1.5 flex-1 mr-2">
                          <Text className="text-white font-black text-base">#{orderDisplayNo}</Text>
                          <View className="bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                            <Text className="text-emerald-300 text-[10px] font-bold">
                              {isPaid ? 'PAID ONLINE' : 'PAY ON DELIVERY'}
                            </Text>
                          </View>
                        </View>
                        <View className="flex-row items-center shrink-0">
                          <Clock size={12} color="#94A3B8" />
                          <Text className="text-slate-400 text-[11px] ml-1">
                            {order.createdAt ? 'Active' : 'Live'}
                          </Text>
                        </View>
                      </View>

                      <Text className="text-slate-300 text-xs font-semibold mb-2">
                        Customer: {order.customerName || 'Online Diner'} {order.customerPhone ? `(${order.customerPhone})` : ''}
                      </Text>

                      <View className="bg-slate-900/90 rounded-xl p-3 mb-3 border border-slate-800">
                        {(order.items || []).map((item: any, idx: number) => (
                          <View key={idx} className="flex-row justify-between py-1 border-b border-slate-800/60 last:border-b-0">
                            <Text className="text-slate-200 text-xs flex-1 mr-2">
                              {item.qty || 1}x {item.itemName || item.name}
                            </Text>
                            <Text className="text-slate-400 text-xs font-bold">
                              ₹{Number(item.price || 0) * Number(item.qty || 1)}
                            </Text>
                          </View>
                        ))}
                        <View className="flex-row justify-between pt-2 mt-1 border-t border-slate-800">
                          <Text className="text-slate-400 font-bold text-xs">Total Bill</Text>
                          <Text className="text-white font-black text-sm">₹{Number(order.totalAmount || 0).toFixed(2)}</Text>
                        </View>
                      </View>

                      {order.deliveryRiderName && (
                        <View className="flex-row items-center mb-3 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl">
                          <Bike size={14} color="#818CF8" />
                          <Text className="text-indigo-300 text-xs font-medium ml-2 flex-1" numberOfLines={1}>
                            {order.deliveryRiderName} {order.deliveryRiderPhone ? `• ${order.deliveryRiderPhone}` : ''}
                          </Text>
                        </View>
                      )}

                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => handleAcceptOnlineOrder(order)}
                          className="flex-1 bg-emerald-600 py-2.5 rounded-xl items-center justify-center flex-row shadow-sm active:bg-emerald-700"
                        >
                          <Printer size={15} color="white" />
                          <Text className="text-white font-bold text-xs ml-1.5">Accept & Print KOT</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleMarkOrderReady(order.id, orderDisplayNo)}
                          className="flex-1 bg-amber-600 py-2.5 rounded-xl items-center justify-center flex-row shadow-sm active:bg-amber-700"
                        >
                          <CheckCircle2 size={15} color="white" />
                          <Text className="text-white font-bold text-xs ml-1.5">Food Ready / Settle</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleCancelOnlineOrder(order.id, orderDisplayNo)}
                          className="px-3 bg-rose-600/20 border border-rose-500/30 py-2.5 rounded-xl items-center justify-center"
                        >
                          <X size={15} color="#F43F5E" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
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
