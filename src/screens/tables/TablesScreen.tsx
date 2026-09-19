import { toast } from '../../utils/toast';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Plus, LayoutGrid, Users, Trash2, CheckCircle2, Clock } from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useTableStore } from '../../store/table.store';
import { useCartStore } from '../../store/cart.store';
import { useTenantStore } from '../../store/tenant.store';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { Table } from '../../types/table.types';
import { DBServices } from '../../services/firebase/db';
import { Routes } from '../../constants/routes';

export const TablesScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { tables, isLoading, subscribeToTables } = useTableStore();
  const carts = useCartStore(state => state.carts);
  const { tenant, activeLocationId } = useTenantStore();
  const { tableGridColumns, isLargePOS } = useResponsiveLayout();
  const [isAdding, setIsAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'RUNNING'>('ALL');

  useEffect(() => {
    const unsub = subscribeToTables();
    return () => unsub();
  }, [tenant?.id, activeLocationId]);

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

  const handleTablePress = async (item: Table) => {
    navigation.navigate(Routes.MENU, {
      tableId: item.id,
      tableNo: item.tableNo,
      orderType: 'DINE_IN'
    });
  };

  // Occupancy metrics
  const runningCount = tables.filter(t => {
    const localCart = carts[t.tableNo] || [];
    const remoteCart = (t as any).cartItems || [];
    return localCart.length > 0 || remoteCart.length > 0 || t.status === 'running' || t.status === 'OCCUPIED';
  }).length;
  const availableCount = Math.max(0, tables.length - runningCount);

  const filteredTables = tables.filter(t => {
    const localCart = carts[t.tableNo] || [];
    const remoteCart = (t as any).cartItems || [];
    const isOccupied = localCart.length > 0 || remoteCart.length > 0 || t.status === 'running' || t.status === 'OCCUPIED';
    if (statusFilter === 'RUNNING') return isOccupied;
    if (statusFilter === 'AVAILABLE') return !isOccupied;
    return true;
  });

  const renderTableCard = useCallback(({ item }: { item: Table }) => {
    const localCart = carts[item.tableNo] || [];
    const remoteCart = (item as any).cartItems || [];
    const effectiveCart = localCart.length > 0 ? localCart : remoteCart;
    const isOccupied = effectiveCart.length > 0 || item.status === 'running' || item.status === 'OCCUPIED';
    const totalItems = effectiveCart.reduce((s: number, i: any) => s + (i.qty || 0), 0);
    const waiterName = (item as any).activeWaiterName;

    return (
      <TouchableOpacity
        className={'aspect-square m-1.5 rounded-3xl border p-3 justify-between shadow-sm ' + (
          isOccupied
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
            <View className={'w-2.5 h-2.5 rounded-full ' + (isOccupied ? 'bg-amber-500' : 'bg-emerald-500')} />
            <Text className={'text-[10px] font-bold uppercase tracking-wider ' + (isOccupied ? 'text-amber-400' : 'text-emerald-400')}>
              {isOccupied ? 'RUNNING' : 'AVAIL'}
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
          {isOccupied && waiterName ? (
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
          {isOccupied && totalItems > 0 && (
            <View className="bg-purple-500/20 px-1.5 py-0.5 rounded">
              <Text className="text-purple-300 text-[10px] font-bold">
                {totalItems} items
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [carts, tableGridColumns]);

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Tables Floor Plan"
        subtitle={tables.length + ' tables configured'}
        rightElement={
          <TouchableOpacity
            className="bg-[#5D3FD3] px-3 py-1.5 rounded-xl flex-row items-center shrink-0 shadow-sm"
            onPress={handleAddTable}
            disabled={isAdding}
          >
            {isAdding ? <ActivityIndicator size="small" color="white" /> : <Plus size={16} color="white" />}
            <Text className="text-white font-bold text-xs ml-1">Add Table</Text>
          </TouchableOpacity>
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
            <View className="w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
            <Text className={'text-xs font-bold ' + (statusFilter === 'RUNNING' ? 'text-amber-300' : 'text-slate-400')}>
              Running ({runningCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setStatusFilter('AVAILABLE')}
            className={'px-3 py-1.5 rounded-xl border flex-row items-center ' + (statusFilter === 'AVAILABLE' ? 'bg-emerald-500/20 border-emerald-500' : 'bg-slate-900 border-slate-800')}
          >
            <View className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
            <Text className={'text-xs font-bold ' + (statusFilter === 'AVAILABLE' ? 'text-emerald-300' : 'text-slate-400')}>
              Available ({availableCount})
            </Text>
          </TouchableOpacity>
        </View>

        {isLargePOS && (
          <Text className="text-slate-500 text-xs font-semibold">
            {tableGridColumns} Columns Grid • Click any table to open menu
          </Text>
        )}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#5D3FD3" />
        </View>
      ) : (
        <FlatList
          key={tableGridColumns}
          data={filteredTables}
          keyExtractor={(t) => t.id}
          renderItem={renderTableCard}
          numColumns={tableGridColumns}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: Math.max(insets.bottom + 36, 52),
            maxWidth: 1600,
            alignSelf: 'center',
            width: '100%'
          }}
          ListEmptyComponent={
            <View className="p-16 items-center justify-center">
              <LayoutGrid size={48} color="#475569" />
              <Text className="text-white font-bold text-base mt-4">
                {statusFilter === 'ALL' ? 'No Tables Created' : ('No ' + statusFilter.toLowerCase() + ' tables')}
              </Text>
              <Text className="text-slate-500 text-xs mt-1 text-center">
                Tap '+ Add Table' above to setup your dining tables.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};
