import React, { useState, useEffect, useMemo } from 'react';
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
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChefHat,
  UtensilsCrossed,
  Package,
  Plus,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  X,
  Trash2,
  Users,
  Copy,
  Check,
  ShieldCheck,
  Ban,
  FileText,
  SlidersHorizontal,
  Sparkles,
  ArrowRight,
  Printer,
  Calendar,
} from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { useCentralKitchenStore } from '../../store/centralKitchen.store';
import { DBServices } from '../../services/firebase/db';
import { toast } from '../../utils/toast';
import { CKMenuItem, CKOrder, CKPartner, CKOrderStatus } from '../../types/centralKitchen.types';

const COMMON_CATEGORIES = [
  'All',
  'Gravies & Curries',
  'Rice & Biryani',
  'Marinated Meats',
  'Bakery & Breads',
  'Desserts & Others',
];

const COMMON_UNITS = ['kg', 'litres', 'deg', 'portions', 'pcs', 'packets'];

export const CentralKitchenScreen = () => {
  const insets = useSafeAreaInsets();
  const { tenant, activeLocationId } = useTenantStore();
  const { user } = useAuthStore();

  const {
    ckProfile,
    menuItems,
    incomingOrders,
    isLoading,
    loadCKProfile,
    loadCKMenuItems,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    updatePartnerStatus,
    updateOrderStatus,
    subscribeToIncomingOrders,
  } = useCentralKitchenStore();

  const [activeTab, setActiveTab] = useState<'ORDERS' | 'MENU' | 'WHITELIST'>('ORDERS');
  const [copiedCode, setCopiedCode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isItemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CKMenuItem | null>(null);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<CKOrder | null>(null);
  const [isRejectModalOpen, setRejectModalOpen] = useState(false);
  const [orderToReject, setOrderToReject] = useState<CKOrder | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Central Kitchen capacity full for this shift');

  // Form state for adding/editing B2B menu item
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Gravies & Curries');
  const [formUnit, setFormUnit] = useState('kg');
  const [formPrice, setFormPrice] = useState('');
  const [formMinQty, setFormMinQty] = useState('5');
  const [formDesc, setFormDesc] = useState('');
  const [formAvailable, setFormAvailable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize CK profile & listeners
  useEffect(() => {
    if (tenant?.id) {
      loadCKProfile(tenant.id, activeLocationId || 'main', tenant.businessName || 'Central Kitchen');
      loadCKMenuItems(tenant.id);
      const unsub = subscribeToIncomingOrders(tenant.id);
      return () => unsub();
    }
  }, [tenant?.id, activeLocationId]);

  // Copy partner code
  const handleCopyPartnerCode = () => {
    if (!ckProfile?.partnerCode) return;
    setCopiedCode(true);
    toast.success(`Copied code: ${ckProfile.partnerCode}`, 'Code Copied');
    setTimeout(() => setCopiedCode(false), 3000);
  };

  // Open Add Item Modal
  const handleOpenAddItem = () => {
    setEditingItem(null);
    setFormName('');
    setFormCategory('Gravies & Curries');
    setFormUnit('kg');
    setFormPrice('');
    setFormMinQty('5');
    setFormDesc('');
    setFormAvailable(true);
    setItemModalOpen(true);
  };

  // Open Edit Item Modal
  const handleOpenEditItem = (item: CKMenuItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormUnit(item.unit);
    setFormPrice(String(item.pricePerUnit));
    setFormMinQty(String(item.minOrderQty || 1));
    setFormDesc(item.description || '');
    setFormAvailable(item.isAvailable !== false);
    setItemModalOpen(true);
  };

  // Save Item
  const handleSaveItem = async () => {
    if (!formName.trim() || !formPrice.trim()) {
      toast.warning('Please enter food item name and wholesale price.');
      return;
    }

    const price = parseFloat(formPrice);
    const minQty = parseFloat(formMinQty) || 1;
    if (isNaN(price) || price <= 0) {
      toast.warning('Please enter a valid wholesale rate.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await updateMenuItem(editingItem.id, {
          name: formName.trim(),
          category: formCategory,
          unit: formUnit,
          pricePerUnit: price,
          minOrderQty: minQty,
          description: formDesc.trim(),
          isAvailable: formAvailable,
        });
      } else if (tenant?.id) {
        await createMenuItem(tenant.id, {
          ckTenantId: tenant.id,
          name: formName.trim(),
          category: formCategory,
          unit: formUnit,
          pricePerUnit: price,
          minOrderQty: minQty,
          description: formDesc.trim(),
          isAvailable: formAvailable,
        });
      }
      setItemModalOpen(false);
    } catch (e: any) {
      // toast shown in store
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Item
  const handleDeleteItem = (item: CKMenuItem) => {
    Alert.alert(
      'Remove Bulk Item',
      `Are you sure you want to remove "${item.name}" from your B2B menu?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMenuItem(item.id) },
      ]
    );
  };

  // Seed Starter Menu
  const handleSeedMenu = async () => {
    if (!tenant?.id) return;
    try {
      setIsSubmitting(true);
      await DBServices.seedStarterCKMenu(tenant.id);
      await loadCKMenuItems(tenant.id);
      toast.success('Starter bulk food catalog loaded successfully!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to seed menu');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Order Accept
  const handleAcceptOrder = (order: CKOrder) => {
    Alert.alert(
      'Accept B2B Food Order',
      `Accept order #${order.orderNumber} from "${order.buyerBusinessName}" for ${order.deliveryShift.replace(/_/g, ' ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept & Cook', onPress: () => updateOrderStatus(order.id, 'ACCEPTED') },
      ]
    );
  };

  // Order Reject
  const handleOpenRejectOrder = (order: CKOrder) => {
    setOrderToReject(order);
    setRejectionReason('Central Kitchen capacity full for this shift');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!orderToReject) return;
    try {
      await updateOrderStatus(orderToReject.id, 'REJECTED', rejectionReason);
      setRejectModalOpen(false);
      setOrderToReject(null);
    } catch (e) {}
  };

  // Order Dispatch
  const handleDispatchOrder = (order: CKOrder) => {
    Alert.alert(
      'Mark as Dispatched',
      `Mark order #${order.orderNumber} as dispatched for delivery to "${order.buyerBusinessName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dispatch Food', onPress: () => updateOrderStatus(order.id, 'DISPATCHED') },
      ]
    );
  };

  // Filtered menu items
  const filteredMenuItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Order counts
  const pendingOrdersCount = incomingOrders.filter((o) => o.status === 'PENDING').length;
  const acceptedOrdersCount = incomingOrders.filter((o) => o.status === 'ACCEPTED').length;

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Central Kitchen Hub"
        subtitle="B2B Bulk Food Supply & Orders"
        rightElement={
          <View className="flex-row items-center gap-2">
            {ckProfile && (
              <TouchableOpacity
                onPress={handleCopyPartnerCode}
                className="bg-indigo-600/20 border border-indigo-500/40 px-3 py-1.5 rounded-xl flex-row items-center"
              >
                <ShieldCheck size={14} color="#818CF8" />
                <Text className="text-indigo-300 font-bold text-xs ml-1.5">
                  Code: {ckProfile.partnerCode}
                </Text>
                {copiedCode ? (
                  <Check size={12} color="#34D399" className="ml-1" />
                ) : (
                  <Copy size={12} color="#818CF8" className="ml-1" />
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleOpenAddItem}
              className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center active:bg-emerald-700"
            >
              <Plus size={15} color="white" />
              <Text className="text-white font-bold text-xs ml-1">+ New Food Item</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Top 3 View Tabs with Horizontal ScrollView */}
      <View className="px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}
        >
          <TouchableOpacity
            onPress={() => setActiveTab('ORDERS')}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center ${
              activeTab === 'ORDERS' ? 'bg-[#5D3FD3]' : 'bg-slate-950 border border-slate-800'
            }`}
          >
            <ChefHat size={14} color={activeTab === 'ORDERS' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'ORDERS' ? 'text-white' : 'text-slate-400'}`}>
              Incoming Orders ({incomingOrders.length})
            </Text>
            {pendingOrdersCount > 0 && (
              <View className="ml-2 bg-amber-500 px-2 py-0.5 rounded-full">
                <Text className="text-slate-950 font-black text-[10px]">{pendingOrdersCount} NEW</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('MENU')}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center ${
              activeTab === 'MENU' ? 'bg-emerald-600' : 'bg-slate-950 border border-slate-800'
            }`}
          >
            <UtensilsCrossed size={14} color={activeTab === 'MENU' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'MENU' ? 'text-white' : 'text-slate-400'}`}>
              Bulk Food Catalog ({menuItems.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('WHITELIST')}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center ${
              activeTab === 'WHITELIST' ? 'bg-indigo-600' : 'bg-slate-950 border border-slate-800'
            }`}
          >
            <Users size={14} color={activeTab === 'WHITELIST' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'WHITELIST' ? 'text-white' : 'text-slate-400'}`}>
              Partner Whitelist ({ckProfile?.whitelistedPartners?.length || 0})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* TAB 1: INCOMING FOOD ORDERS */}
      {activeTab === 'ORDERS' && (
        <View className="flex-1">
          <FlatList
            data={incomingOrders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              padding: 12,
              paddingBottom: Math.max(insets.bottom + 40, 60),
              maxWidth: 1600,
              alignSelf: 'center',
              width: '100%',
            }}
            renderItem={({ item }) => {
              const isPending = item.status === 'PENDING';
              const isAccepted = item.status === 'ACCEPTED';
              const isDispatched = item.status === 'DISPATCHED';
              const isDelivered = item.status === 'DELIVERED';
              const isRejected = item.status === 'REJECTED';

              return (
                <View className="bg-slate-900 border border-slate-800 rounded-3xl p-4 mb-3 shadow-md">
                  {/* Order Header */}
                  <View className="flex-row items-start justify-between pb-3 border-b border-slate-800">
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center flex-wrap gap-2 mb-1">
                        <Text className="text-white font-black text-base">#{item.orderNumber}</Text>
                        <View className={`px-2 py-0.5 rounded-md border ${
                          item.isInternalBranch
                            ? 'bg-purple-500/15 border-purple-500/30'
                            : 'bg-indigo-500/15 border-indigo-500/30'
                        }`}>
                          <Text className={`text-[10px] font-bold uppercase ${
                            item.isInternalBranch ? 'text-purple-300' : 'text-indigo-300'
                          }`}>
                            {item.isInternalBranch ? 'Internal Branch' : 'External Partner'}
                          </Text>
                        </View>
                        <View className="bg-slate-800 px-2 py-0.5 rounded-md">
                          <Text className="text-slate-300 text-[10px] font-semibold">
                            {item.deliveryShift.replace(/_/g, ' ')}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-slate-300 font-bold text-sm">{item.buyerBusinessName}</Text>
                      {item.shiftDate && (
                        <Text className="text-slate-400 text-xs mt-0.5">Required for: {item.shiftDate}</Text>
                      )}
                    </View>

                    {/* Status Pill */}
                    <View className={`px-3 py-1 rounded-xl border items-end ${
                      isPending
                        ? 'bg-amber-500/15 border-amber-500/30'
                        : isAccepted
                        ? 'bg-indigo-500/15 border-indigo-500/30'
                        : isDispatched
                        ? 'bg-sky-500/15 border-sky-500/30'
                        : isDelivered
                        ? 'bg-emerald-500/15 border-emerald-500/30'
                        : 'bg-rose-500/15 border-rose-500/30'
                    }`}>
                      <Text className={`text-xs font-black ${
                        isPending
                          ? 'text-amber-400'
                          : isAccepted
                          ? 'text-indigo-400'
                          : isDispatched
                          ? 'text-sky-400'
                          : isDelivered
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}>
                        {item.status}
                      </Text>
                      <Text className="text-white font-black text-sm mt-0.5">₹{item.totalAmount.toFixed(2)}</Text>
                    </View>
                  </View>

                  {/* Order Items Table */}
                  <View className="my-3 bg-slate-950/80 rounded-2xl p-3 border border-slate-800/80">
                    {item.items.map((i, idx) => (
                      <View key={idx} className="flex-row items-center justify-between py-1.5 border-b border-slate-800/40 last:border-b-0">
                        <View className="flex-1 mr-2">
                          <Text className="text-white font-bold text-xs">{i.name}</Text>
                          <Text className="text-slate-400 text-[10px]">
                            {i.quantity} {i.unit} × ₹{i.ratePerUnit}/{i.unit}
                          </Text>
                        </View>
                        <Text className="text-slate-200 font-bold text-xs">₹{i.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                    {item.notes ? (
                      <View className="mt-2 pt-2 border-t border-slate-800 flex-row items-center">
                        <Text className="text-amber-400 text-[11px] italic">Note: "{item.notes}"</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row items-center gap-2 pt-1">
                    {isPending && (
                      <>
                        <TouchableOpacity
                          onPress={() => handleAcceptOrder(item)}
                          className="flex-1 bg-emerald-600 py-2.5 rounded-2xl flex-row items-center justify-center active:bg-emerald-700"
                        >
                          <CheckCircle2 size={15} color="white" />
                          <Text className="text-white font-black text-xs ml-1.5">Accept & Cook</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleOpenRejectOrder(item)}
                          className="flex-1 bg-rose-500/15 border border-rose-500/30 py-2.5 rounded-2xl flex-row items-center justify-center active:bg-rose-500/25"
                        >
                          <XCircle size={15} color="#F43F5E" />
                          <Text className="text-rose-400 font-bold text-xs ml-1.5">Reject</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {isAccepted && (
                      <TouchableOpacity
                        onPress={() => handleDispatchOrder(item)}
                        className="flex-1 bg-sky-600 py-2.5 rounded-2xl flex-row items-center justify-center active:bg-sky-700"
                      >
                        <Truck size={15} color="white" />
                        <Text className="text-white font-black text-xs ml-1.5">Mark Dispatched</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() => setSelectedOrderForInvoice(item)}
                      className="p-2.5 bg-slate-800 border border-slate-700 rounded-2xl active:bg-slate-750 flex-row items-center"
                    >
                      <FileText size={15} color="#CBD5E1" />
                      <Text className="text-slate-300 font-bold text-xs ml-1.5">B2B Bill</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="py-20 items-center justify-center">
                <ChefHat size={48} color="#475569" />
                <Text className="text-white font-bold text-base mt-3">No incoming food orders yet</Text>
                <Text className="text-slate-500 text-xs mt-1 text-center max-w-xs">
                  Connected outlets and partner restaurants can order bulk gravies, biryani bases, and food from your Central Kitchen.
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* TAB 2: BULK FOOD CATALOG */}
      {activeTab === 'MENU' && (
        <View className="flex-1">
          {/* Search & Categories */}
          <View className="bg-slate-900/60 px-4 py-2.5 border-b border-slate-800 gap-2">
            <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2">
              <Search size={15} color="#94A3B8" />
              <TextInput
                placeholder="Search food items (e.g. Gravy, Biryani, Tandoori)..."
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

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
              {COMMON_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full border ${
                    selectedCategory === cat ? 'bg-emerald-600/30 border-emerald-400' : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <Text className={`text-xs font-bold ${selectedCategory === cat ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={filteredMenuItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              padding: 12,
              paddingBottom: Math.max(insets.bottom + 40, 60),
              maxWidth: 1600,
              alignSelf: 'center',
              width: '100%',
            }}
            renderItem={({ item }) => (
              <View className={`bg-slate-900 border p-4 rounded-3xl mb-3 flex-row items-center justify-between shadow-md ${
                item.isAvailable === false ? 'border-rose-900/50 opacity-80' : 'border-slate-800'
              }`}>
                <View className="flex-1 mr-3">
                  <View className="flex-row items-center flex-wrap gap-1.5 mb-1">
                    <Text className="text-white font-black text-base">{item.name}</Text>
                    <View className="bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                      <Text className="text-emerald-300 text-[10px] font-bold uppercase">{item.category}</Text>
                    </View>
                    {item.isAvailable === false && (
                      <View className="bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 rounded">
                        <Text className="text-rose-400 text-[10px] font-black uppercase">OUT OF STOCK</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-slate-400 text-xs">
                    ₹{item.pricePerUnit} / {item.unit} • <Text className="text-slate-300 font-semibold">Min: {item.minOrderQty} {item.unit}</Text>
                  </Text>
                  {item.description ? (
                    <Text className="text-slate-500 text-[11px] mt-1" numberOfLines={2}>{item.description}</Text>
                  ) : null}
                </View>

                {/* Edit & Delete */}
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => handleOpenEditItem(item)}
                    className="p-2.5 rounded-2xl bg-slate-800 border border-slate-700"
                  >
                    <SlidersHorizontal size={15} color="#818CF8" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDeleteItem(item)}
                    className="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/30"
                  >
                    <Trash2 size={15} color="#F43F5E" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="py-20 items-center justify-center">
                <UtensilsCrossed size={48} color="#475569" />
                <Text className="text-white font-bold text-base mt-3">No bulk food items added</Text>
                <Text className="text-slate-500 text-xs mt-1 text-center max-w-xs">
                  Add gravies, marinated meats, and biryani bases to supply to partner restaurants.
                </Text>
                <TouchableOpacity
                  onPress={handleSeedMenu}
                  className="mt-4 bg-[#5D3FD3] px-5 py-2.5 rounded-2xl flex-row items-center"
                >
                  <Sparkles size={16} color="white" />
                  <Text className="text-white font-bold text-xs ml-2">Load Starter CK Food Menu</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>
      )}

      {/* TAB 3: PARTNER WHITELIST */}
      {activeTab === 'WHITELIST' && (
        <View className="flex-1 p-4 max-w-2xl self-center w-full">
          {/* Partner Code Card */}
          <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-4 shadow-xl">
            <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 items-center justify-center mr-3">
                  <ShieldCheck size={20} color="#818CF8" />
                </View>
                <View>
                  <Text className="text-white font-black text-base">Your Partner Whitelist Code</Text>
                  <Text className="text-slate-400 text-xs">Share this code with external restaurants</Text>
                </View>
              </View>
            </View>

            <View className="mt-4 bg-slate-950 border border-slate-800 p-4 rounded-2xl flex-row items-center justify-between">
              <View>
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Partner Connect Code</Text>
                <Text className="text-indigo-400 font-black text-2xl tracking-widest mt-0.5">
                  {ckProfile?.partnerCode || 'GENERATING...'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCopyPartnerCode}
                className="bg-indigo-600 px-4 py-2 rounded-xl flex-row items-center active:bg-indigo-700"
              >
                {copiedCode ? <Check size={16} color="white" /> : <Copy size={16} color="white" />}
                <Text className="text-white font-bold text-xs ml-1.5">{copiedCode ? 'Copied' : 'Copy Code'}</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-slate-400 text-xs mt-3 leading-5">
              🛡️ <Text className="font-bold text-slate-300">How Whitelisting Works:</Text> External restaurants or cafes must enter this partner code on their POS terminal before they can view your wholesale menu or place bulk food orders.
            </Text>
          </View>

          {/* Connected Whitelisted Partners List */}
          <Text className="text-white font-black text-sm mb-2 px-1">Approved Partner Outlets</Text>
          <FlatList
            data={ckProfile?.whitelistedPartners || []}
            keyExtractor={(p) => p.tenantId}
            renderItem={({ item }) => {
              const isApproved = item.status === 'APPROVED';
              return (
                <View className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 mb-2 flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-white font-bold text-sm">{item.businessName}</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">
                      {item.contactNumber ? `📞 ${item.contactNumber} • ` : ''}Status: <Text className={`font-bold ${isApproved ? 'text-emerald-400' : 'text-rose-400'}`}>{item.status}</Text>
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      if (!tenant?.id) return;
                      const newStatus = isApproved ? 'BLOCKED' : 'APPROVED';
                      updatePartnerStatus(tenant.id, item.tenantId, newStatus);
                    }}
                    className={`px-3 py-1.5 rounded-xl border flex-row items-center ${
                      isApproved
                        ? 'bg-rose-500/15 border-rose-500/30'
                        : 'bg-emerald-500/15 border-emerald-500/30'
                    }`}
                  >
                    {isApproved ? (
                      <>
                        <Ban size={12} color="#F43F5E" />
                        <Text className="text-rose-400 font-bold text-xs ml-1">Block</Text>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={12} color="#34D399" />
                        <Text className="text-emerald-400 font-bold text-xs ml-1">Approve</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="py-8 bg-slate-900/60 border border-slate-800 rounded-2xl items-center justify-center p-4">
                <Users size={32} color="#64748B" />
                <Text className="text-slate-300 font-bold text-xs mt-2">No external partners connected yet</Text>
                <Text className="text-slate-500 text-[11px] text-center mt-1">
                  Share your Partner Code above with client restaurants to authorize them.
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* MODAL 1: ADD / EDIT BULK FOOD ITEM */}
      {isItemModalOpen && (
        <Modal visible={isItemModalOpen} transparent animationType="slide" onRequestClose={() => setItemModalOpen(false)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <Text className="text-white font-black text-base">
                  {editingItem ? 'Edit Bulk Food Item' : 'New Bulk Food Item'}
                </Text>
                <TouchableOpacity onPress={() => setItemModalOpen(false)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView className="my-3 max-h-[460px]">
                <View className="gap-3">
                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-1">Item Name</Text>
                    <TextInput
                      placeholder="e.g. Butter Chicken Gravy Base"
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
                            formCategory === c ? 'bg-emerald-600 border-emerald-400' : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${formCategory === c ? 'text-white' : 'text-slate-400'}`}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-1">Unit of Measure</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
                      {COMMON_UNITS.map((u) => (
                        <TouchableOpacity
                          key={u}
                          onPress={() => setFormUnit(u)}
                          className={`px-3 py-1.5 rounded-xl border ${
                            formUnit === u ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${formUnit === u ? 'text-white' : 'text-slate-400'}`}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Text className="text-slate-300 text-xs font-bold mb-1">Wholesale Price (₹)</Text>
                      <TextInput
                        placeholder="e.g. 350"
                        placeholderTextColor="#64748B"
                        keyboardType="numeric"
                        value={formPrice}
                        onChangeText={setFormPrice}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-bold"
                      />
                    </View>

                    <View className="flex-1">
                      <Text className="text-slate-300 text-xs font-bold mb-1">Min Order Qty (MOQ)</Text>
                      <TextInput
                        placeholder="e.g. 5"
                        placeholderTextColor="#64748B"
                        keyboardType="numeric"
                        value={formMinQty}
                        onChangeText={setFormMinQty}
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-bold"
                      />
                    </View>
                  </View>

                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-1">Description / Prep Notes</Text>
                    <TextInput
                      placeholder="e.g. Tomato cashew makhani base ready for outlet finishing"
                      placeholderTextColor="#64748B"
                      value={formDesc}
                      onChangeText={setFormDesc}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs"
                      multiline
                    />
                  </View>

                  {/* Stock Availability Toggle */}
                  <TouchableOpacity
                    onPress={() => setFormAvailable(!formAvailable)}
                    className={`flex-row items-center justify-between p-3 rounded-xl border ${
                      formAvailable ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'
                    }`}
                  >
                    <Text className="text-white font-bold text-xs">Stock Availability Status</Text>
                    <Text className={`text-xs font-black ${formAvailable ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formAvailable ? '✓ In Stock' : '✕ Out of Stock'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <View className="flex-row gap-2 pt-2 border-t border-slate-800">
                <TouchableOpacity
                  onPress={() => setItemModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveItem}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-emerald-600 rounded-xl items-center active:bg-emerald-700"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-xs">Save Item</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL 2: B2B INVOICE VIEW */}
      {selectedOrderForInvoice && (
        <Modal visible={!!selectedOrderForInvoice} transparent animationType="fade" onRequestClose={() => setSelectedOrderForInvoice(null)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View>
                  <Text className="text-white font-black text-base">B2B Delivery Invoice</Text>
                  <Text className="text-slate-400 text-xs">#{selectedOrderForInvoice.orderNumber}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedOrderForInvoice(null)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View className="my-3 gap-2">
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                  <Text className="text-slate-400 text-[10px] font-bold uppercase">SUPPLIER (CENTRAL KITCHEN):</Text>
                  <Text className="text-white font-black text-sm">{selectedOrderForInvoice.sellerBusinessName}</Text>
                  <Text className="text-slate-400 text-[10px] font-bold uppercase mt-2">DELIVER TO (BUYER):</Text>
                  <Text className="text-white font-black text-sm">{selectedOrderForInvoice.buyerBusinessName}</Text>
                  <Text className="text-slate-400 text-xs mt-1">Shift: {selectedOrderForInvoice.deliveryShift.replace(/_/g, ' ')}</Text>
                </View>

                {/* Items */}
                <ScrollView className="max-h-48 my-1">
                  {selectedOrderForInvoice.items.map((it, idx) => (
                    <View key={idx} className="flex-row justify-between py-1.5 border-b border-slate-800/40">
                      <Text className="text-white text-xs font-bold">{it.quantity} {it.unit} × {it.name}</Text>
                      <Text className="text-slate-200 text-xs font-bold">₹{it.amount.toFixed(2)}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800 gap-1">
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">Subtotal:</Text>
                    <Text className="text-slate-200 text-xs font-bold">₹{selectedOrderForInvoice.subtotal.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">GST (5% B2B Food):</Text>
                    <Text className="text-slate-200 text-xs font-bold">₹{selectedOrderForInvoice.taxAmount.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between pt-1 border-t border-slate-800">
                    <Text className="text-white text-sm font-black">Total Bill Amount:</Text>
                    <Text className="text-emerald-400 text-sm font-black">₹{selectedOrderForInvoice.totalAmount.toFixed(2)}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setSelectedOrderForInvoice(null)}
                className="py-3 bg-[#5D3FD3] rounded-2xl items-center"
              >
                <Text className="text-white font-bold text-xs">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL 3: REJECT ORDER */}
      {isRejectModalOpen && (
        <Modal visible={isRejectModalOpen} transparent animationType="fade" onRequestClose={() => setRejectModalOpen(false)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <Text className="text-white font-black text-base">Reject B2B Food Order</Text>
              <Text className="text-slate-400 text-xs mt-1">Please provide a reason to the ordering restaurant:</Text>

              <TextInput
                value={rejectionReason}
                onChangeText={setRejectionReason}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white text-xs mt-3"
                placeholder="Reason for declining..."
                placeholderTextColor="#64748B"
              />

              <View className="flex-row gap-2 mt-4">
                <TouchableOpacity
                  onPress={() => setRejectModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirmReject}
                  className="flex-1 py-3 bg-rose-600 rounded-xl items-center active:bg-rose-700"
                >
                  <Text className="text-white font-bold text-xs">Confirm Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};
