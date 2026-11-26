import { toast } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirm';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Plus, LayoutGrid, Users, Trash2, CheckCircle2, Clock, QrCode, Smartphone, Building, MapPin } from 'lucide-react-native';
import { TableQrDownloadModal } from './TableQrDownloadModal';
import { Header } from '../../components/common/Header';
import { useThemeStore } from '../../store/theme.store';
import { useTableStore } from '../../store/table.store';
import { useCartStore } from '../../store/cart.store';
import { useTenantStore } from '../../store/tenant.store';
import { useOrderStore } from '../../store/order.store';
import { usePrinterStore } from '../../store/printer.store';
import { useAuthStore } from '../../store/auth.store';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { Table } from '../../types/table.types';
import { DBServices } from '../../services/firebase/db';
import { Routes } from '../../constants/routes';

export const TablesScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { tables, isLoading, subscribeToTables } = useTableStore();
  const carts = useCartStore(state => state.carts);
  const { tenant, branding, locations, activeLocationId, setActiveLocationId } = useTenantStore();
  const { user } = useAuthStore();
  const { orders, subscribeToOrders } = useOrderStore();
  const { settings } = usePrinterStore();
  const { tableGridColumns, isLargePOS } = useResponsiveLayout();
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  const userAssigned = user?.assignedLocationId;
  const hasMultiBranchAccess = (user?.role === 'ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'PLATFORM_ADMIN') && (!userAssigned || (user?.locationIds && user.locationIds.includes('*')));

  const [isAdding, setIsAdding] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'RUNNING'>('ALL');

  // Real-time synchronization of both tables and active orders
  useEffect(() => {
    const unsubTables = subscribeToTables();
    const unsubOrders = subscribeToOrders(activeLocationId);
    return () => {
      unsubTables();
      unsubOrders();
    };
  }, [tenant?.id, activeLocationId]);

  // Index running orders by table number for instant O(1) lookup
  const runningOrderMap = useMemo(() => {
    const map: Record<number, any> = {};
    orders.forEach(o => {
      const isRunning = (o.status === 'RUNNING' || o.status === 'running');
      if (isRunning && o.tableNo !== undefined && o.tableNo !== null) {
        map[Number(o.tableNo)] = o;
      }
    });
    return map;
  }, [orders]);

  // Comprehensive table occupancy check: Cart OR Table doc status OR Live running orders in kitchen
  const isTableOccupied = useCallback((t: Table) => {
    const localCart = carts[t.tableNo] || [];
    const remoteCart = (t as any).cartItems || [];
    const runningOrder = runningOrderMap[Number(t.tableNo)];
    return (
      localCart.length > 0 ||
      remoteCart.length > 0 ||
      t.status === 'running' ||
      t.status === 'OCCUPIED' ||
      !!runningOrder
    );
  }, [carts, runningOrderMap]);

  const handleAddTable = async () => {
    setIsAdding(true);
    try {
      const nextNo = tables.length > 0 ? Math.max(...tables.map(t => t.tableNo)) + 1 : 1;
      await DBServices.addTable(nextNo, tenant?.id, activeLocationId || undefined);
    } catch (e: any) {
      toast.error(e.message, 'Error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteTable = (item: Table) => {
    const hasItems = carts[item.tableNo] && carts[item.tableNo].length > 0;
    confirmDialog({
      title: 'Delete Table',
      message: 'Are you sure you want to delete Table ' + item.tableNo + '?' + (hasItems ? ' Note: This table has active items in cart.' : ''),
      confirmText: 'Delete Table',
      destructive: true,
      onConfirm: async () => {
        try {
          await DBServices.deleteTable(item.id, tenant?.id, activeLocationId || undefined);
        } catch (err: any) {
          toast.error(err.message, 'Failed');
        }
      },
    });
  };

  const handleTablePress = (item: Table) => {
    navigation.navigate(Routes.MENU, {
      tableId: item.id,
      tableNo: item.tableNo,
      orderType: 'DINE_IN',
    });
  };

  // Memoized occupancy metrics
  const { runningCount, availableCount } = useMemo(() => {
    const running = tables.filter(t => isTableOccupied(t)).length;
    return {
      runningCount: running,
      availableCount: Math.max(0, tables.length - running)
    };
  }, [tables, isTableOccupied]);

  const filteredTables = useMemo(() => {
    return tables.filter(t => {
      const occupied = isTableOccupied(t);
      if (statusFilter === 'RUNNING') return occupied;
      if (statusFilter === 'AVAILABLE') return !occupied;
      return true;
    });
  }, [tables, statusFilter, isTableOccupied]);

  const renderTableCard = useCallback(({ item }: { item: Table }) => {
    const localCart = carts[item.tableNo] || [];
    const remoteCart = (item as any).cartItems || [];
    const effectiveCart = localCart.length > 0 ? localCart : remoteCart;
    const runningOrder = runningOrderMap[Number(item.tableNo)];
    const isOccupied = isTableOccupied(item);

    const isBillRequested = (item as any).billRequested === true || runningOrder?.billRequested === true;
    const isBillPrinted = (item as any).billPrinted === true || runningOrder?.billPrinted === true;
    const isQrOrder = runningOrder?.orderSource === 'QR_SELF_ORDER';

    const orderItemsCount = runningOrder?.items
      ? runningOrder.items.reduce((s: number, i: any) => s + (i.qty || 1), 0)
      : effectiveCart.reduce((s: number, i: any) => s + (i.qty || 0), 0);

    const waiterName = isQrOrder ? '📱 QR Self-Order' : (runningOrder?.captainName || (item as any).activeWaiterName);

    return (
      <TouchableOpacity
        className={'aspect-square m-1.5 rounded-3xl border p-3 justify-between shadow-sm ' + (
          isBillRequested
            ? isDark ? 'bg-amber-500/25 border-2 border-amber-400 shadow-lg shadow-amber-500/30' : 'bg-amber-100 border-2 border-amber-500 shadow-sm'
            : isBillPrinted
              ? isDark ? 'bg-cyan-950/30 border-2 border-cyan-400/80 shadow-lg shadow-cyan-500/20' : 'bg-cyan-100 border-2 border-cyan-500 shadow-sm'
              : isOccupied
                ? isDark ? 'bg-amber-950/30 border-amber-500/50' : 'bg-amber-50 border-amber-300'
                : isDark ? 'bg-emerald-950/20 border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
        )}
        style={{ flex: 1 / tableGridColumns }}
        activeOpacity={0.8}
        onPress={() => handleTablePress(item)}
        onLongPress={() => handleDeleteTable(item)}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <View className={'w-2.5 h-2.5 rounded-full ' + (isBillRequested ? 'bg-amber-400' : isBillPrinted ? 'bg-cyan-400' : isOccupied ? 'bg-amber-500' : 'bg-emerald-500')} />
            <Text className={'text-[10px] font-bold uppercase tracking-wider ' + (
              isBillRequested ? 'text-amber-400' : isBillPrinted ? 'text-cyan-400 font-black' : isOccupied ? (isQrOrder ? 'text-amber-400' : 'text-amber-500') : 'text-emerald-500'
            )}>
              {isBillRequested ? '🛎️ BILL REQ' : isBillPrinted ? '🧾 PRINTED' : isOccupied ? (isQrOrder ? '📱 QR ORDER' : 'RUNNING') : 'AVAIL'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteTable(item);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="p-1 rounded-lg bg-rose-500/10 border border-rose-500/20"
          >
            <Trash2 size={12} color="#F43F5E" />
          </TouchableOpacity>
        </View>

        <View className="items-center justify-center my-1">
          <Text className={`font-black text-3xl ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.tableNo}</Text>
          {isOccupied && runningOrder ? (
            <Text className="text-emerald-500 text-xs font-black mt-0.5" numberOfLines={1}>
              ₹{Number(runningOrder.totalAmount || 0).toFixed(0)}
            </Text>
          ) : isOccupied && waiterName ? (
            <Text className="text-amber-500 text-[11px] font-bold mt-0.5" numberOfLines={1}>
              {waiterName}
            </Text>
          ) : (
            <Text className="text-slate-400 text-[10px]">Table</Text>
          )}
        </View>

        <View className={`flex-row items-center justify-between pt-1 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <View className="flex-row items-center">
            <Users size={12} color="#64748B" />
            <Text className="text-slate-400 text-[10px] ml-1">{item.capacity || 4}</Text>
          </View>
          {isOccupied && orderItemsCount > 0 && (
            <View className="bg-purple-500/20 px-1.5 py-0.5 rounded">
              <Text className="text-purple-400 text-[10px] font-bold">
                {orderItemsCount} items
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [carts, runningOrderMap, isTableOccupied, tableGridColumns, isDark]);

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#090D1A]' : 'bg-slate-50'}`}>
      <Header
        title="Tables Floor Plan"
        subtitle={tables.length + ' tables configured'}
        rightElement={
          <View className="flex-row items-center gap-1.5 sm:gap-2">
            <TouchableOpacity
              className="bg-emerald-600 px-2.5 sm:px-3 py-1.5 rounded-xl flex-row items-center shrink-0 shadow-sm"
              onPress={() => setIsQrModalOpen(true)}
            >
              <QrCode size={14} color="white" />
              <Text className="text-white font-bold text-xs ml-1" numberOfLines={1}>QRs</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-[#5D3FD3] px-2.5 sm:px-3 py-1.5 rounded-xl flex-row items-center shrink-0 shadow-sm"
              onPress={handleAddTable}
              disabled={isAdding}
            >
              {isAdding ? <ActivityIndicator size="small" color="white" /> : <Plus size={15} color="white" />}
              <Text className="text-white font-bold text-xs ml-1" numberOfLines={1}>Add Table</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Multi-Branch Floor Plan Switcher */}
      {hasMultiBranchAccess && locations.length > 1 && (
        <View className={`px-4 py-2 border-b flex-row items-center justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <View className="flex-row items-center mr-3">
            <Building size={14} color="#5D3FD3" />
            <Text className={`text-xs font-bold ml-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Floor Plan For:
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
            {locations.map(loc => {
              const isSelected = activeLocationId === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => setActiveLocationId(loc.id)}
                  className={`px-3 py-1 rounded-full border flex-row items-center ${isSelected
                    ? 'bg-[#5D3FD3] border-purple-500 shadow-sm'
                    : isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  <MapPin size={11} color={isSelected ? 'white' : '#94A3B8'} />
                  <Text className={`text-xs font-bold ml-1 ${isSelected ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Floor Status & Filter Ribbon */}
      <View className={`px-4 py-3 border-b flex-row items-center justify-between ${
        isDark ? 'bg-[#0c1222] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl border ${
              statusFilter === 'ALL'
                ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                : isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <Text className={`text-xs font-bold ${
              statusFilter === 'ALL' ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              All ({tables.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setStatusFilter('RUNNING')}
            className={`px-3 py-1.5 rounded-xl border flex-row items-center ${
              statusFilter === 'RUNNING'
                ? isDark ? 'bg-amber-500/20 border-amber-500' : 'bg-amber-100 border-amber-400'
                : isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <View className="w-2 h-2 rounded-full bg-amber-400 mr-1.5" />
            <Text className={`text-xs font-bold ${
              statusFilter === 'RUNNING' ? 'text-amber-500' : isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Running ({runningCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setStatusFilter('AVAILABLE')}
            className={`px-3 py-1.5 rounded-xl border flex-row items-center ${
              statusFilter === 'AVAILABLE'
                ? isDark ? 'bg-emerald-500/20 border-emerald-500' : 'bg-emerald-100 border-emerald-400'
                : isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <View className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
            <Text className={`text-xs font-bold ${
              statusFilter === 'AVAILABLE' ? 'text-emerald-500' : isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Available ({availableCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Floor Grid */}
      <FlatList
        className="flex-1"
        style={{ flex: 1 }}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={16}
        maxToRenderPerBatch={12}
        windowSize={4}
        showsVerticalScrollIndicator={true}
        data={filteredTables}
        renderItem={renderTableCard}
        keyExtractor={(item, index) => `${item.id || item.tableNo || 'table'}-${index}`}
        numColumns={tableGridColumns}
        key={tableGridColumns}
        contentContainerStyle={{
          padding: 8,
          paddingBottom: insets.bottom + 20,
        }}
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center justify-center p-12">
              <ActivityIndicator size="large" color="#5D3FD3" />
              <Text className="text-slate-400 text-sm mt-3">Loading restaurant tables...</Text>
            </View>
          ) : (
            <View className="items-center justify-center p-12">
              <LayoutGrid size={48} color="#475569" />
              <Text className="text-slate-300 font-bold text-base mt-3">No tables match filter</Text>
              <Text className="text-slate-500 text-xs mt-1 text-center">
                Tap 'Add Table' to create your first dining table or change filter.
              </Text>
            </View>
          )
        }
      />

      {/* Download QR Modal */}
      <TableQrDownloadModal
        visible={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
      />
    </SafeAreaView>
  );
};
