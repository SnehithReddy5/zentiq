import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Boxes,
  Package,
  Plus,
  Minus,
  Truck,
  Utensils,
  AlertTriangle,
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
} from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useInventoryStore } from '../../store/inventory.store';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
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
  const { items, logs, isLoading, subscribeToInventory } = useInventoryStore();
  const { tenant, activeLocationId } = useTenantStore();
  const { user } = useAuthStore();

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
    Alert.alert(
      'Delete Inventory Item',
      `Are you sure you want to delete "${item.name}" from inventory tracking?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await DBServices.deleteInventoryItem(item.id, tenant?.id, activeLocationId || undefined);
              toast.success(`Deleted ${item.name}`, 'Removed');
            } catch (e: any) {
              toast.error(e.message || 'Could not delete item', 'Error');
            }
          },
        },
      ]
    );
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

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Kitchen Inventory & Store"
        subtitle="Bulk Loads, Kitchen Consumption & Live Ledger"
        rightElement={
          <View className="flex-row items-center gap-2">
            

            <TouchableOpacity
              onPress={() => setAddItemModalOpen(true)}
              className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
            >
              <Plus size={15} color="white" />
              <Text className="text-white font-bold text-xs ml-1.5">+ New Item</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Top 4 KPI Metric Cards */}
      <View className="px-4 pt-3 pb-2 bg-slate-900 border-b border-slate-800">
        <View className="flex-row flex-wrap gap-2">
          {/* Total Items */}
          <View className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-2xl flex-1 min-w-[80px]">
            <View className="flex-row items-center justify-between">
              <Text className="text-slate-400 text-[10px] font-bold uppercase">Items</Text>
              <Boxes size={13} color="#818CF8" />
            </View>
            <Text className="text-white font-black text-lg mt-0.5">{totalItemsCount}</Text>
          </View>

          {/* Healthy Stock */}
          <TouchableOpacity
            onPress={() => setStatusFilter(statusFilter === 'ALL' ? 'ALL' : 'ALL')}
            className="bg-emerald-950/20 border border-emerald-500/30 p-2.5 rounded-2xl flex-1 min-w-[80px]"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-emerald-400 text-[10px] font-bold uppercase">Good Stock</Text>
              <CheckCircle2 size={13} color="#34D399" />
            </View>
            <Text className="text-emerald-300 font-black text-lg mt-0.5">{healthyStockCount}</Text>
          </TouchableOpacity>

          {/* Low Stock Alerts */}
          <TouchableOpacity
            onPress={() => setStatusFilter(statusFilter === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')}
            className={`p-2.5 rounded-2xl flex-1 min-w-[80px] border ${
              statusFilter === 'LOW_STOCK'
                ? 'bg-amber-500/30 border-amber-400'
                : 'bg-amber-950/20 border-amber-500/30'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-amber-400 text-[10px] font-bold uppercase">Low Stock</Text>
              <AlertTriangle size={13} color="#FBBF24" />
            </View>
            <Text className="text-amber-300 font-black text-lg mt-0.5">{lowStockCount}</Text>
          </TouchableOpacity>

          {/* Out of Stock */}
          <TouchableOpacity
            onPress={() => setStatusFilter(statusFilter === 'OUT_OF_STOCK' ? 'ALL' : 'OUT_OF_STOCK')}
            className={`p-2.5 rounded-2xl flex-1 min-w-[80px] border ${
              statusFilter === 'OUT_OF_STOCK'
                ? 'bg-rose-500/30 border-rose-400'
                : 'bg-rose-950/20 border-rose-500/30'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-rose-400 text-[10px] font-bold uppercase">Out of Stock</Text>
              <TrendingDown size={13} color="#F43F5E" />
            </View>
            <Text className="text-rose-300 font-black text-lg mt-0.5">{outOfStockCount}</Text>
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
            className={`px-3.5 py-2.5 rounded-2xl flex-row items-center ${
              activeTab === 'BALANCE' ? 'bg-[#5D3FD3]' : 'bg-slate-950 border border-slate-800'
            }`}
          >
            <Package size={14} color={activeTab === 'BALANCE' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'BALANCE' ? 'text-white' : 'text-slate-400'}`}>
              Stock Balance ({items.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('STOCK_IN_LOGS')}
            className={`px-3.5 py-2.5 rounded-2xl flex-row items-center ${
              activeTab === 'STOCK_IN_LOGS' ? 'bg-emerald-600' : 'bg-slate-950 border border-slate-800'
            }`}
          >
            <Truck size={14} color={activeTab === 'STOCK_IN_LOGS' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'STOCK_IN_LOGS' ? 'text-white' : 'text-slate-400'}`}>
              Received Loads ({stockInLogs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('KITCHEN_ISSUE_LOGS')}
            className={`px-3.5 py-2.5 rounded-2xl flex-row items-center ${
              activeTab === 'KITCHEN_ISSUE_LOGS' ? 'bg-amber-600' : 'bg-slate-950 border border-slate-800'
            }`}
          >
            <Utensils size={14} color={activeTab === 'KITCHEN_ISSUE_LOGS' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'KITCHEN_ISSUE_LOGS' ? 'text-white' : 'text-slate-400'}`}>
              Kitchen Usage ({kitchenIssueLogs.length})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* TAB 1: STOCK BALANCE PAGE */}
      {activeTab === 'BALANCE' && (
        <View className="flex-1">
          {/* Search & Filter Bar */}
          <View className="bg-slate-900/60 px-4 py-2.5 border-b border-slate-800 gap-2">
            <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2">
              <Search size={15} color="#94A3B8" />
              <TextInput
                placeholder="Search raw items (e.g. Rice, Oil, Spices, Onions)..."
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 text-white text-xs ml-2 py-0"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={15} color="#94A3B8" />
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
                    selectedCategory === cat ? 'bg-indigo-600/30 border-indigo-400' : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <Text className={`text-xs font-bold ${selectedCategory === cat ? 'text-indigo-300' : 'text-slate-400'}`}>
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
              <Text className="text-slate-400 text-xs font-semibold mt-3">Loading store inventory...</Text>
            </View>
          ) : (
            <FlatList
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
                  <View className="bg-slate-900 border border-slate-800 rounded-3xl p-4 mb-3 shadow-md">
                    {/* Item Header */}
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center flex-wrap gap-1.5 mb-1">
                          <Text className="text-white font-black text-lg">{item.name}</Text>
                          <View className="bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded">
                            <Text className="text-indigo-300 text-[10px] font-bold uppercase">{item.category}</Text>
                          </View>
                        </View>

                        {/* Status Badge */}
                        <View className="flex-row items-center gap-1.5">
                          <View className={`w-2 h-2 rounded-full ${isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                          <Text className={`text-[11px] font-bold uppercase tracking-wider ${
                            isOutOfStock ? 'text-rose-400' : isLowStock ? 'text-amber-300' : 'text-emerald-400'
                          }`}>
                            {isOutOfStock ? 'OUT OF STOCK' : isLowStock ? `LOW STOCK (Min: ${min} ${item.unit})` : 'HEALTHY BALANCE'}
                          </Text>
                        </View>
                      </View>

                      {/* Current Active Balance Highlight */}
                      <View className="items-end bg-slate-950/80 border border-slate-800 px-3.5 py-2 rounded-2xl">
                        <Text className="text-slate-400 text-[10px] font-bold uppercase">Store Balance</Text>
                        <Text className={`text-2xl font-black ${
                          isOutOfStock ? 'text-rose-400' : isLowStock ? 'text-amber-300' : 'text-emerald-400'
                        }`}>
                          {stock} <Text className="text-xs text-slate-400 font-bold">{item.unit}</Text>
                        </Text>
                      </View>
                    </View>

                    {/* Stock Meter Progress Bar */}
                    <View className="mt-3">
                      <View className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <View
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full ${
                            isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        />
                      </View>
                    </View>

                    {/* Summary Stats Row */}
                    <View className="flex-row items-center justify-between mt-3 pt-2.5 border-t border-slate-800/80">
                      <View className="flex-row items-center">
                        <Truck size={12} color="#34D399" />
                        <Text className="text-slate-400 text-xs ml-1.5">
                          Total Received: <Text className="text-slate-200 font-bold">{totalIn} {item.unit}</Text>
                        </Text>
                      </View>

                      <View className="flex-row items-center">
                        <Utensils size={12} color="#F59E0B" />
                        <Text className="text-slate-400 text-xs ml-1.5">
                          Taken to Kitchen: <Text className="text-slate-200 font-bold">{totalOut} {item.unit}</Text>
                        </Text>
                      </View>
                    </View>

                    {/* Activity Tracking: When updated or deducted */}
                    <View className="mt-2.5 pt-2 border-t border-slate-800/60 flex-row items-center justify-between flex-wrap gap-2">
                      <View className="flex-row items-center">
                        <Clock size={11} color="#94A3B8" />
                        <Text className="text-slate-400 text-[11px] ml-1">
                          Last Updated: <Text className="text-slate-200 font-bold">{formatLogDate(item.lastIssuedAt || item.lastRestockedAt || item.updatedAt)}</Text>
                        </Text>
                      </View>

                      {item.lastIssuedAt ? (
                        <View className="bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25 flex-row items-center">
                          <Utensils size={10} color="#FBBF24" />
                          <Text className="text-amber-400 text-[10px] font-bold ml-1">
                            Deducted: {formatLogDate(item.lastIssuedAt)}
                          </Text>
                        </View>
                      ) : item.lastRestockedAt ? (
                        <View className="bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/25 flex-row items-center">
                          <Truck size={10} color="#34D399" />
                          <Text className="text-emerald-400 text-[10px] font-bold ml-1">
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
                        <Plus size={14} color="#34D399" />
                        <Text className="text-emerald-300 font-black text-xs ml-1">+ Load Stock</Text>
                      </TouchableOpacity>

                      {/* - Take to Kitchen Button */}
                      <TouchableOpacity
                        onPress={() => handleOpenKitchenIssue(item)}
                        disabled={isOutOfStock}
                        className={`flex-1 py-2.5 rounded-2xl flex-row items-center justify-center border ${
                          isOutOfStock
                            ? 'bg-slate-800/40 border-slate-800 opacity-40'
                            : 'bg-amber-600/20 border-amber-500/40 active:bg-amber-600/30'
                        }`}
                      >
                        <Utensils size={14} color="#FBBF24" />
                        <Text className="text-amber-300 font-black text-xs ml-1">🍳 Kitchen Issue</Text>
                      </TouchableOpacity>

                      {/* Adjust / Reconcile */}
                      <TouchableOpacity
                        onPress={() => handleOpenAdjustStock(item)}
                        className="p-2.5 bg-slate-800 border border-slate-700 rounded-2xl active:bg-slate-750"
                        accessibilityLabel="Adjust Stock"
                      >
                        <SlidersHorizontal size={14} color="#CBD5E1" />
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
                  <Boxes size={48} color="#475569" />
                  <Text className="text-white font-bold text-base mt-3">No inventory items found</Text>
                  <Text className="text-slate-500 text-xs mt-1 text-center max-w-xs">
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
          <View className="px-4 py-2 bg-slate-900 border-b border-slate-800">
            <Text className="text-slate-400 text-xs">
              Showing incoming inventory shipments loaded into the store room.
            </Text>
          </View>
          <FlatList
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
              <View className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl mb-2 flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 mr-3">
                  <View className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mr-3 shrink-0">
                    <Truck size={18} color="#34D399" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-black text-sm">{item.itemName}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>
                      {item.notes || 'Bulk load received'}
                    </Text>
                    <Text className="text-slate-500 text-[10px] mt-0.5">
                      {formatLogDate(item.createdAt)} • By {item.recordedBy || 'Staff'}
                    </Text>
                  </View>
                </View>

                <View className="items-end shrink-0">
                  <View className="bg-emerald-500/20 px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
                    <Text className="text-emerald-300 font-black text-sm">+{item.quantity} {item.unit}</Text>
                  </View>
                  <Text className="text-slate-400 text-[10px] mt-1">
                    Balance: {item.newStock} {item.unit}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="py-20 items-center justify-center">
                <Truck size={44} color="#475569" />
                <Text className="text-slate-400 font-bold text-xs mt-2">No received loads logged yet</Text>
                <Text className="text-slate-500 text-[11px] mt-0.5">Tap '+ Load Stock' on any item in Stock Balance tab.</Text>
              </View>
            }
          />
        </View>
      )}

      {/* TAB 3: KITCHEN USAGE / ISSUES LOG */}
      {activeTab === 'KITCHEN_ISSUE_LOGS' && (
        <View className="flex-1">
          <View className="px-4 py-2 bg-slate-900 border-b border-slate-800">
            <Text className="text-slate-400 text-xs">
              Showing raw materials taken to the kitchen floor for active cooking.
            </Text>
          </View>
          <FlatList
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
              <View className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl mb-2 flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 mr-3">
                  <View className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 items-center justify-center mr-3 shrink-0">
                    <Utensils size={18} color="#FBBF24" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-black text-sm">{item.itemName}</Text>
                    <Text className="text-amber-300/80 text-xs mt-0.5" numberOfLines={1}>
                      {item.notes || 'Issued to kitchen for cooking'}
                    </Text>
                    <Text className="text-slate-500 text-[10px] mt-0.5">
                      {formatLogDate(item.createdAt)} • Taken by {item.recordedBy || 'Chef'}
                    </Text>
                  </View>
                </View>

                <View className="items-end shrink-0">
                  <View className="bg-amber-500/20 px-2.5 py-0.5 rounded-lg border border-amber-500/30">
                    <Text className="text-amber-300 font-black text-sm">-{item.quantity} {item.unit}</Text>
                  </View>
                  <Text className="text-slate-400 text-[10px] mt-1">
                    Store Left: {item.newStock} {item.unit}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="py-20 items-center justify-center">
                <Utensils size={44} color="#475569" />
                <Text className="text-slate-400 font-bold text-xs mt-2">No kitchen issues logged yet</Text>
                <Text className="text-slate-500 text-[11px] mt-0.5">Tap '🍳 Kitchen Issue' on any item when taking supplies to cook.</Text>
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
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mr-2.5">
                    <Truck size={18} color="#34D399" />
                  </View>
                  <View>
                    <Text className="text-white font-black text-base">Receive Bulk Load</Text>
                    <Text className="text-slate-400 text-xs">{selectedItem.name}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setStockInModalOpen(false)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View className="my-4 gap-3">
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex-row items-center justify-between">
                  <Text className="text-slate-400 text-xs">Current Store Balance:</Text>
                  <Text className="text-white font-black text-sm">{selectedItem.currentStock} {selectedItem.unit}</Text>
                </View>

                <View>
                  <Text className="text-slate-300 text-xs font-bold mb-1">Load Quantity Received ({selectedItem.unit}) *</Text>
                  <TextInput
                    placeholder={`e.g. 100`}
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={actionQuantity}
                    onChangeText={setActionQuantity}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white text-base font-bold"
                  />
                </View>

                <View>
                  <Text className="text-slate-300 text-xs font-bold mb-1">Supplier / Delivery Invoice Note</Text>
                  <TextInput
                    placeholder="e.g. Received from Metro Cash & Carry - Batch #42"
                    placeholderTextColor="#64748B"
                    value={actionNotes}
                    onChangeText={setActionNotes}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs"
                  />
                </View>

                <View>
                  <Text className="text-slate-300 text-xs font-bold mb-1">Received By (Staff Name)</Text>
                  <TextInput
                    placeholder="Staff name"
                    placeholderTextColor="#64748B"
                    value={actionStaff}
                    onChangeText={setActionStaff}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs"
                  />
                </View>

                {parseFloat(actionQuantity) > 0 && (
                  <View className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl flex-row items-center justify-between">
                    <Text className="text-emerald-300 text-xs font-semibold">New Store Balance:</Text>
                    <Text className="text-emerald-300 font-black text-base">
                      {(Number(selectedItem.currentStock) + parseFloat(actionQuantity)).toFixed(1)} {selectedItem.unit}
                    </Text>
                  </View>
                )}
              </View>

              <View className="flex-row gap-2 pt-2 border-t border-slate-800">
                <TouchableOpacity
                  onPress={() => setStockInModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
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
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 items-center justify-center mr-2.5">
                    <Utensils size={18} color="#FBBF24" />
                  </View>
                  <View>
                    <Text className="text-white font-black text-base">Kitchen Issue Entry</Text>
                    <Text className="text-slate-400 text-xs">{selectedItem.name}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setKitchenIssueModalOpen(false)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View className="my-4 gap-3">
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex-row items-center justify-between">
                  <Text className="text-slate-400 text-xs">Current Store Balance:</Text>
                  <Text className="text-emerald-400 font-black text-sm">{selectedItem.currentStock} {selectedItem.unit}</Text>
                </View>

                <View>
                  <Text className="text-slate-300 text-xs font-bold mb-1">Quantity Taken to Kitchen ({selectedItem.unit}) *</Text>
                  <TextInput
                    placeholder={`e.g. 10`}
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={actionQuantity}
                    onChangeText={setActionQuantity}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white text-base font-bold"
                  />
                </View>

                <View>
                  <Text className="text-slate-300 text-xs font-bold mb-1">Kitchen Cooking Purpose Note</Text>
                  <TextInput
                    placeholder="e.g. Lunch shift biryani & curry preparation"
                    placeholderTextColor="#64748B"
                    value={actionNotes}
                    onChangeText={setActionNotes}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs"
                  />
                </View>

                <View>
                  <Text className="text-slate-300 text-xs font-bold mb-1">Taken By (Chef / Cook Name)</Text>
                  <TextInput
                    placeholder="Chef name"
                    placeholderTextColor="#64748B"
                    value={actionStaff}
                    onChangeText={setActionStaff}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs"
                  />
                </View>

                {parseFloat(actionQuantity) > 0 && (
                  <View className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl flex-row items-center justify-between">
                    <Text className="text-amber-300 text-xs font-semibold">Remaining in Store:</Text>
                    <Text className="text-amber-300 font-black text-base">
                      {Math.max(0, Number(selectedItem.currentStock) - parseFloat(actionQuantity)).toFixed(1)} {selectedItem.unit}
                    </Text>
                  </View>
                )}
              </View>

              <View className="flex-row gap-2 pt-2 border-t border-slate-800">
                <TouchableOpacity
                  onPress={() => setKitchenIssueModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
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
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 items-center justify-center mr-2.5">
                    <Plus size={18} color="#818CF8" />
                  </View>
                  <Text className="text-white font-black text-base">Add Raw Inventory Item</Text>
                </View>
                <TouchableOpacity onPress={() => setAddItemModalOpen(false)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView className="my-3 max-h-[400px]" showsVerticalScrollIndicator={false}>
                <View className="gap-3">
                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-1">Item Name *</Text>
                    <TextInput
                      placeholder="e.g. Basmati Rice, Sunflower Oil, Garam Masala"
                      placeholderTextColor="#64748B"
                      value={formName}
                      onChangeText={setFormName}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-bold"
                    />
                  </View>

                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-1">Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
                      {COMMON_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                        <TouchableOpacity
                          key={c}
                          onPress={() => setFormCategory(c)}
                          className={`px-3 py-1.5 rounded-xl border ${
                            formCategory === c ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${formCategory === c ? 'text-white' : 'text-slate-400'}`}>
                            {c}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-1">Measurement Unit</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
                      {COMMON_UNITS.map((u) => (
                        <TouchableOpacity
                          key={u}
                          onPress={() => setFormUnit(u)}
                          className={`px-3.5 py-1.5 rounded-xl border ${
                            formUnit === u ? 'bg-[#5D3FD3] border-indigo-400' : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${formUnit === u ? 'text-white' : 'text-slate-400'}`}>
                            {u}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Text className="text-slate-300 text-xs font-bold mb-1">Initial Opening Load</Text>
                      <TextInput
                        placeholder="100"
                        placeholderTextColor="#64748B"
                        keyboardType="numeric"
                        value={formStock}
                        onChangeText={setFormStock}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-bold"
                      />
                    </View>

                    <View className="flex-1">
                      <Text className="text-slate-300 text-xs font-bold mb-1">Low Stock Alert Min</Text>
                      <TextInput
                        placeholder="15"
                        placeholderTextColor="#64748B"
                        keyboardType="numeric"
                        value={formMinThreshold}
                        onChangeText={setFormMinThreshold}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-bold"
                      />
                    </View>
                  </View>

                  </View>
              </ScrollView>

              <View className="flex-row gap-2 pt-2 border-t border-slate-800">
                <TouchableOpacity
                  onPress={() => setAddItemModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
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
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 items-center justify-center mr-2.5">
                    <SlidersHorizontal size={18} color="#C084FC" />
                  </View>
                  <View>
                    <Text className="text-white font-black text-base">Reconcile / Adjust</Text>
                    <Text className="text-slate-400 text-xs">{selectedItem.name}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setAdjustModalOpen(false)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View className="my-4 gap-3">
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex-row items-center justify-between">
                  <Text className="text-slate-400 text-xs">Recorded System Stock:</Text>
                  <Text className="text-white font-black text-sm">{selectedItem.currentStock} {selectedItem.unit}</Text>
                </View>

                <View>
                  <Text className="text-slate-300 text-xs font-bold mb-1">New Physical Count ({selectedItem.unit})</Text>
                  <TextInput
                    placeholder="Enter actual physical count"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={actionQuantity}
                    onChangeText={setActionQuantity}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white text-base font-bold"
                  />
                </View>

                <View>
                  <Text className="text-slate-300 text-xs font-bold mb-1">Reason / Audit Note</Text>
                  <TextInput
                    placeholder="e.g. Month-end physical count check or spoilage"
                    placeholderTextColor="#64748B"
                    value={actionNotes}
                    onChangeText={setActionNotes}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs"
                  />
                </View>
              </View>

              <View className="flex-row gap-2 pt-2 border-t border-slate-800">
                <TouchableOpacity
                  onPress={() => setAdjustModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
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
