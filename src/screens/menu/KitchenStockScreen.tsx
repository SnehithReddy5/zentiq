import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChefHat,
  Search,
  CheckCircle2,
  XCircle,
  LogOut,
  MapPin,
  UtensilsCrossed,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  Flame
} from 'lucide-react-native';
import { useMenuStore } from '../../store/menu.store';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { DBServices } from '../../services/firebase/db';
import { MenuItem } from '../../types/menu.types';
import { toast } from '../../utils/toast';

export const KitchenStockScreen = () => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const { tenant, activeLocationId, getActiveLocation } = useTenantStore();
  const { items, categories, subscribeToMenu, isLoadingItems } = useMenuStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  // Subscribe to live menu
  useEffect(() => {
    const unsub = subscribeToMenu();
    return () => unsub();
  }, [tenant?.id, activeLocationId]);

  const activeLocation = getActiveLocation();

  // Metrics
  const totalCount = items.length;
  const outOfStockCount = useMemo(() => items.filter(i => i.isAvailable === false).length, [items]);
  const inStockCount = totalCount - outOfStockCount;

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category filter
      if (selectedCategoryId !== 'ALL' && item.categoryId !== selectedCategoryId) {
        return false;
      }
      // Status filter
      const isAvailable = item.isAvailable !== false;
      if (statusFilter === 'IN_STOCK' && !isAvailable) return false;
      if (statusFilter === 'OUT_OF_STOCK' && isAvailable) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = (item.name || '').toLowerCase().includes(query);
        const cat = categories.find(c => c.id === item.categoryId);
        const catMatch = (cat?.name || '').toLowerCase().includes(query);
        return nameMatch || catMatch;
      }

      return true;
    });
  }, [items, categories, selectedCategoryId, statusFilter, searchQuery]);

  // Toggle Item Availability
  const handleToggleAvailability = async (item: MenuItem) => {
    const currentStatus = item.isAvailable !== false;
    const newStatus = !currentStatus;

    setUpdatingItemId(item.id);
    try {
      await DBServices.updateMenuItem(
        item.id,
        { isAvailable: newStatus },
        tenant?.id,
        activeLocationId || undefined
      );

      if (newStatus) {
        toast.success(`"${item.name}" marked IN STOCK`, 'Available');
      } else {
        toast.warning(`"${item.name}" marked OUT OF STOCK`, '86\'d');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update item availability', 'Error');
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const getCategoryName = (catId: string) => {
    const found = categories.find(c => c.id === catId);
    return found ? found.name : 'General';
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      {/* 1. KITCHEN HEADER */}
      <View className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sm:px-6 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-3">
          <View className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 items-center justify-center mr-3 shadow-md shadow-amber-500/20">
            <ChefHat size={24} color="#F59E0B" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center flex-wrap gap-2">
              <Text className="text-white font-black text-base sm:text-lg" numberOfLines={1}>
                Kitchen Item Availability
              </Text>
              <View className="bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
                <Text className="text-amber-300 text-[10px] font-black uppercase tracking-wider">
                  Kitchen Staff Mode
                </Text>
              </View>
            </View>
            <View className="flex-row items-center mt-0.5">
              <MapPin size={11} color="#94A3B8" />
              <Text className="text-slate-400 text-xs ml-1" numberOfLines={1}>
                {activeLocation?.name || 'Main Kitchen'} • {user?.name || 'Kitchen Staff'}
              </Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          onPress={handleLogout}
          className="flex-row items-center px-3.5 py-2 bg-rose-500/10 active:bg-rose-500/20 border border-rose-500/30 rounded-xl"
        >
          <LogOut size={16} color="#F43F5E" />
          <Text className="text-rose-400 font-bold text-xs ml-1.5">Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* 2. SUMMARY KPI METRICS */}
      <View className="px-4 pt-3 pb-2 sm:px-6">
        <View className="flex-row gap-2.5">
          {/* Total Menu Items */}
          <View className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Items</Text>
            <Text className="text-white font-black text-lg sm:text-xl mt-0.5">{totalCount}</Text>
          </View>

          {/* In Stock Items */}
          <TouchableOpacity
            onPress={() => setStatusFilter(statusFilter === 'IN_STOCK' ? 'ALL' : 'IN_STOCK')}
            className={`flex-1 p-3 rounded-2xl border ${
              statusFilter === 'IN_STOCK'
                ? 'bg-emerald-950/50 border-emerald-500'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">In Stock</Text>
              <View className="w-2 h-2 rounded-full bg-emerald-400" />
            </View>
            <Text className="text-emerald-300 font-black text-lg sm:text-xl mt-0.5">{inStockCount}</Text>
          </TouchableOpacity>

          {/* Out of Stock Items */}
          <TouchableOpacity
            onPress={() => setStatusFilter(statusFilter === 'OUT_OF_STOCK' ? 'ALL' : 'OUT_OF_STOCK')}
            className={`flex-1 p-3 rounded-2xl border ${
              statusFilter === 'OUT_OF_STOCK'
                ? 'bg-rose-950/50 border-rose-500'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-rose-400 text-[10px] font-bold uppercase tracking-wider">Out of Stock</Text>
              <View className="w-2 h-2 rounded-full bg-rose-400" />
            </View>
            <Text className="text-rose-300 font-black text-lg sm:text-xl mt-0.5">{outOfStockCount}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. SEARCH & STATUS FILTER */}
      <View className="px-4 py-2 sm:px-6">
        <View className="flex-row gap-2">
          {/* Search Bar */}
          <View className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 flex-row items-center">
            <Search size={16} color="#94A3B8" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search dish name (e.g. Biryani, Paneer)..."
              placeholderTextColor="#64748B"
              className="flex-1 text-white text-xs sm:text-sm font-semibold ml-2.5 py-0"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} className="p-1">
                <Text className="text-slate-400 text-xs font-bold">Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* 4. CATEGORY HORIZONTAL TABS */}
      <View className="border-b border-slate-800/80 pb-2.5">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          <TouchableOpacity
            onPress={() => setSelectedCategoryId('ALL')}
            className={`px-3.5 py-2 rounded-xl border ${
              selectedCategoryId === 'ALL'
                ? 'bg-indigo-600 border-indigo-500'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <Text className={`text-xs font-bold ${selectedCategoryId === 'ALL' ? 'text-white font-black' : 'text-slate-400'}`}>
              All Categories ({items.length})
            </Text>
          </TouchableOpacity>

          {categories.map(cat => {
            const count = items.filter(i => i.categoryId === cat.id).length;
            const isSelected = selectedCategoryId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategoryId(cat.id)}
                className={`px-3.5 py-2 rounded-xl border ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-500'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <Text className={`text-xs font-bold ${isSelected ? 'text-white font-black' : 'text-slate-400'}`}>
                  {cat.name} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 5. MENU ITEMS LIST WITH BIG IN-STOCK / OUT-OF-STOCK TOGGLES */}
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom + 40, 60),
          maxWidth: 900,
          alignSelf: 'center',
          width: '100%'
        }}
        renderItem={({ item }) => {
          const isAvailable = item.isAvailable !== false;
          const isUpdating = updatingItemId === item.id;

          return (
            <View
              className={`p-4 rounded-2xl mb-3 border flex-row items-center justify-between transition-all ${
                isAvailable
                  ? 'bg-slate-900/90 border-slate-800'
                  : 'bg-rose-950/20 border-rose-500/40'
              }`}
            >
              {/* Item Info (No prices, pure name & category) */}
              <View className="flex-1 mr-3 min-w-0">
                <View className="flex-row items-center flex-wrap gap-2 mb-1">
                  <Text
                    className={`font-black text-base sm:text-lg ${
                      isAvailable ? 'text-white' : 'text-slate-400 line-through'
                    }`}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <View className="bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                    <Text className="text-slate-300 text-[10px] font-bold">
                      {getCategoryName(item.categoryId)}
                    </Text>
                  </View>
                </View>

                {/* Status indicator */}
                <View className="flex-row items-center mt-1">
                  {isAvailable ? (
                    <View className="flex-row items-center">
                      <CheckCircle2 size={13} color="#10B981" />
                      <Text className="text-emerald-400 text-xs font-bold ml-1.5">
                        Available in Kitchen (In Stock)
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center">
                      <XCircle size={13} color="#F43F5E" />
                      <Text className="text-rose-400 text-xs font-bold ml-1.5">
                        Item Out of Stock (86'd)
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Large, High-Contrast Availability Action Button */}
              <TouchableOpacity
                disabled={isUpdating}
                onPress={() => handleToggleAvailability(item)}
                activeOpacity={0.7}
                className={`px-4 py-3 rounded-xl flex-row items-center justify-center shrink-0 min-w-[140px] shadow-lg ${
                  isAvailable
                    ? 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 shadow-rose-900/40'
                    : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 shadow-emerald-900/40'
                }`}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : isAvailable ? (
                  <View className="flex-row items-center">
                    <XCircle size={16} color="white" />
                    <Text className="text-white font-black text-xs sm:text-sm ml-2">
                      Mark Out of Stock
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center">
                    <CheckCircle2 size={16} color="white" />
                    <Text className="text-white font-black text-xs sm:text-sm ml-2">
                      Mark In Stock
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="py-20 items-center justify-center">
            <UtensilsCrossed size={42} color="#475569" />
            <Text className="text-slate-300 font-bold text-sm mt-3">No menu items found</Text>
            <Text className="text-slate-500 text-xs mt-1 text-center px-4">
              {searchQuery ? `No items matching "${searchQuery}"` : 'No menu items have been added yet.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

