import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { confirmDialog } from '../../utils/confirm';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Boxes,
  Package,
  Plus,
  Minus,
  Truck,
  Utensils,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Search,
  X,
  Trash2,
  History,
  Sparkles,
  TrendingDown,
  Layers,
  ArrowRight,
  Filter,
  SlidersHorizontal,
  Building,
  MapPin,
} from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useInventoryStore } from '../../store/inventory.store';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { DBServices } from '../../services/firebase/db';
import { toast } from '../../utils/toast';
import { InventoryItem, InventoryLog } from '../../types/inventory.types';

const COMMON_CATEGORIES = [
  'All',
  'Grains & Rice',
  'Oils & Ghee',
  'Spices & Seasoning',
  'Dairy & Poultry',
  'Vegetables & Produce',
  'Packaging & Others',
];

const COMMON_UNITS = ['kg', 'packets', 'litres', 'grams', 'cans', 'boxes', 'pcs'];

export const InventoryScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';
  const { items, logs, isLoading, subscribeToInventory } = useInventoryStore();
  const { tenant, locations, activeLocationId, setActiveLocationId } = useTenantStore();
  const { user } = useAuthStore();

  const userAssigned = user?.assignedLocationId;
  const hasMultiBranchAccess = (user?.role === 'ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'PLATFORM_ADMIN') && (!userAssigned || (user?.locationIds && user.locationIds.includes('*')));

  const [activeTab, setActiveTab] = useState<'BALANCE' | 'STOCK_IN_LOGS' | 'KITCHEN_ISSUE_LOGS'>('BALANCE');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');

  // Modals state
  const [isAddItemModalOpen, setAddItemModalOpen] = useState(false);
  const [isStockInModalOpen, setStockInModalOpen] = useState(false);
  const [isKitchenIssueModalOpen, setKitchenIssueModalOpen] = useState(false);
  const [isAdjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Grains & Rice');
  const [formUnit, setFormUnit] = useState('kg');
  const [formStock, setFormStock] = useState('100');
  const [formMinThreshold, setFormMinThreshold] = useState('15');

  // Transaction modal inputs
  const [actionQuantity, setActionQuantity] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [actionStaff, setActionStaff] = useState(user?.name || 'Staff');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Subscribe to real-time inventory
  useEffect(() => {
    const unsub = subscribeToInventory();
    return () => unsub();
  }, [tenant?.id, activeLocationId]);

  // KPIs
  const { totalItemsCount, healthyStockCount, lowStockCount, outOfStockCount } = useMemo(() => {
    let healthy = 0;
    let low = 0;
    let out = 0;
    items.forEach((item) => {
      const stock = Number(item.currentStock || 0);
      const min = Number(item.minThreshold || 5);
      if (stock <= 0) out++;
      else if (stock <= min) low++;
      else healthy++;
    });
    return {
      totalItemsCount: items.length,
      healthyStockCount: healthy,
      lowStockCount: low,
      outOfStockCount: out,
    };
  }, [items]);

  // Filtered items for Balance Tab
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;

      // Status filter
      const stock = Number(item.currentStock || 0);
      const min = Number(item.minThreshold || 5);
      if (statusFilter === 'LOW_STOCK' && (stock > min || stock <= 0)) return false;
      if (statusFilter === 'OUT_OF_STOCK' && stock > 0) return false;

      // Search query
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.unit.toLowerCase().includes(q)
      );
    });
  }, [items, selectedCategory, statusFilter, searchQuery]);

  // Filtered logs for History Tabs
  const stockInLogs = useMemo(() => {
    return logs.filter((l) => l.type === 'STOCK_IN');
  }, [logs]);

  const kitchenIssueLogs = useMemo(() => {
    return logs.filter((l) => l.type === 'KITCHEN_ISSUE' || l.type === 'WASTAGE');
  }, [logs]);

  // Handlers
  const handleOpenReceiveStock = (item: InventoryItem) => {
    setSelectedItem(item);
    setActionQuantity('');
    setActionNotes('');
    setActionStaff(user?.name || 'Kitchen Staff');
    setStockInModalOpen(true);
  };

  const handleOpenKitchenIssue = (item: InventoryItem) => {
    setSelectedItem(item);
    setActionQuantity('');
    setActionNotes('');
    setActionStaff(user?.name || 'Chef');
    setKitchenIssueModalOpen(true);
  };

  const handleOpenAdjustStock = (item: InventoryItem) => {
    setSelectedItem(item);
    setActionQuantity(String(item.currentStock || 0));
    setActionNotes('');
    setActionStaff(user?.name || 'Manager');
    setAdjustModalOpen(true);
  };

  // Submit Receive Load
  const handleSubmitStockIn = async () => {
    if (!selectedItem) return;
    const qty = parseFloat(actionQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.warning('Please enter a valid load quantity to receive.', 'Invalid Quantity');
      return;
    }

    setIsSubmitting(true);
    try {
      await DBServices.receiveStockLoad(
        selectedItem.id,
        qty,
        actionNotes.trim() || 'Bulk load shipment received',
        actionStaff.trim() || user?.name || 'Kitchen Staff',
        tenant?.id,
        activeLocationId || undefined
      );
      toast.success(`✓ Loaded +${qty} ${selectedItem.unit} of ${selectedItem.name} into store!`, 'Stock Received');
      setStockInModalOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to receive stock', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Kitchen Issue
  const handleSubmitKitchenIssue = async () => {
    if (!selectedItem) return;
    const qty = parseFloat(actionQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.warning('Please enter a valid quantity taken to kitchen.', 'Invalid Quantity');
      return;
    }

    const currentBal = Number(selectedItem.currentStock || 0);
    if (qty > currentBal) {
      toast.warning(`Cannot issue ${qty} ${selectedItem.unit}. Only ${currentBal} ${selectedItem.unit} available in store!`, 'Insufficient Store Stock');
      return;
    }

    setIsSubmitting(true);
    try {
      await DBServices.issueStockToKitchen(
        selectedItem.id,
        qty,
        actionNotes.trim() || 'Taken to kitchen for active cooking',
        actionStaff.trim() || user?.name || 'Chef',
        tenant?.id,
        activeLocationId || undefined
      );
      toast.success(`✓ Issued ${qty} ${selectedItem.unit} of ${selectedItem.name} to kitchen!`, 'Deducted from Store');
      setKitchenIssueModalOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to issue stock', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Physical Adjustment
  const handleSubmitAdjustment = async (type: 'ADJUSTMENT' | 'WASTAGE') => {
    if (!selectedItem) return;
    const newStock = parseFloat(actionQuantity);
    if (isNaN(newStock) || newStock < 0) {
      toast.warning('Please enter a valid balance.', 'Invalid Value');
      return;
    }

    setIsSubmitting(true);
    try {
      await DBServices.adjustInventoryStock(
        selectedItem.id,
        newStock,
        type,
        actionNotes.trim() || (type === 'WASTAGE' ? 'Recorded wastage / spoilage' : 'Stock reconciliation count'),
        actionStaff.trim() || user?.name || 'Manager',
        tenant?.id,
        activeLocationId || undefined
      );
      toast.success(`✓ Inventory balance updated to ${newStock} ${selectedItem.unit}`, 'Stock Adjusted');
      setAdjustModalOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to adjust stock', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create New Item
  const handleCreateNewItem = async () => {
    if (!formName.trim()) {
      toast.warning('Please enter an item name (e.g. Basmati Rice).', 'Name Required');
      return;
    }
    const initialStock = parseFloat(formStock) || 0;
    const minThreshold = parseFloat(formMinThreshold) || 5;

    setIsSubmitting(true);
    try {
      await DBServices.createInventoryItem(
        {
          name: formName.trim(),
          category: formCategory,
          unit: formUnit,
          currentStock: initialStock,
          totalReceived: initialStock,
          totalIssued: 0,
          minThreshold,
        },
        tenant?.id,
        activeLocationId || undefined
      );
      toast.success(`✓ Added "${formName.trim()}" with initial load of ${initialStock} ${formUnit}`, 'Item Created');
      setAddItemModalOpen(false);
      setFormName('');
      setFormStock('100');
    } catch (e: any) {
      toast.error(e.message || 'Failed to create item', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Item
  const handleDeleteItem = (item: InventoryItem) => {
    confirmDialog({
      title: 'Delete Inventory Item',
      message: `Are you sure you want to delete "${item.name}" from inventory tracking?`,
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        try {
          await DBServices.deleteInventoryItem(item.id, tenant?.id, activeLocationId || undefined);
          toast.success(`Deleted ${item.name}`, 'Removed');
        } catch (e: any) {
          toast.error(e.message || 'Could not delete item', 'Error');
        }
      },
    });
  };



  // Format date helper
  const formatLogDate = (createdAt: any) => {
    if (!createdAt) return 'Just now';
    const date = typeof createdAt.toDate === 'function'
      ? createdAt.toDate()
      : new Date(createdAt.seconds ? createdAt.seconds * 1000 : createdAt);

    if (isNaN(date.getTime())) return 'Just now';
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const isManagerOrAbove =
    user?.role === 'PLATFORM_ADMIN' ||
    user?.role === 'CLIENT_ADMIN' ||
    user?.role === 'ADMIN' ||
    user?.role === 'TENANT_SUPER_ADMIN' ||
    user?.role === 'admin' ||
    user?.role === 'MANAGER' ||
    user?.role === 'manager';

  if (!isManagerOrAbove) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#090D1A]' : 'bg-[#F8FAFC]'}`}>
        <Header title="Kitchen Inventory" subtitle="Access Control" />
        <View className="flex-1 items-center justify-center p-6">
          <View className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 items-center justify-center mb-4">
            <ShieldAlert size={36} color="#F43F5E" />
          </View>
          <Text className={`font-black text-xl text-center ${isDark ? 'text-white' : 'text-slate-900'}`}>Store Manager Access Required</Text>
          <Text className={`text-xs text-center mt-2 max-w-sm leading-5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Kitchen inventory balance, bulk load reception, and usage ledgers are restricted to Store Managers and Restaurant Administrators only.
          </Text>
          <View className={`border px-3.5 py-1.5 rounded-xl mt-4 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Your Current Role: <Text className="text-amber-500 font-bold uppercase">{user?.role || 'Staff'}</Text>
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="mt-6 bg-[#5D3FD3] px-6 py-3 rounded-2xl flex-row items-center active:bg-[#4D32B8]"
          >
            <ArrowRight size={16} color="white" />
            <Text className="text-white font-bold text-xs ml-2">Back to POS Terminal</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#090D1A]' : 'bg-[#F8FAFC]'}`}>
      <Header
        title="Kitchen Inventory & Store"
        subtitle="Bulk Loads, Kitchen Consumption & Live Ledger"
        rightElement={
          <View className="flex-row items-center gap-1.5 sm:gap-2 shrink-0">
            <TouchableOpacity
              onPress={() => setAddItemModalOpen(true)}
              className="bg-emerald-600 px-2.5 sm:px-3 py-1.5 rounded-xl flex-row items-center active:bg-emerald-700 shadow-md shadow-emerald-600/30 shrink-0"
            >
              <Plus size={15} color="white" />
              <Text className="text-white font-bold text-xs ml-1" numberOfLines={1} ellipsizeMode="tail">
                + New Item
              </Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Multi-Branch Inventory Scope Switcher */}
      {hasMultiBranchAccess && locations.length > 1 && (
        <View className={`px-4 py-2 border-b flex-row items-center justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <View className="flex-row items-center mr-3">
            <Building size={14} color="#5D3FD3" />
            <Text className={`text-xs font-bold ml-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Inventory Scope:
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

      {/* Top 4 KPI Metric Cards */}
      <View className={`px-4 pt-3 pb-2 border-b ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
        <View className="flex-row flex-wrap gap-2">
          {/* Total Items */}
          <View className={`border p-2.5 rounded-2xl flex-1 min-w-[80px] ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <View className="flex-row items-center justify-between">
              <Text className={`text-[10px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Items</Text>
              <Boxes size={13} color="#818CF8" />
            </View>
            <Text className={`font-black text-lg mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>{totalItemsCount}</Text>
          </View>

          {/* Healthy Stock */}
          <TouchableOpacity
            onPress={() => setStatusFilter(statusFilter === 'ALL' ? 'ALL' : 'ALL')}
            className={`border p-2.5 rounded-2xl flex-1 min-w-[80px] ${
              isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-emerald-500 dark:text-emerald-400 text-[10px] font-bold uppercase">Good Stock</Text>
              <CheckCircle2 size={13} color="#10B981" />
            </View>
            <Text className="text-emerald-600 dark:text-emerald-300 font-black text-lg mt-0.5">{healthyStockCount}</Text>
          </TouchableOpacity>

          {/* Low Stock Alerts */}
          <TouchableOpacity
            onPress={() => setStatusFilter(statusFilter === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')}
            className={`p-2.5 rounded-2xl flex-1 min-w-[80px] border ${
              statusFilter === 'LOW_STOCK'
                ? 'bg-amber-500/30 border-amber-400'
                : isDark
                ? 'bg-amber-950/20 border-amber-500/30'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-amber-500 dark:text-amber-400 text-[10px] font-bold uppercase">Low Stock</Text>
              <AlertTriangle size={13} color="#F59E0B" />
            </View>
            <Text className="text-amber-600 dark:text-amber-300 font-black text-lg mt-0.5">{lowStockCount}</Text>
          </TouchableOpacity>

          {/* Out of Stock */}
          <TouchableOpacity
            onPress={() => setStatusFilter(statusFilter === 'OUT_OF_STOCK' ? 'ALL' : 'OUT_OF_STOCK')}
            className={`p-2.5 rounded-2xl flex-1 min-w-[80px] border ${
              statusFilter === 'OUT_OF_STOCK'
                ? 'bg-rose-500/30 border-rose-400'
                : isDark
                ? 'bg-rose-950/20 border-rose-500/30'
                : 'bg-rose-50 border-rose-200'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-rose-500 dark:text-rose-400 text-[10px] font-bold uppercase">Out of Stock</Text>
              <TrendingDown size={13} color="#F43F5E" />
            </View>
            <Text className="text-rose-600 dark:text-rose-300 font-black text-lg mt-0.5">{outOfStockCount}</Text>
          </TouchableOpacity>
        </View>

        {/* 3 Main View Tabs - Horizontal Scroll to prevent overlap on mobile */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}
          className="mt-2.5"
        >
          <TouchableOpacity
            onPress={() => setActiveTab('BALANCE')}
            className={`px-3.5 py-2.5 rounded-2xl flex-row items-center border ${
              activeTab === 'BALANCE'
                ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                : isDark
                ? 'bg-slate-950 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <Package size={14} color={activeTab === 'BALANCE' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'} />
            <Text className={`text-xs font-black ml-1.5 ${
              activeTab === 'BALANCE' ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Stock Balance ({items.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('STOCK_IN_LOGS')}
            className={`px-3.5 py-2.5 rounded-2xl flex-row items-center border ${
              activeTab === 'STOCK_IN_LOGS'
                ? 'bg-emerald-600 border-emerald-600'
                : isDark
                ? 'bg-slate-950 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <Truck size={14} color={activeTab === 'STOCK_IN_LOGS' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'} />
            <Text className={`text-xs font-black ml-1.5 ${
              activeTab === 'STOCK_IN_LOGS' ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Received Loads ({stockInLogs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('KITCHEN_ISSUE_LOGS')}
            className={`px-3.5 py-2.5 rounded-2xl flex-row items-center border ${
              activeTab === 'KITCHEN_ISSUE_LOGS'
                ? 'bg-amber-600 border-amber-600'
                : isDark
                ? 'bg-slate-950 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <Utensils size={14} color={activeTab === 'KITCHEN_ISSUE_LOGS' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'} />
            <Text className={`text-xs font-black ml-1.5 ${
              activeTab === 'KITCHEN_ISSUE_LOGS' ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Kitchen Usage ({kitchenIssueLogs.length})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* TAB 1: STOCK BALANCE PAGE */}
      {activeTab === 'BALANCE' && (
        <View className="flex-1">
          {/* Search & Filter Bar */}
          <View className={`px-4 py-2.5 border-b gap-2 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'}`}>
            <View className={`flex-row items-center border rounded-2xl px-3.5 py-2 ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <Search size={15} color={isDark ? '#94A3B8' : '#64748B'} />
              <TextInput
                placeholder="Search raw items (e.g. Rice, Oil, Spices, Onions)..."
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={searchQuery}
                onChangeText={setSearchQuery}
                className={`flex-1 text-xs ml-2 py-0 ${isDark ? 'text-white' : 'text-slate-900'}`}
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={15} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
              {COMMON_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full border ${
                    selectedCategory === cat
                      ? 'bg-indigo-600/30 border-indigo-400'
                      : isDark
                      ? 'bg-slate-950 border-slate-800'
                      : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  <Text className={`text-xs font-bold ${
                    selectedCategory === cat
                      ? isDark ? 'text-indigo-300' : 'text-indigo-600'
                      : isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Items FlatList */}
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#5D3FD3" />
              <Text className={`text-xs font-semibold mt-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading store inventory...</Text>
            </View>
          ) : (
            <FlatList
              className="flex-1"
              style={{ flex: 1 }}
              removeClippedSubviews={false}
              showsVerticalScrollIndicator={true}
              data={filteredItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                padding: 12,
                paddingBottom: Math.max(insets.bottom + 36, 52),
                maxWidth: 1600,
                alignSelf: 'center',
                width: '100%',
              }}
              renderItem={({ item }) => {
                const stock = Number(item.currentStock || 0);
                const min = Number(item.minThreshold || 5);
                const totalIn = Number(item.totalReceived || stock);
                const totalOut = Number(item.totalIssued || 0);
                const isOutOfStock = stock <= 0;
                const isLowStock = !isOutOfStock && stock <= min;

                // Percentage remaining of total load received
                const pct = totalIn > 0 ? Math.min(100, Math.max(0, (stock / totalIn) * 100)) : (stock > 0 ? 100 : 0);

                return (
                  <View className={`border rounded-3xl p-4 mb-3 shadow-sm ${
                    isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    {/* Item Header */}
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center flex-wrap gap-1.5 mb-1">
                          <Text className={`font-black text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.name}</Text>
                          <View className={`border px-2 py-0.5 rounded ${
                            isDark ? 'bg-indigo-500/15 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200'
                          }`}>
                            <Text className={`text-[10px] font-bold uppercase ${
                              isDark ? 'text-indigo-300' : 'text-indigo-600'
                            }`}>{item.category}</Text>
                          </View>
                        </View>

                        {/* Status Badge */}
                        <View className="flex-row items-center gap-1.5">
                          <View className={`w-2 h-2 rounded-full ${isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                          <Text className={`text-[11px] font-bold uppercase tracking-wider ${isOutOfStock ? 'text-rose-500 dark:text-rose-400' : isLowStock ? 'text-amber-500 dark:text-amber-300' : 'text-emerald-500 dark:text-emerald-400'
                            }`}>
                            {isOutOfStock ? 'OUT OF STOCK' : isLowStock ? `LOW STOCK (Min: ${min} ${item.unit})` : 'HEALTHY BALANCE'}
                          </Text>
                        </View>
                      </View>

                      {/* Current Active Balance Highlight */}
                      <View className={`items-end border px-3.5 py-2 rounded-2xl ${
                        isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <Text className={`text-[10px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Store Balance</Text>
                        <Text className={`text-2xl font-black ${isOutOfStock ? 'text-rose-500 dark:text-rose-400' : isLowStock ? 'text-amber-500 dark:text-amber-300' : 'text-emerald-500 dark:text-emerald-400'
                          }`}>
                          {stock} <Text className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{item.unit}</Text>
                        </Text>
                      </View>
                    </View>

                    {/* Stock Meter Progress Bar */}
                    <View className="mt-3">
                      <View className={`h-2 w-full rounded-full overflow-hidden border ${
                        isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                      }`}>
                        <View
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full ${isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                        />
                      </View>
                    </View>

                    {/* Summary Stats Row */}
                    <View className={`flex-row items-center justify-between mt-3 pt-2.5 border-t ${
                      isDark ? 'border-slate-800/80' : 'border-slate-200'
                    }`}>
                      <View className="flex-row items-center">
                        <Truck size={12} color="#10B981" />
                        <Text className={`text-xs ml-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Total Received: <Text className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{totalIn} {item.unit}</Text>
                        </Text>
                      </View>

                      <View className="flex-row items-center">
                        <Utensils size={12} color="#F59E0B" />
                        <Text className={`text-xs ml-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Taken to Kitchen: <Text className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{totalOut} {item.unit}</Text>
                        </Text>
                      </View>
                    </View>

                    {/* Activity Tracking: When updated or deducted */}
                    <View className={`mt-2.5 pt-2 border-t flex-row items-center justify-between flex-wrap gap-2 ${
                      isDark ? 'border-slate-800/60' : 'border-slate-200'
                    }`}>
                      <View className="flex-row items-center">
                        <Clock size={11} color={isDark ? '#94A3B8' : '#64748B'} />
                        <Text className={`text-[11px] ml-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Last Updated: <Text className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{formatLogDate(item.lastIssuedAt || item.lastRestockedAt || item.updatedAt)}</Text>
                        </Text>
                      </View>

                      {item.lastIssuedAt ? (
                        <View className="bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex-row items-center">
                          <Utensils size={10} color="#F59E0B" />
                          <Text className="text-amber-500 font-bold text-[10px] ml-1">
                            Deducted: {formatLogDate(item.lastIssuedAt)}
                          </Text>
                        </View>
                      ) : item.lastRestockedAt ? (
                        <View className="bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/25 flex-row items-center">
                          <Truck size={10} color="#10B981" />
                          <Text className="text-emerald-500 font-bold text-[10px] ml-1">
                            Received: {formatLogDate(item.lastRestockedAt)}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Action Buttons Row */}
                    <View className="flex-row items-center gap-2 mt-3.5">
                      {/* + Receive Bulk Load Button */}
                      <TouchableOpacity
                        onPress={() => handleOpenReceiveStock(item)}
                        className="flex-1 bg-emerald-600/20 border border-emerald-500/40 py-2.5 rounded-2xl flex-row items-center justify-center active:bg-emerald-600/30"
                      >
                        <Plus size={14} color="#10B981" />
                        <Text className="text-emerald-600 dark:text-emerald-300 font-black text-xs ml-1">+ Load Stock</Text>
                      </TouchableOpacity>

                      {/* - Take to Kitchen Button */}
                      <TouchableOpacity
                        onPress={() => handleOpenKitchenIssue(item)}
                        disabled={isOutOfStock}
                        className={`flex-1 py-2.5 rounded-2xl flex-row items-center justify-center border ${isOutOfStock
                            ? isDark ? 'bg-slate-800/40 border-slate-800 opacity-40' : 'bg-slate-100 border-slate-200 opacity-40'
                            : 'bg-amber-600/20 border-amber-500/40 active:bg-amber-600/30'
                          }`}
                      >
                        <Utensils size={14} color="#F59E0B" />
                        <Text className="text-amber-600 dark:text-amber-300 font-black text-xs ml-1">🍳 Kitchen Issue</Text>
                      </TouchableOpacity>

                      {/* Adjust / Reconcile */}
                      <TouchableOpacity
                        onPress={() => handleOpenAdjustStock(item)}
                        className={`p-2.5 border rounded-2xl ${
                          isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                        }`}
                        accessibilityLabel="Adjust Stock"
                      >
                        <SlidersHorizontal size={14} color={isDark ? '#CBD5E1' : '#475569'} />
                      </TouchableOpacity>

                      {/* Delete */}
                      <TouchableOpacity
                        onPress={() => handleDeleteItem(item)}
                        className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl active:bg-rose-500/20"
                        accessibilityLabel="Delete Item"
                      >
                        <Trash2 size={14} color="#F43F5E" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View className="py-20 items-center justify-center">
                  <Boxes size={48} color={isDark ? '#475569' : '#94A3B8'} />
                  <Text className={`font-bold text-base mt-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>No inventory items found</Text>
                  <Text className={`text-xs mt-1 text-center max-w-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Tap '+ New Item' above to start tracking Rice, Oil, Spices, and kitchen loads.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setAddItemModalOpen(true)}
                    className="mt-4 bg-[#5D3FD3] px-5 py-2.5 rounded-2xl flex-row items-center"
                  >
                    <Plus size={16} color="white" />
                    <Text className="text-white font-bold text-xs ml-2">Add New Item</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* TAB 2: RECEIVED BULK LOADS HISTORY */}
      {activeTab === 'STOCK_IN_LOGS' && (
        <View className="flex-1">
          <View className={`px-4 py-2 border-b ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Showing incoming inventory shipments loaded into the store room.
            </Text>
          </View>
          <FlatList
            className="flex-1"
            style={{ flex: 1 }}
            removeClippedSubviews={false}
            showsVerticalScrollIndicator={true}
            data={stockInLogs}
            keyExtractor={(log) => log.id}
            contentContainerStyle={{
              padding: 12,
              paddingBottom: Math.max(insets.bottom + 36, 52),
              maxWidth: 1600,
              alignSelf: 'center',
              width: '100%',
            }}
            renderItem={({ item }) => (
              <View className={`border p-3.5 rounded-2xl mb-2 flex-row items-center justify-between ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <View className="flex-row items-center flex-1 mr-3">
                  <View className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mr-3 shrink-0">
                    <Truck size={18} color="#10B981" />
                  </View>
                  <View className="flex-1">
                    <Text className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.itemName}</Text>
                    <Text className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} numberOfLines={1}>
                      {item.notes || 'Bulk load received'}
                    </Text>
                    <Text className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {formatLogDate(item.createdAt)} • By {item.recordedBy || 'Staff'}
                    </Text>
                  </View>
                </View>

                <View className="items-end shrink-0">
                  <View className="bg-emerald-500/20 px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
                    <Text className="text-emerald-600 dark:text-emerald-300 font-black text-sm">+{item.quantity} {item.unit}</Text>
                  </View>
                  <Text className={`text-[10px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Balance: {item.newStock} {item.unit}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="py-20 items-center justify-center">
                <Truck size={44} color={isDark ? '#475569' : '#94A3B8'} />
                <Text className={`font-bold text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No received loads logged yet</Text>
                <Text className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Tap '+ Load Stock' on any item in Stock Balance tab.</Text>
              </View>
            }
          />
        </View>
      )}

      {/* TAB 3: KITCHEN USAGE / ISSUES LOG */}
      {activeTab === 'KITCHEN_ISSUE_LOGS' && (
        <View className="flex-1">
          <View className={`px-4 py-2 border-b ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Showing raw materials taken to the kitchen floor for active cooking.
            </Text>
          </View>
          <FlatList
            className="flex-1"
            style={{ flex: 1 }}
            removeClippedSubviews={false}
            showsVerticalScrollIndicator={true}
            data={kitchenIssueLogs}
            keyExtractor={(log) => log.id}
            contentContainerStyle={{
              padding: 12,
              paddingBottom: Math.max(insets.bottom + 36, 52),
              maxWidth: 1600,
              alignSelf: 'center',
              width: '100%',
            }}
            renderItem={({ item }) => (
              <View className={`border p-3.5 rounded-2xl mb-2 flex-row items-center justify-between ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <View className="flex-row items-center flex-1 mr-3">
                  <View className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 items-center justify-center mr-3 shrink-0">
                    <Utensils size={18} color="#F59E0B" />
                  </View>
                  <View className="flex-1">
                    <Text className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.itemName}</Text>
                    <Text className="text-amber-500 text-xs mt-0.5" numberOfLines={1}>
                      {item.notes || 'Issued to kitchen for cooking'}
                    </Text>
                    <Text className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {formatLogDate(item.createdAt)} • Taken by {item.recordedBy || 'Chef'}
                    </Text>
                  </View>
                </View>

                <View className="items-end shrink-0">
                  <View className="bg-amber-500/20 px-2.5 py-0.5 rounded-lg border border-amber-500/30">
                    <Text className="text-amber-600 dark:text-amber-300 font-black text-sm">-{item.quantity} {item.unit}</Text>
                  </View>
                  <Text className={`text-[10px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Store Left: {item.newStock} {item.unit}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="py-20 items-center justify-center">
                <Utensils size={44} color={isDark ? '#475569' : '#94A3B8'} />
                <Text className={`font-bold text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No kitchen issues logged yet</Text>
                <Text className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Tap '🍳 Kitchen Issue' on any item when taking supplies to cook.</Text>
              </View>
            }
          />
        </View>
      )}

      {/* MODAL 1: RECEIVE BULK LOAD (STOCK IN) */}
      {isStockInModalOpen && selectedItem && (
        <Modal
          visible={isStockInModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setStockInModalOpen(false)}
        >
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className={`border rounded-3xl w-full max-w-md p-5 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <View className={`flex-row items-center justify-between pb-3 border-b ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mr-2.5">
                    <Truck size={18} color="#10B981" />
                  </View>
                  <View>
                    <Text className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>Receive Bulk Load</Text>
                    <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedItem.name}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setStockInModalOpen(false)}>
                  <X size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              </View>

              <View className="my-4 gap-3">
                <View className={`p-3 rounded-2xl border flex-row items-center justify-between ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Current Store Balance:</Text>
                  <Text className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedItem.currentStock} {selectedItem.unit}</Text>
                </View>

                <View>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Load Quantity Received ({selectedItem.unit}) *</Text>
                  <TextInput
                    placeholder={`e.g. 100`}
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    keyboardType="numeric"
                    value={actionQuantity}
                    onChangeText={setActionQuantity}
                    className={`border rounded-xl px-3.5 py-3 text-base font-bold ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </View>

                <View>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Supplier / Delivery Invoice Note</Text>
                  <TextInput
                    placeholder="e.g. Received from Metro Cash & Carry - Batch #42"
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={actionNotes}
                    onChangeText={setActionNotes}
                    className={`border rounded-xl px-3.5 py-2.5 text-xs ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </View>

                <View>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Received By (Staff Name)</Text>
                  <TextInput
                    placeholder="Staff name"
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={actionStaff}
                    onChangeText={setActionStaff}
                    className={`border rounded-xl px-3.5 py-2.5 text-xs ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </View>

                {parseFloat(actionQuantity) > 0 && (
                  <View className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl flex-row items-center justify-between">
                    <Text className="text-emerald-500 dark:text-emerald-300 text-xs font-semibold">New Store Balance:</Text>
                    <Text className="text-emerald-600 dark:text-emerald-300 font-black text-base">
                      {(Number(selectedItem.currentStock) + parseFloat(actionQuantity)).toFixed(1)} {selectedItem.unit}
                    </Text>
                  </View>
                )}
              </View>

              <View className={`flex-row gap-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <TouchableOpacity
                  onPress={() => setStockInModalOpen(false)}
                  className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}
                >
                  <Text className={`font-bold text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSubmitStockIn}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-emerald-600 rounded-xl items-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-xs">+ Confirm Stock In</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL 2: KITCHEN ISSUE (DEDUCT FROM LOAD) */}
      {isKitchenIssueModalOpen && selectedItem && (
        <Modal
          visible={isKitchenIssueModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setKitchenIssueModalOpen(false)}
        >
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className={`border rounded-3xl w-full max-w-md p-5 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <View className={`flex-row items-center justify-between pb-3 border-b ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 items-center justify-center mr-2.5">
                    <Utensils size={18} color="#F59E0B" />
                  </View>
                  <View>
                    <Text className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>Kitchen Issue Entry</Text>
                    <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedItem.name}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setKitchenIssueModalOpen(false)}>
                  <X size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              </View>

              <View className="my-4 gap-3">
                <View className={`p-3 rounded-2xl border flex-row items-center justify-between ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Current Store Balance:</Text>
                  <Text className="text-emerald-500 dark:text-emerald-400 font-black text-sm">{selectedItem.currentStock} {selectedItem.unit}</Text>
                </View>

                <View>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Quantity Taken to Kitchen ({selectedItem.unit}) *</Text>
                  <TextInput
                    placeholder={`e.g. 10`}
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    keyboardType="numeric"
                    value={actionQuantity}
                    onChangeText={setActionQuantity}
                    className={`border rounded-xl px-3.5 py-3 text-base font-bold ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </View>

                <View>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Kitchen Cooking Purpose Note</Text>
                  <TextInput
                    placeholder="e.g. Lunch shift biryani & curry preparation"
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={actionNotes}
                    onChangeText={setActionNotes}
                    className={`border rounded-xl px-3.5 py-2.5 text-xs ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </View>

                <View>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Taken By (Chef / Cook Name)</Text>
                  <TextInput
                    placeholder="Chef name"
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={actionStaff}
                    onChangeText={setActionStaff}
                    className={`border rounded-xl px-3.5 py-2.5 text-xs ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </View>

                {parseFloat(actionQuantity) > 0 && (
                  <View className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl flex-row items-center justify-between">
                    <Text className="text-amber-500 dark:text-amber-300 text-xs font-semibold">Remaining in Store:</Text>
                    <Text className="text-amber-600 dark:text-amber-300 font-black text-base">
                      {Math.max(0, Number(selectedItem.currentStock) - parseFloat(actionQuantity)).toFixed(1)} {selectedItem.unit}
                    </Text>
                  </View>
                )}
              </View>

              <View className={`flex-row gap-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <TouchableOpacity
                  onPress={() => setKitchenIssueModalOpen(false)}
                  className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}
                >
                  <Text className={`font-bold text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSubmitKitchenIssue}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-amber-600 rounded-xl items-center active:bg-amber-700 shadow-md shadow-amber-600/30"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-xs">🍳 Issue to Kitchen</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL 3: ADD NEW RAW INVENTORY ITEM */}
      {isAddItemModalOpen && (
        <Modal
          visible={isAddItemModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAddItemModalOpen(false)}
        >
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className={`border rounded-3xl w-full max-w-md p-5 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <View className={`flex-row items-center justify-between pb-3 border-b ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 items-center justify-center mr-2.5">
                    <Plus size={18} color="#6366F1" />
                  </View>
                  <Text className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>Add Raw Inventory Item</Text>
                </View>
                <TouchableOpacity onPress={() => setAddItemModalOpen(false)}>
                  <X size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              </View>

              <ScrollView className="my-3 max-h-[400px]" showsVerticalScrollIndicator={false}>
                <View className="gap-3">
                  <View>
                    <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Item Name *</Text>
                    <TextInput
                      placeholder="e.g. Basmati Rice, Sunflower Oil, Garam Masala"
                      placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                      value={formName}
                      onChangeText={setFormName}
                      className={`border rounded-xl px-3.5 py-2.5 text-xs font-bold ${
                        isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </View>

                  <View>
                    <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
                      {COMMON_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                        <TouchableOpacity
                          key={c}
                          onPress={() => setFormCategory(c)}
                          className={`px-3 py-1.5 rounded-xl border ${
                            formCategory === c
                              ? 'bg-indigo-600 border-indigo-500'
                              : isDark
                              ? 'bg-slate-950 border-slate-800'
                              : 'bg-slate-100 border-slate-200'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${
                            formCategory === c ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            {c}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View>
                    <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Measurement Unit</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
                      {COMMON_UNITS.map((u) => (
                        <TouchableOpacity
                          key={u}
                          onPress={() => setFormUnit(u)}
                          className={`px-3.5 py-1.5 rounded-xl border ${
                            formUnit === u
                              ? 'bg-[#5D3FD3] border-indigo-400'
                              : isDark
                              ? 'bg-slate-950 border-slate-800'
                              : 'bg-slate-100 border-slate-200'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${
                            formUnit === u ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            {u}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Initial Opening Load</Text>
                      <TextInput
                        placeholder="100"
                        placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                        keyboardType="numeric"
                        value={formStock}
                        onChangeText={setFormStock}
                        className={`border rounded-xl px-3.5 py-2.5 text-xs font-bold ${
                          isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </View>

                    <View className="flex-1">
                      <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Low Stock Alert Min</Text>
                      <TextInput
                        placeholder="15"
                        placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                        keyboardType="numeric"
                        value={formMinThreshold}
                        onChangeText={setFormMinThreshold}
                        className={`border rounded-xl px-3.5 py-2.5 text-xs font-bold ${
                          isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </View>
                  </View>

                </View>
              </ScrollView>

              <View className={`flex-row gap-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <TouchableOpacity
                  onPress={() => setAddItemModalOpen(false)}
                  className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}
                >
                  <Text className={`font-bold text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreateNewItem}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-emerald-600 rounded-xl items-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-xs">Save Raw Item</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL 4: ADJUST / RECONCILE / WASTAGE */}
      {isAdjustModalOpen && selectedItem && (
        <Modal
          visible={isAdjustModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAdjustModalOpen(false)}
        >
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className={`border rounded-3xl w-full max-w-md p-5 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <View className={`flex-row items-center justify-between pb-3 border-b ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 items-center justify-center mr-2.5">
                    <SlidersHorizontal size={18} color="#A855F7" />
                  </View>
                  <View>
                    <Text className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>Reconcile / Adjust</Text>
                    <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedItem.name}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setAdjustModalOpen(false)}>
                  <X size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              </View>

              <View className="my-4 gap-3">
                <View className={`p-3 rounded-2xl border flex-row items-center justify-between ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Recorded System Stock:</Text>
                  <Text className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedItem.currentStock} {selectedItem.unit}</Text>
                </View>

                <View>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>New Physical Count ({selectedItem.unit})</Text>
                  <TextInput
                    placeholder="Enter actual physical count"
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    keyboardType="numeric"
                    value={actionQuantity}
                    onChangeText={setActionQuantity}
                    className={`border rounded-xl px-3.5 py-3 text-base font-bold ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </View>

                <View>
                  <Text className={`text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Reason / Audit Note</Text>
                  <TextInput
                    placeholder="e.g. Month-end physical count check or spoilage"
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={actionNotes}
                    onChangeText={setActionNotes}
                    className={`border rounded-xl px-3.5 py-2.5 text-xs ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </View>
              </View>

              <View className={`flex-row gap-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <TouchableOpacity
                  onPress={() => setAdjustModalOpen(false)}
                  className={`flex-1 py-3 rounded-xl items-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}
                >
                  <Text className={`font-bold text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleSubmitAdjustment('ADJUSTMENT')}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-indigo-600 rounded-xl items-center active:bg-indigo-700"
                >
                  <Text className="text-white font-bold text-xs">Set Balance</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleSubmitAdjustment('WASTAGE')}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-rose-600 rounded-xl items-center active:bg-rose-700"
                >
                  <Text className="text-white font-bold text-xs">Log Wastage</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};
