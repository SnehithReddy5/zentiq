import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search,
  MapPin,
  Receipt,
  CheckCircle2,
  ShoppingBag,
  TrendingUp,
  Award,
  Clock,
  Printer,
  X,
  User,
  CreditCard,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Utensils,
  ArrowLeft,
  Trash2
} from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useOrderStore } from '../../store/order.store';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { usePrinterStore } from '../../store/printer.store';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { DBServices } from '../../services/firebase/db';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export const RunningOrdersScreen = () => {
  const insets = useSafeAreaInsets();
  const { orders, subscribeToOrders, isLoading } = useOrderStore();
  const { tenant, locations, activeLocationId, branding } = useTenantStore();
  const { settings } = usePrinterStore();
  const { user } = useAuthStore();
  const { ordersGridColumns, isLargePOS } = useResponsiveLayout();
  const isClientAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';

  // Location filter: defaults to active branch or 'ALL'
  const staffBranch = activeLocationId || (user?.locationIds && user.locationIds[0] !== '*' ? user.locationIds[0] : null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    isClientAdmin ? (activeLocationId || (locations[0]?.id || 'ALL')) : (staffBranch || 'ALL')
  );
  const [search, setSearch] = useState('');
  const [selectedOrderTypeFilter, setSelectedOrderTypeFilter] = useState<'ALL' | 'DINE_IN' | 'PICKUP' | 'TAKEAWAY'>('ALL');

  // Modal & Reprint states
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isReprinting, setIsReprinting] = useState(false);
  const [isReprintingKitchen, setIsReprintingKitchen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Subscribe dynamically to the selected location
  useEffect(() => {
    const unsub = subscribeToOrders(selectedLocationId);
    return () => unsub();
  }, [tenant?.id, selectedLocationId]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Order type filter
      if (selectedOrderTypeFilter === 'DINE_IN' && (!o.tableNo || o.orderType === 'PICKUP' || o.orderType === 'TAKEAWAY')) {
        return false;
      }
      if (selectedOrderTypeFilter === 'PICKUP' && o.orderType !== 'PICKUP') {
        return false;
      }
      if (selectedOrderTypeFilter === 'TAKEAWAY' && o.orderType !== 'TAKEAWAY') {
        return false;
      }

      // Search query filter
      if (!search.trim()) return true;
      const searchTarget = `${o.kotNo || ''} ${o.orderNumber || ''} ${o.tableNo || ''} ${o.captainName || ''} ${o.orderType || ''} ${o.locationName || ''}`;
      return searchTarget.toLowerCase().includes(search.toLowerCase());
    });
  }, [orders, search, selectedOrderTypeFilter]);

  // Rich KPIs & Analytics Calculations
  const stats = useMemo(() => {
    const totalOrdersCount = filteredOrders.length;
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const averageOrderValue = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;

    let highestOrderAmount = 0;
    let highestOrderKOT = 'None';
    filteredOrders.forEach(o => {
      const amt = Number(o.totalAmount) || 0;
      if (amt > highestOrderAmount) {
        highestOrderAmount = amt;
        highestOrderKOT = o.orderNumber ? `#${o.orderNumber}` : (o.kotNo ? `KOT #${o.kotNo}` : `#${o.id.slice(0, 5)}`);
      }
    });

    const dineInCount = filteredOrders.filter(o => o.tableNo && o.orderType !== 'PICKUP' && o.orderType !== 'TAKEAWAY').length;
    const pickupCount = filteredOrders.filter(o => o.orderType === 'PICKUP').length;
    const takeawayCount = filteredOrders.filter(o => o.orderType === 'TAKEAWAY').length;

    return {
      totalOrdersCount,
      totalRevenue,
      averageOrderValue,
      highestOrderAmount,
      highestOrderKOT,
      dineInCount,
      pickupCount,
      takeawayCount
    };
  }, [filteredOrders]);

  // Reprint Bill handler
  const handleReprintBill = async (order: any) => {
    const targetIp = settings.ipAddress?.trim();
    const targetPort = settings.port || 9100;
    if (!targetIp) {
      Alert.alert(
        'Billing Printer Required',
        'Please enter your Billing Printer IP in Settings -> Thermal Printers first.'
      );
      return;
    }

    setIsReprinting(true);
    try {
      await printerService.connect(targetIp, targetPort);
      const buffer = ESCPOSService.buildBill(
        order.orderNumber || order.kotNo || order.id.slice(0, 6),
        order.tableNo || 0,
        order.captainName || 'Staff',
        order.items || [],
        branding || null,
        order.orderType || (order.tableNo ? 'DINE_IN' : 'PICKUP'),
        order.payments && order.payments.length > 0
          ? order.payments
          : [{ method: order.paymentMethod || 'CASH', amount: order.totalAmount || 0 }]
      );
      await printerService.print(buffer);
      await printerService.disconnect();
      setToastMessage(`Receipt for Bill #${order.orderNumber || order.kotNo || order.id.slice(0, 6)} reprinted!`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (e: any) {
      Alert.alert('Printer Error', `Could not connect to billing printer at ${targetIp}: ${e.message}`);
    } finally {
      setIsReprinting(false);
    }
  };

  // Reprint Kitchen KOT handler
  const handleReprintKitchenKOT = async (order: any) => {
    const targetIp = (settings.kitchenIpAddress || settings.ipAddress)?.trim();
    const targetPort = settings.kitchenPort || settings.port || 9100;
    if (!targetIp) {
      Alert.alert('Kitchen Printer Required', 'Please configure Kitchen Printer IP in Settings first.');
      return;
    }

    setIsReprintingKitchen(true);
    try {
      await printerService.connect(targetIp, targetPort);
      const buffer = ESCPOSService.buildKOT(
        order.kotNo || `RE-${order.id.slice(0, 5)}`,
        order.tableNo || 0,
        order.captainName || 'Staff',
        order.items || [],
        'DUPLICATE / REPRINT KOT',
        order.orderType || (order.tableNo ? 'DINE_IN' : 'PICKUP')
      );
      await printerService.print(buffer);
      await printerService.disconnect();
      setToastMessage(`Kitchen KOT reprinted successfully!`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (e: any) {
      Alert.alert('Kitchen Printer Error', `Failed to print KOT: ${e.message}`);
    } finally {
      setIsReprintingKitchen(false);
    }
  };

  // Delete Order handler (Admin / Manager only)
  const handleDeleteOrder = (id: string, kotNo: number | string) => {
    Alert.alert(
      'Delete Order',
      `Are you sure you want to delete Order #${kotNo}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await DBServices.deleteOrder(id, tenant?.id, activeLocationId || undefined);
              setSelectedOrder(null);
              setToastMessage('Order deleted successfully');
              setTimeout(() => setToastMessage(null), 3000);
            } catch (e: any) {
              Alert.alert('Error', `Could not delete order: ${e.message}`);
            }
          }
        }
      ]
    );
  };

  const formatOrderDate = (createdAt: any) => {
    if (!createdAt) return 'Just now';
    const date = typeof createdAt.toDate === 'function' 
      ? createdAt.toDate() 
      : new Date(createdAt.seconds ? createdAt.seconds * 1000 : createdAt);
      
    if (isNaN(date.getTime())) return 'Just now';

    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Orders History & Settlements"
        subtitle={`${filteredOrders.length} Completed / Running Orders`}
      />

      {/* Floating Success Toast */}
      {toastMessage && (
        <View className="absolute top-16 left-6 right-6 z-50 bg-emerald-500 p-3.5 rounded-2xl shadow-xl flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <CheckCircle2 size={18} color="white" />
            <Text className="text-white font-bold text-xs ml-2">{toastMessage}</Text>
          </View>
          <TouchableOpacity onPress={() => setToastMessage(null)}>
            <X size={16} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Top Filter & Search Bar */}
      <View className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        {/* Branch Selector Pill if Multi-Branch */}
        {locations.length > 1 && (
          <View className="mb-2.5">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-1.5">
              <TouchableOpacity
                onPress={() => setSelectedLocationId('ALL')}
                className={`px-3 py-1 rounded-full border ${
                  selectedLocationId === 'ALL'
                    ? 'bg-[#5D3FD3] border-purple-500'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <Text className={`text-xs font-bold ${selectedLocationId === 'ALL' ? 'text-white' : 'text-slate-400'}`}>
                  All Branches
                </Text>
              </TouchableOpacity>

              {locations.map(loc => (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => setSelectedLocationId(loc.id)}
                  className={`px-3 py-1 rounded-full border ${
                    selectedLocationId === loc.id
                      ? 'bg-[#5D3FD3] border-purple-500'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <Text className={`text-xs font-bold ${selectedLocationId === loc.id ? 'text-white' : 'text-slate-400'}`}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View className="flex-row gap-2 items-center">
          {/* Search Box */}
          <View className="flex-1 flex-row items-center bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2">
            <Search size={16} color="#64748B" />
            <TextInput
              placeholder="Search by Bill #, KOT #, Table, or Cashier..."
              placeholderTextColor="#64748B"
              value={search}
              onChangeText={setSearch}
              className="flex-1 text-white text-xs ml-2 py-0"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={14} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Filter: All / Dine In / Pickup */}
          <View className="flex-row bg-slate-950 p-1 rounded-2xl border border-slate-800">
            {(['ALL', 'DINE_IN', 'PICKUP'] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setSelectedOrderTypeFilter(f)}
                className={`px-2.5 py-1.5 rounded-xl ${
                  selectedOrderTypeFilter === f ? 'bg-[#5D3FD3]' : 'bg-transparent'
                }`}
              >
                <Text className={`text-[11px] font-bold ${
                  selectedOrderTypeFilter === f ? 'text-white' : 'text-slate-400'
                }`}>
                  {f === 'ALL' ? 'All' : f === 'DINE_IN' ? 'Dine In' : 'Pick Up'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Orders List with Analytics Header */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#5D3FD3" />
          <Text className="text-slate-400 text-xs font-medium mt-3">Loading orders history...</Text>
        </View>
      ) : (
        <FlatList
          key={ordersGridColumns}
          data={filteredOrders}
          numColumns={ordersGridColumns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: Math.max(insets.bottom + 36, 52),
            maxWidth: 1600,
            alignSelf: 'center',
            width: '100%'
          }}
          ListHeaderComponent={() => (
            <View className="mb-4">
              {/* Comprehensive Analytics Dashboard Header */}
              <View className="bg-slate-900 border border-slate-800 p-4 rounded-3xl mb-3 shadow-md">
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Total Sales Revenue</Text>
                    <Text className="text-2xl font-black text-emerald-400 mt-0.5">₹{stats.totalRevenue.toFixed(2)}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Average Order</Text>
                    <Text className="text-xl font-black text-indigo-300 mt-0.5">₹{stats.averageOrderValue.toFixed(2)}</Text>
                  </View>
                </View>

                <View className="flex-row gap-2 pt-3 border-t border-slate-800 justify-between">
                  <View className="bg-slate-950/70 px-3 py-2 rounded-2xl flex-1 items-center border border-slate-800">
                    <Text className="text-slate-400 text-[10px]">Total Orders</Text>
                    <Text className="text-white font-black text-sm mt-0.5">{stats.totalOrdersCount}</Text>
                  </View>
                  <View className="bg-slate-950/70 px-3 py-2 rounded-2xl flex-1 items-center border border-slate-800">
                    <Text className="text-slate-400 text-[10px]">Dine In</Text>
                    <Text className="text-purple-300 font-black text-sm mt-0.5">{stats.dineInCount}</Text>
                  </View>
                  <View className="bg-slate-950/70 px-3 py-2 rounded-2xl flex-1 items-center border border-slate-800">
                    <Text className="text-slate-400 text-[10px]">Pick Up</Text>
                    <Text className="text-blue-300 font-black text-sm mt-0.5">{stats.pickupCount}</Text>
                  </View>
                  <View className="bg-slate-950/70 px-3 py-2 rounded-2xl flex-1 items-center border border-slate-800">
                    <Text className="text-slate-400 text-[10px]">Highest Order</Text>
                    <Text className="text-amber-300 font-black text-sm mt-0.5">₹{stats.highestOrderAmount.toFixed(0)}</Text>
                  </View>
                </View>
              </View>

              <Text className="text-[11px] text-slate-500 italic ml-1">
                Tip: Tap any order to view full bill details and reprint receipts.
              </Text>
            </View>
          )}
          renderItem={({ item }: any) => {
            const isRunning = item.status === 'running' || item.status === 'RUNNING';
            const itemsList = item.items || [];
            const displayedItems = itemsList.slice(0, 2);
            const remainingCount = itemsList.length - displayedItems.length;
            const orderBillNo = item.orderNumber ? `#${item.orderNumber}` : (item.kotNo ? `#${item.kotNo}` : `#${item.id.slice(0, 6)}`);

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedOrder(item)}
                className="bg-slate-900 border border-slate-800 p-4 rounded-3xl m-1.5 justify-between shadow-sm hover:border-slate-700 active:bg-slate-850"
                style={{ flex: 1 / ordersGridColumns }}
              >
                <View>
                  {/* Header Row: Table/Type pill, KOT, Status, and Total */}
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center flex-wrap gap-1.5">
                      <Text className="text-white font-black text-base">
                        {item.tableNo ? (`Table ${item.tableNo}`) : (item.orderType === 'PICKUP' ? 'Pick Up' : 'Takeaway')}
                      </Text>
                      <View className="bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                        <Text className="text-indigo-300 text-[10px] font-bold">
                          {orderBillNo}
                        </Text>
                      </View>
                      <View className={`px-2 py-0.5 rounded border ${
                        isRunning ? 'bg-amber-500/20 border-amber-500/30' : 'bg-emerald-500/20 border-emerald-500/30'
                      }`}>
                        <Text className={`text-[10px] font-bold ${
                          isRunning ? 'text-amber-300' : 'text-emerald-300'
                        }`}>
                          {isRunning ? 'RUNNING' : 'SETTLED'}
                        </Text>
                      </View>
                    </View>

                    <Text className="text-emerald-400 font-black text-lg">
                      ₹{Number(item.totalAmount || 0).toFixed(0)}
                    </Text>
                  </View>

                  {/* Items Summary Preview */}
                  <View className="mb-2">
                    {displayedItems.map((it: any, idx: number) => (
                      <Text key={idx} className="text-slate-300 text-xs py-0.5" numberOfLines={1}>
                        <Text className="text-purple-400 font-bold">{it.qty || 1}x</Text> {it.itemName || it.name}
                        {it.variantName ? ` (${it.variantName})` : ''}
                      </Text>
                    ))}
                    {remainingCount > 0 && (
                      <Text className="text-[11px] text-indigo-400 font-bold mt-0.5">+ {remainingCount} more items</Text>
                    )}
                  </View>
                </View>

                {/* Footer Row: Timestamp, Cashier, and Tap to Open */}
                <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-slate-800/80">
                  <Text className="text-slate-400 text-[10px]">
                    {formatOrderDate(item.createdAt)} • By {item.captainName || 'Staff'}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-[10px] text-indigo-300 font-bold">
                      Details ➜
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Receipt size={48} color="#475569" />
              <Text className="text-slate-400 font-bold text-sm mt-3">No orders found</Text>
              <Text className="text-slate-500 text-xs mt-1">Try searching a different bill number or table</Text>
            </View>
          }
        />
      )}

      {/* FULL KOTAPP-STYLE ORDER DETAILS MODAL WITH REPRINT */}
      {selectedOrder && (
        <Modal
          visible={!!selectedOrder}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedOrder(null)}
        >
          <SafeAreaView className="flex-1 bg-[#0B1120]">
            {/* Modal Header matching KOTApp */}
            <View className="flex-row items-center justify-between px-4 py-4 bg-slate-900 border-b border-slate-800 shadow-sm">
              <View className="flex-row items-center">
                <TouchableOpacity 
                  onPress={() => setSelectedOrder(null)}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  className="p-2 bg-slate-800 rounded-full"
                >
                  <ArrowLeft size={20} color="white" />
                </TouchableOpacity>
                <Text className="text-lg font-black ml-3 text-white">Order Details</Text>
              </View>
              
              <View className="flex-row items-center gap-2">
                <View className={`px-3 py-1 rounded-full ${selectedOrder.orderType === 'PICKUP' ? 'bg-purple-500/20 border border-purple-500/40' : 'bg-blue-500/20 border border-blue-500/40'}`}>
                  <Text className={`text-xs font-bold ${selectedOrder.orderType === 'PICKUP' ? 'text-purple-300' : 'text-blue-300'}`}>
                    {selectedOrder.orderType === 'PICKUP' ? 'Pick Up' : (selectedOrder.tableNo ? `Table ${selectedOrder.tableNo}` : 'Takeaway')}
                  </Text>
                </View>

                {isClientAdmin && (
                  <TouchableOpacity 
                    onPress={() => handleDeleteOrder(selectedOrder.id, selectedOrder.kotNo || selectedOrder.orderNumber || '0')}
                    className="p-2 bg-red-500/20 border border-red-500/30 rounded-full ml-1"
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  >
                    <Trash2 size={18} color="#F87171" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView className="flex-1 px-4 py-4" contentContainerStyle={{ paddingBottom: 60 }}>
              {/* Order Info Card */}
              <View className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-sm mb-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xl font-black text-white">
                    {selectedOrder.orderNumber ? `Bill #${selectedOrder.orderNumber}` : (selectedOrder.kotNo ? `KOT #${selectedOrder.kotNo}` : `Order #${selectedOrder.id.slice(0, 6)}`)}
                  </Text>
                  <Text className="text-xs text-slate-400 font-medium">{formatOrderDate(selectedOrder.createdAt)}</Text>
                </View>
                <View className="flex-row items-center border-t border-slate-800 pt-3 mt-1 justify-between">
                  <View className="flex-row items-center">
                    <Text className="text-xs text-slate-400 font-medium">Captain/Cashier:</Text>
                    <Text className="text-xs font-bold text-white ml-1.5">{selectedOrder.captainName || 'Staff'}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Text className="text-xs text-slate-400 font-medium">Status:</Text>
                    <Text className="text-xs font-black text-emerald-400 ml-1.5 uppercase">{selectedOrder.status || 'Settled'}</Text>
                  </View>
                </View>
                {selectedOrder.locationName && (
                  <View className="flex-row items-center pt-2">
                    <Text className="text-xs text-slate-400">Branch:</Text>
                    <Text className="text-xs font-bold text-indigo-300 ml-1.5">{selectedOrder.locationName}</Text>
                  </View>
                )}
              </View>

              {/* Items Card */}
              <View className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-sm mb-4">
                <Text className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-3">Items List</Text>
                {(selectedOrder.items || []).map((item: any, idx: number) => (
                  <View key={idx} className="flex-row justify-between items-start py-3 border-b border-slate-800 last:border-b-0">
                    <View className="flex-1 mr-4">
                      <Text className="text-white text-sm font-bold">
                        <Text className="text-purple-400 font-black">{item.qty || 1}x</Text> {item.itemName || item.name}
                      </Text>
                      {item.variantName && (
                        <Text className="text-xs text-indigo-300 mt-0.5">Variant: {item.variantName}</Text>
                      )}
                      {item.note && (
                        <Text className="text-amber-400/80 text-[11px] mt-0.5 italic">Note: {item.note}</Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text className="text-white font-bold text-sm">₹{Number((item.price || 0) * (item.qty || 1)).toFixed(2)}</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">₹{Number(item.price || 0).toFixed(2)} each</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Special Notes Card */}
              {selectedOrder.specialNote ? (
                <View className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-3xl mb-4">
                  <Text className="text-[10px] text-amber-300 font-black uppercase tracking-wider mb-1">Special Instruction</Text>
                  <Text className="text-xs text-amber-200 font-medium">{selectedOrder.specialNote}</Text>
                </View>
              ) : null}

              {/* Bill Financials Card */}
              <View className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-sm mb-4">
                <Text className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-3">Receipt Invoice</Text>
                
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-slate-400 text-xs">Total Quantity</Text>
                  <Text className="text-white text-xs font-bold">
                    {(selectedOrder.items || []).reduce((s: number, i: any) => s + (i.qty || 1), 0)} items
                  </Text>
                </View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-slate-400 text-xs">Subtotal</Text>
                  <Text className="text-slate-300 text-xs font-semibold">₹{((selectedOrder.totalAmount || 0) / 1.05).toFixed(2)}</Text>
                </View>
                <View className="flex-row justify-between items-center mb-3 pb-3 border-b border-slate-800">
                  <Text className="text-slate-400 text-xs">Taxes (CGST + SGST)</Text>
                  <Text className="text-purple-300 text-xs font-semibold">₹{((selectedOrder.totalAmount || 0) - ((selectedOrder.totalAmount || 0) / 1.05)).toFixed(2)}</Text>
                </View>
                
                <View className="flex-row justify-between items-center">
                  <Text className="text-white text-base font-bold">Total Paid</Text>
                  <Text className="text-emerald-400 text-2xl font-black">₹{Number(selectedOrder.totalAmount || 0).toFixed(2)}</Text>
                </View>

                {/* Payment breakdown */}
                {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                  <View className="mt-3 pt-3 border-t border-slate-800">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase mb-2">Settlement Breakdown:</Text>
                    {selectedOrder.payments.map((p: any, idx: number) => (
                      <View key={idx} className="flex-row justify-between py-1">
                        <Text className="text-slate-300 text-xs">{p.method}</Text>
                        <Text className="text-emerald-400 text-xs font-bold">₹{Number(p.amount).toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Thermal Reprint Action Buttons */}
              <View className="gap-3 mt-2">
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => handleReprintBill(selectedOrder)}
                    disabled={isReprinting}
                    className="flex-1 bg-emerald-600 py-4 rounded-2xl flex-row items-center justify-center active:opacity-80 shadow-lg shadow-emerald-600/30"
                  >
                    {isReprinting ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Printer size={18} color="white" />
                        <Text className="text-white font-black text-sm ml-2">Reprint Bill Receipt</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleReprintKitchenKOT(selectedOrder)}
                    disabled={isReprintingKitchen}
                    className="flex-1 bg-amber-600/20 border border-amber-500/40 py-4 rounded-2xl flex-row items-center justify-center active:opacity-80"
                  >
                    {isReprintingKitchen ? (
                      <ActivityIndicator size="small" color="#F59E0B" />
                    ) : (
                      <>
                        <Utensils size={18} color="#FBBF24" />
                        <Text className="text-amber-300 font-black text-sm ml-2">Reprint KOT</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedOrder(null)}
                  className="bg-slate-800 py-3 rounded-2xl items-center"
                >
                  <Text className="text-slate-400 font-bold text-xs">Close Details</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
};
