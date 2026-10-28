import { toast } from '../../utils/toast';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Plus, LayoutGrid, Users, Trash2, CheckCircle2, Clock, QrCode, Smartphone } from 'lucide-react-native';
import { TableQrDownloadModal } from './TableQrDownloadModal';
import { Header } from '../../components/common/Header';
import { useTableStore } from '../../store/table.store';
import { useCartStore } from '../../store/cart.store';
import { useTenantStore } from '../../store/tenant.store';
import { useOrderStore } from '../../store/order.store';
import { usePrinterStore } from '../../store/printer.store';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { Table } from '../../types/table.types';
import { DBServices } from '../../services/firebase/db';
import { Routes } from '../../constants/routes';
import { useLiveOrderNotifications } from '../../hooks/useLiveOrderNotifications';

export const TablesScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { tables, isLoading, subscribeToTables } = useTableStore();
  const carts = useCartStore(state => state.carts);
  const { tenant, branding, activeLocationId } = useTenantStore();
  const { orders, subscribeToOrders } = useOrderStore();
  const { settings } = usePrinterStore();
  const { tableGridColumns, isLargePOS } = useResponsiveLayout();
  useLiveOrderNotifications();

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
    Alert.alert(
      'Delete Table',
      'Are you sure you want to delete Table ' + item.tableNo + '?' + (hasItems ? ' Note: This table has active items in cart.' : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Table',
          style: 'destructive',
          onPress: async () => {
            try {
              await DBServices.deleteTable(item.id, tenant?.id, activeLocationId || undefined);
            } catch (err: any) {
              toast.error(err.message, 'Failed');
            }
          },
        },
      ]
    );
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
    const isQrOrder = runningOrder?.orderSource === 'QR_SELF_ORDER';

    const orderItemsCount = runningOrder?.items
      ? runningOrder.items.reduce((s: number, i: any) => s + (i.qty || 1), 0)
      : effectiveCart.reduce((s: number, i: any) => s + (i.qty || 0), 0);

    const waiterName = isQrOrder ? '📱 QR Self-Order' : (runningOrder?.captainName || (item as any).activeWaiterName);

    return (
      <TouchableOpacity
        className={'aspect-square m-1.5 rounded-3xl border p-3 justify-between shadow-sm ' + (
          isBillRequested
            ? 'bg-amber-500/25 border-2 border-amber-400 shadow-lg shadow-amber-500/30'
            : isOccupied
            ? 'bg-amber-950/30 border-amber-500/50'
            : 'bg-emerald-950/20 border-emerald-500/40'
        )}
        style={{ flex: 1 / tableGridColumns }}
        activeOpacity={0.8}
        onPress={() => handleTablePress(item)}
        onLongPress={() => handleDeleteTable(item)}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <View className={'w-2.5 h-2.5 rounded-full ' + (isBillRequested ? 'bg-amber-400' : isOccupied ? 'bg-amber-500' : 'bg-emerald-500')} />
            <Text className={'text-[10px] font-bold uppercase tracking-wider ' + (
              isBillRequested ? 'text-amber-300' : isOccupied ? (isQrOrder ? 'text-amber-300' : 'text-amber-400') : 'text-emerald-400'
            )}>
              {isBillRequested ? '🛎️ BILL REQ' : isOccupied ? (isQrOrder ? '📱 QR ORDER' : 'RUNNING') : 'AVAIL'}
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
          <Text className="text-white font-black text-3xl">{item.tableNo}</Text>
          {isOccupied && runningOrder ? (
            <Text className="text-emerald-300 text-xs font-black mt-0.5" numberOfLines={1}>
              ₹{Number(runningOrder.totalAmount || 0).toFixed(0)}
            </Text>
          ) : isOccupied && waiterName ? (
            <Text className="text-amber-300 text-[11px] font-bold mt-0.5" numberOfLines={1}>
              {waiterName}
            </Text>
          ) : (
            <Text className="text-slate-400 text-[10px]">Table</Text>
          )}
        </View>

        <View className="flex-row items-center justify-between pt-1 border-t border-slate-800">
          <View className="flex-row items-center">
            <Users size={12} color="#64748B" />
            <Text className="text-slate-400 text-[10px] ml-1">{item.capacity || 4}</Text>
          </View>
          {isOccupied && orderItemsCount > 0 && (
            <View className="bg-purple-500/20 px-1.5 py-0.5 rounded">
              <Text className="text-purple-300 text-[10px] font-bold">
                {orderItemsCount} items
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [carts, runningOrderMap, isTableOccupied, tableGridColumns]);

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Tables Floor Plan"
        subtitle={tables.length + ' tables configured'}
        rightElement={
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center shrink-0 shadow-sm"
              onPress={() => setIsQrModalOpen(true)}
            >
              <QrCode size={15} color="white" />
              <Text className="text-white font-bold text-xs ml-1.5">Download QRs</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-[#5D3FD3] px-3 py-1.5 rounded-xl flex-row items-center shrink-0 shadow-sm"
              onPress={handleAddTable}
              disabled={isAdding}
            >
              {isAdding ? <ActivityIndicator size="small" color="white" /> : <Plus size={16} color="white" />}
              <Text className="text-white font-bold text-xs ml-1">Add Table</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Floor Status & Filter Ribbon */}
      <View className="px-4 py-3 bg-[#0c1222] border-b border-slate-800 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => setStatusFilter('ALL')}
            className={'px-3 py-1.5 rounded-xl border ' + (statusFilter === 'ALL' ? 'bg-[#5D3FD3] border-[#5D3FD3]' : 'bg-slate-900 border-slate-800')}
          >
            <Text className={'text-xs font-bold ' + (statusFilter === 'ALL' ? 'text-white' : 'text-slate-400')}>
              All ({tables.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setStatusFilter('RUNNING')}
            className={'px-3 py-1.5 rounded-xl border flex-row items-center ' + (statusFilter === 'RUNNING' ? 'bg-amber-500/20 border-amber-500' : 'bg-slate-900 border-slate-800')}
          >
            <View className="w-2 h-2 rounded-full bg-amber-400 mr-1.5" />
            <Text className={'text-xs font-bold ' + (statusFilter === 'RUNNING' ? 'text-amber-300' : 'text-slate-400')}>
              Running ({runningCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setStatusFilter('AVAILABLE')}
            className={'px-3 py-1.5 rounded-xl border flex-row items-center ' + (statusFilter === 'AVAILABLE' ? 'bg-emerald-500/20 border-emerald-500' : 'bg-slate-900 border-slate-800')}
          >
            <View className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
            <Text className={'text-xs font-bold ' + (statusFilter === 'AVAILABLE' ? 'text-emerald-300' : 'text-slate-400')}>
              Available ({availableCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Floor Grid */}
      <FlatList
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
