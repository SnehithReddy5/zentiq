import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, MapPin, Receipt, CheckCircle2, ShoppingBag, TrendingUp } from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useOrderStore } from '../../store/order.store';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export const RunningOrdersScreen = () => {
  const insets = useSafeAreaInsets();
  const { orders, subscribeToOrders, isLoading } = useOrderStore();
  const { tenant, locations, activeLocationId } = useTenantStore();
  const { user } = useAuthStore();
  const { ordersGridColumns, isLargePOS } = useResponsiveLayout();
  const isClientAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';

  // Location filter: defaults to active branch or 'ALL'
  const staffBranch = activeLocationId || (user?.locationIds && user.locationIds[0] !== '*' ? user.locationIds[0] : null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    isClientAdmin ? (activeLocationId || (locations[0]?.id || 'ALL')) : (staffBranch || 'ALL')
  );
  const [search, setSearch] = useState('');

  // Subscribe dynamically to the selected location
  useEffect(() => {
    const unsub = subscribeToOrders(selectedLocationId);
    return () => unsub();
  }, [tenant?.id, selectedLocationId]);

  const filteredOrders = orders.filter(o => {
    if (!search.trim()) return true;
    const searchTarget = (o.kotNo || '') + ' ' + (o.orderNumber || '') + ' ' + (o.tableNo || '') + ' ' + (o.captainName || '');
    return searchTarget.toLowerCase().includes(search.toLowerCase());
  });

  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const completedCount = filteredOrders.filter(o => o.status === 'COMPLETED' || o.paymentStatus === 'PAID').length;

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Orders & Sales Log"
        subtitle={isClientAdmin ? (filteredOrders.length + ' orders listed') : (filteredOrders.length + ' orders • Branch: ' + (locations.find(l => l.id === selectedLocationId)?.name || 'Assigned Branch'))}
      />

      {/* Location Filter Pills - Only accessible to Client Admin */}
      {isClientAdmin && (
        <View className="py-2.5 bg-[#111827] border-b border-slate-800">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4">
            {locations.length > 1 && (
              <TouchableOpacity
                onPress={() => setSelectedLocationId('ALL')}
                className={'mr-2 px-3.5 py-1.5 rounded-full border flex-row items-center ' + (
                  selectedLocationId === 'ALL'
                    ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                    : 'bg-slate-900 border-slate-800'
                )}
              >
                <MapPin size={11} color={selectedLocationId === 'ALL' ? 'white' : '#94A3B8'} />
                <Text className={'text-xs ml-1 font-bold ' + (selectedLocationId === 'ALL' ? 'text-white' : 'text-slate-400')}>
                  All Branches
                </Text>
              </TouchableOpacity>
            )}

            {locations.map(loc => {
              const isSelected = selectedLocationId === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => setSelectedLocationId(loc.id)}
                  className={'mr-2 px-3.5 py-1.5 rounded-full border flex-row items-center ' + (
                    isSelected
                      ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                      : 'bg-slate-900 border-slate-800'
                  )}
                >
                  <MapPin size={11} color={isSelected ? 'white' : '#94A3B8'} />
                  <Text className={'text-xs ml-1 font-bold ' + (isSelected ? 'text-white' : 'text-slate-400')}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Top Quick Sales Ribbon on Large POS */}
      {isLargePOS && (
        <View className="px-5 py-3 bg-[#0c1222] border-b border-slate-800/80 flex-row items-center justify-between">
          <View className="flex-row items-center gap-6">
            <View className="flex-row items-center">
              <TrendingUp size={16} color="#10B981" />
              <Text className="text-slate-400 text-xs ml-2">Total Settled:</Text>
              <Text className="text-white font-black text-sm ml-1">₹{totalRevenue.toFixed(2)}</Text>
            </View>
            <View className="flex-row items-center">
              <ShoppingBag size={16} color="#818CF8" />
              <Text className="text-slate-400 text-xs ml-2">Bills Settled:</Text>
              <Text className="text-white font-black text-sm ml-1">{completedCount}</Text>
            </View>
          </View>
          <Text className="text-slate-500 text-xs font-semibold">{filteredOrders.length} records matching</Text>
        </View>
      )}

      {/* Search Bar */}
      <View className="px-4 py-2.5 bg-[#090D1A]">
        <View className="flex-row items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 max-w-5xl">
          <Search size={16} color="#64748B" />
          <TextInput
            placeholder="Search by Bill #, Table, or Staff..."
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
            className="flex-1 ml-2 text-xs text-white"
          />
        </View>
      </View>

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
        renderItem={({ item }: any) => {
          const isRunning = item.status === 'running' || item.status === 'RUNNING';
          const itemsList = item.items || [];
          const createdAtDate = item.createdAt ? new Date(item.createdAt.seconds ? item.createdAt.seconds * 1000 : item.createdAt) : null;
          const timeString = createdAtDate ? createdAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

          return (
            <View
              className="bg-slate-900 border border-slate-800 p-4 rounded-3xl m-1.5 justify-between shadow-sm"
              style={{ flex: 1 / ordersGridColumns }}
            >
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center flex-wrap gap-2">
                    <Text className="text-white font-black text-base">
                      {item.tableNo ? ('Table ' + item.tableNo) : (item.orderType === 'PICKUP' ? 'Pick Up' : 'Takeaway')}
                    </Text>
                    {item.locationName && (
                      <View className="bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                        <Text className="text-indigo-300 text-[10px] font-bold">
                          {item.locationName}
                        </Text>
                      </View>
                    )}
                    <View className={'px-2 py-0.5 rounded border ' + (isRunning ? 'bg-amber-500/20 border-amber-500/30' : 'bg-emerald-500/20 border-emerald-500/30')}>
                      <Text className={'text-[10px] font-bold ' + (isRunning ? 'text-amber-400' : 'text-emerald-400')}>
                        {item.status || 'PAID'}
                      </Text>
                    </View>
                  </View>

                  <Text className="text-white font-black text-base">₹{(item.totalAmount || 0).toFixed(2)}</Text>
                </View>

                <View className="flex-row justify-between mb-2.5 pb-2 border-b border-slate-800">
                  <Text className="text-slate-400 text-xs">
                    Bill #{item.orderNumber || item.kotNo || item.id.slice(0, 6)}
                  </Text>
                  <Text className="text-slate-400 text-xs">
                    {timeString} • {item.captainName || 'Staff'}
                  </Text>
                </View>

                {/* Items Summary */}
                <View className="bg-slate-950/60 p-2.5 rounded-2xl mb-2 border border-slate-850">
                  {itemsList.slice(0, 3).map((it: any, idx: number) => (
                    <View key={idx} className="flex-row justify-between py-0.5">
                      <Text className="text-slate-300 text-xs" numberOfLines={1}>
                        {it.qty}x {it.itemName || it.name}
                      </Text>
                      <Text className="text-slate-400 text-xs">₹{((it.price || 0) * (it.qty || 1)).toFixed(2)}</Text>
                    </View>
                  ))}
                  {itemsList.length > 3 && (
                    <Text className="text-slate-500 text-[11px] mt-1 italic">
                      + {itemsList.length - 3} more items
                    </Text>
                  )}
                </View>
              </View>

              {/* Payment Mode Footer */}
              {item.payments && item.payments.length > 0 && (
                <View className="flex-row items-center justify-between pt-1 border-t border-slate-800">
                  <Text className="text-slate-500 text-[10px] uppercase font-bold">Paid via:</Text>
                  <View className="flex-row gap-1">
                    {item.payments.map((p: any, pIdx: number) => (
                      <View key={pIdx} className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        <Text className="text-slate-300 text-[10px] font-semibold">{p.method}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="py-20 items-center justify-center">
            <Receipt size={48} color="#475569" />
            <Text className="text-white font-bold text-base mt-4">No Orders Found</Text>
            <Text className="text-slate-500 text-xs mt-1 text-center">
              Settled and running orders for this branch will appear here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};
