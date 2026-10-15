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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChefHat,
  UtensilsCrossed,
  Package,
  Plus,
  Minus,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  X,
  Trash2,
  ShieldCheck,
  ArrowRight,
  FileText,
  ShoppingBag,
  Store,
  Layers,
  Sparkles,
  Calendar,
} from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { useCentralKitchenStore } from '../../store/centralKitchen.store';
import { toast } from '../../utils/toast';
import { CKMenuItem, CKOrder, CKDeliveryShift } from '../../types/centralKitchen.types';

const COMMON_CATEGORIES = [
  'All',
  'Gravies & Curries',
  'Rice & Biryani',
  'Marinated Meats',
  'Bakery & Breads',
  'Desserts & Others',
];

export const CentralKitchenOrderingScreen = () => {
  const insets = useSafeAreaInsets();
  const { tenant, activeLocationId } = useTenantStore();
  const { user } = useAuthStore();

  const {
    connectedCK,
    connectedCKMenuItems,
    outgoingOrders,
    cart,
    isLoading,
    connectWithPartnerCode,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    submitCKOrder,
    subscribeToOutgoingOrders,
  } = useCentralKitchenStore();

  const [activeTab, setActiveTab] = useState<'CATALOG' | 'ORDERS'>('CATALOG');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Partner connect code input
  const [partnerCodeInput, setPartnerCodeInput] = useState('');
  const [isConnectModalOpen, setConnectModalOpen] = useState(false);

  // Cart & checkout modal
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<CKDeliveryShift>('MORNING_PREP_6AM');
  const [shiftDate, setShiftDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // default tomorrow
    return d.toISOString().split('T')[0];
  });
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected order invoice
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<CKOrder | null>(null);

  // Subscribe to outgoing orders
  useEffect(() => {
    if (tenant?.id) {
      const unsub = subscribeToOutgoingOrders(tenant.id);
      return () => unsub();
    }
  }, [tenant?.id]);

  // Handle Partner Code Connection
  const handleConnectPartner = async () => {
    if (!partnerCodeInput.trim()) {
      toast.warning('Please enter a valid Central Kitchen partner code.');
      return;
    }
    if (!tenant?.id) return;

    const success = await connectWithPartnerCode(
      partnerCodeInput.trim().toUpperCase(),
      tenant.id,
      activeLocationId || 'main',
      tenant.businessName || 'Outlet',
      user?.mobile || ''
    );
    if (success) {
      setConnectModalOpen(false);
      setPartnerCodeInput('');
    }
  };

  // Submit Order
  const handleConfirmOrder = async () => {
    if (!connectedCK) {
      toast.warning('Please connect to a Central Kitchen first.');
      return;
    }
    if (cart.length === 0) {
      toast.warning('Your food cart is empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const orderId = await submitCKOrder(
        connectedCK,
        tenant?.id || 'outlet',
        activeLocationId || 'main',
        tenant?.businessName || 'My Outlet',
        selectedShift,
        shiftDate,
        orderNotes.trim()
      );

      if (orderId) {
        setCheckoutModalOpen(false);
        setActiveTab('ORDERS');
        setOrderNotes('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Total cart calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, c) => sum + c.quantity * c.item.pricePerUnit, 0);
  }, [cart]);

  const cartGst = useMemo(() => Number((cartSubtotal * 0.05).toFixed(2)), [cartSubtotal]);
  const cartTotal = useMemo(() => Number((cartSubtotal + cartGst).toFixed(2)), [cartSubtotal, cartGst]);

  // Filtered menu
  const filteredMenu = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return connectedCKMenuItems.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [connectedCKMenuItems, selectedCategory, searchQuery]);

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Central Kitchen Ordering"
        subtitle={connectedCK ? `Supplied by: ${connectedCK.businessName}` : 'Connect & Order Bulk Prepared Food'}
        rightElement={
          <View className="flex-row items-center gap-2">
            {connectedCK ? (
              <TouchableOpacity
                onPress={() => setConnectModalOpen(true)}
                className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl flex-row items-center"
              >
                <Store size={14} color="#CBD5E1" />
                <Text className="text-slate-300 font-bold text-xs ml-1.5">Change Kitchen</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setConnectModalOpen(true)}
                className="bg-[#5D3FD3] px-3.5 py-1.5 rounded-xl flex-row items-center shadow-md shadow-indigo-600/30"
              >
                <ShieldCheck size={14} color="white" />
                <Text className="text-white font-bold text-xs ml-1.5">Connect Partner</Text>
              </TouchableOpacity>
            )}

            {cart.length > 0 && (
              <TouchableOpacity
                onPress={() => setCheckoutModalOpen(true)}
                className="bg-emerald-600 px-3.5 py-1.5 rounded-xl flex-row items-center shadow-md shadow-emerald-600/30"
              >
                <ShoppingBag size={14} color="white" />
                <Text className="text-white font-black text-xs ml-1.5">Cart ({cart.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Main Tabs */}
      <View className="px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: 8 }}
        >
          <TouchableOpacity
            onPress={() => setActiveTab('CATALOG')}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center ${
              activeTab === 'CATALOG' ? 'bg-[#5D3FD3]' : 'bg-slate-950 border border-slate-800'
            }`}
          >
            <UtensilsCrossed size={14} color={activeTab === 'CATALOG' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'CATALOG' ? 'text-white' : 'text-slate-400'}`}>
              Bulk Food Catalog
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('ORDERS')}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center ${
              activeTab === 'ORDERS' ? 'bg-indigo-600' : 'bg-slate-950 border border-slate-800'
            }`}
          >
            <Truck size={14} color={activeTab === 'ORDERS' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'ORDERS' ? 'text-white' : 'text-slate-400'}`}>
              My Orders & Status ({outgoingOrders.length})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* VIEW 1: CATALOG */}
      {activeTab === 'CATALOG' && (
        <View className="flex-1">
          {!connectedCK ? (
            /* Not Connected State */
            <View className="flex-1 items-center justify-center p-6 max-w-md self-center">
              <View className="w-16 h-16 rounded-3xl bg-indigo-500/15 border border-indigo-500/30 items-center justify-center mb-4">
                <ChefHat size={36} color="#818CF8" />
              </View>
              <Text className="text-white font-black text-xl text-center">Connect to Central Kitchen</Text>
              <Text className="text-slate-400 text-xs text-center mt-2 leading-5">
                Enter your Central Kitchen's Whitelist Partner Code to access wholesale prepared gravies, biryani degs, and bulk food supplies.
              </Text>

              <View className="w-full mt-6 bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-xl">
                <Text className="text-slate-300 text-xs font-bold mb-1.5">Enter Partner Whitelist Code</Text>
                <TextInput
                  placeholder="e.g. VSD-CK-889"
                  placeholderTextColor="#64748B"
                  value={partnerCodeInput}
                  onChangeText={setPartnerCodeInput}
                  autoCapitalize="characters"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white font-black text-sm text-center tracking-widest uppercase mb-3"
                />

                <TouchableOpacity
                  onPress={handleConnectPartner}
                  disabled={isLoading}
                  className="bg-[#5D3FD3] py-3 rounded-xl items-center active:bg-[#4D32B8]"
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-xs">Verify Code & Connect</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Connected Catalog View */
            <View className="flex-1">
              {/* Category Filters & Search */}
              <View className="bg-slate-900/60 px-4 py-2.5 border-b border-slate-800 gap-2">
                <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2">
                  <Search size={15} color="#94A3B8" />
                  <TextInput
                    placeholder="Search bulk dishes (e.g. Butter Chicken, Biryani)..."
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
                        selectedCategory === cat ? 'bg-[#5D3FD3]/30 border-indigo-400' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${selectedCategory === cat ? 'text-indigo-300' : 'text-slate-400'}`}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <FlatList
                data={filteredMenu}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{
                  padding: 12,
                  paddingBottom: Math.max(insets.bottom + 80, 100),
                  maxWidth: 1600,
                  alignSelf: 'center',
                  width: '100%',
                }}
                renderItem={({ item }) => {
                  const inCart = cart.find((c) => c.item.id === item.id);
                  const isAvailable = item.isAvailable !== false;

                  return (
                    <View className={`bg-slate-900 border p-4 rounded-3xl mb-3 shadow-md ${
                      !isAvailable ? 'border-rose-900/40 opacity-70' : 'border-slate-800'
                    }`}>
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 mr-3">
                          <View className="flex-row items-center flex-wrap gap-1.5 mb-1">
                            <Text className="text-white font-black text-base">{item.name}</Text>
                            <View className="bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded">
                              <Text className="text-indigo-300 text-[10px] font-bold uppercase">{item.category}</Text>
                            </View>
                            {!isAvailable && (
                              <View className="bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 rounded">
                                <Text className="text-rose-400 text-[10px] font-black uppercase">OUT OF STOCK</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-emerald-400 font-black text-base">
                            ₹{item.pricePerUnit} <Text className="text-xs text-slate-400 font-bold">/ {item.unit}</Text>
                          </Text>
                          <Text className="text-slate-400 text-xs mt-0.5">
                            Minimum Order Quantity: <Text className="text-slate-200 font-bold">{item.minOrderQty} {item.unit}</Text>
                          </Text>
                          {item.description ? (
                            <Text className="text-slate-400 text-[11px] mt-1.5 leading-4">{item.description}</Text>
                          ) : null}
                        </View>

                        {/* Cart Stepper / Add Button */}
                        {isAvailable && (
                          <View>
                            {inCart ? (
                              <View className="flex-row items-center bg-slate-950 rounded-2xl p-1 border border-slate-800">
                                <TouchableOpacity
                                  onPress={() => updateCartQuantity(item.id, inCart.quantity - 1)}
                                  className="w-8 h-8 rounded-xl bg-slate-800 items-center justify-center active:bg-slate-700"
                                >
                                  <Minus size={14} color="white" />
                                </TouchableOpacity>
                                <Text className="w-9 text-center text-white font-black text-xs">
                                  {inCart.quantity}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => updateCartQuantity(item.id, inCart.quantity + 1)}
                                  className="w-8 h-8 rounded-xl bg-[#5D3FD3] items-center justify-center active:bg-[#4D32B8]"
                                >
                                  <Plus size={14} color="white" />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                onPress={() => addToCart(item, item.minOrderQty || 1)}
                                className="bg-[#5D3FD3] px-4 py-2.5 rounded-2xl flex-row items-center active:bg-[#4D32B8] shadow-md shadow-indigo-600/30"
                              >
                                <Plus size={14} color="white" />
                                <Text className="text-white font-bold text-xs ml-1">+ Add to Indent</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View className="py-20 items-center justify-center">
                    <UtensilsCrossed size={48} color="#475569" />
                    <Text className="text-white font-bold text-base mt-3">No bulk items found</Text>
                    <Text className="text-slate-500 text-xs mt-1 text-center max-w-xs">
                      The Central Kitchen currently has no items listed in this category.
                    </Text>
                  </View>
                }
              />

              {/* Floating Bottom Cart Bar */}
              {cart.length > 0 && (
                <View
                  style={{ paddingBottom: Math.max(insets.bottom + 8, 16) }}
                  className="absolute bottom-0 left-0 right-0 p-4 bg-slate-900/95 border-t border-slate-800 shadow-2xl"
                >
                  <View className="flex-row items-center justify-between max-w-xl self-center w-full">
                    <View>
                      <Text className="text-slate-400 text-xs font-bold uppercase">{cart.length} Food Item{cart.length === 1 ? '' : 's'} Selected</Text>
                      <Text className="text-emerald-400 font-black text-xl">₹{cartTotal.toFixed(2)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setCheckoutModalOpen(true)}
                      className="bg-emerald-600 px-6 py-3 rounded-2xl flex-row items-center active:bg-emerald-700 shadow-lg shadow-emerald-600/30"
                    >
                      <ShoppingBag size={16} color="white" />
                      <Text className="text-white font-black text-sm ml-2">Review & Place Indent</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* VIEW 2: OUTGOING ORDERS & STATUS */}
      {activeTab === 'ORDERS' && (
        <View className="flex-1">
          <FlatList
            data={outgoingOrders}
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
                  <View className="flex-row items-start justify-between pb-3 border-b border-slate-800">
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="text-white font-black text-base">#{item.orderNumber}</Text>
                        <View className="bg-slate-800 px-2 py-0.5 rounded-md">
                          <Text className="text-slate-300 text-[10px] font-semibold">
                            {item.deliveryShift.replace(/_/g, ' ')}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-slate-400 text-xs">
                        Supplied by: <Text className="text-slate-200 font-bold">{item.sellerBusinessName}</Text>
                      </Text>
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
                        {isPending ? '⏳ AWAITING CK APPROVAL' : item.status}
                      </Text>
                      <Text className="text-white font-black text-sm mt-0.5">₹{item.totalAmount.toFixed(2)}</Text>
                    </View>
                  </View>

                  {/* Items Summary */}
                  <View className="my-3 bg-slate-950/80 rounded-2xl p-3 border border-slate-800/80">
                    {item.items.map((i, idx) => (
                      <View key={idx} className="flex-row items-center justify-between py-1 border-b border-slate-800/40 last:border-b-0">
                        <Text className="text-white text-xs font-semibold">{i.quantity} {i.unit} × {i.name}</Text>
                        <Text className="text-slate-200 text-xs font-bold">₹{i.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                    {item.rejectionReason && (
                      <View className="mt-2 pt-2 border-t border-slate-800">
                        <Text className="text-rose-400 text-xs font-bold">Decline Reason: {item.rejectionReason}</Text>
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  <View className="flex-row items-center justify-between pt-1">
                    <TouchableOpacity
                      onPress={() => setSelectedOrderForInvoice(item)}
                      className="p-2.5 bg-slate-800 border border-slate-700 rounded-2xl flex-row items-center"
                    >
                      <FileText size={14} color="#CBD5E1" />
                      <Text className="text-slate-300 font-bold text-xs ml-1.5">View B2B Slip</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="py-20 items-center justify-center">
                <Truck size={48} color="#475569" />
                <Text className="text-white font-bold text-base mt-3">No orders placed yet</Text>
                <Text className="text-slate-500 text-xs mt-1 text-center max-w-xs">
                  Place an order from the Bulk Food Catalog tab to request gravies and food from the Central Kitchen.
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* CHECKOUT & INDENT DETAILS MODAL */}
      {isCheckoutModalOpen && (
        <Modal visible={isCheckoutModalOpen} transparent animationType="slide" onRequestClose={() => setCheckoutModalOpen(false)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View>
                  <Text className="text-white font-black text-base">Review B2B Food Indent</Text>
                  <Text className="text-slate-400 text-xs">Supplied by {connectedCK?.businessName}</Text>
                </View>
                <TouchableOpacity onPress={() => setCheckoutModalOpen(false)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView className="my-3 max-h-[420px]">
                {/* Items in Cart */}
                <Text className="text-slate-300 text-xs font-bold mb-1.5">Selected Items:</Text>
                <View className="bg-slate-950 rounded-2xl p-3 border border-slate-800 mb-3">
                  {cart.map((c) => (
                    <View key={c.item.id} className="flex-row items-center justify-between py-1.5 border-b border-slate-800/40 last:border-b-0">
                      <View className="flex-1 mr-2">
                        <Text className="text-white font-bold text-xs">{c.item.name}</Text>
                        <Text className="text-slate-400 text-[10px]">
                          {c.quantity} {c.item.unit} × ₹{c.item.pricePerUnit}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Text className="text-white font-bold text-xs">₹{(c.quantity * c.item.pricePerUnit).toFixed(2)}</Text>
                        <TouchableOpacity onPress={() => removeFromCart(c.item.id)} className="p-1">
                          <Trash2 size={13} color="#F43F5E" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Delivery Shift Selector */}
                <Text className="text-slate-300 text-xs font-bold mb-1">Required Delivery Shift</Text>
                <View className="gap-1.5 mb-3">
                  {[
                    { id: 'MORNING_PREP_6AM' as CKDeliveryShift, label: '🌅 Morning Prep Shift (6:00 AM)' },
                    { id: 'LUNCH_PREP_11AM' as CKDeliveryShift, label: '☀️ Lunch Shift (11:00 AM)' },
                    { id: 'DINNER_PREP_6PM' as CKDeliveryShift, label: '🌙 Dinner Shift (6:00 PM)' },
                  ].map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setSelectedShift(s.id)}
                      className={`p-3 rounded-xl border flex-row items-center justify-between ${
                        selectedShift === s.id ? 'bg-[#5D3FD3]/30 border-indigo-400' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${selectedShift === s.id ? 'text-white' : 'text-slate-400'}`}>
                        {s.label}
                      </Text>
                      {selectedShift === s.id && <CheckCircle2 size={15} color="#818CF8" />}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Required Date */}
                <Text className="text-slate-300 text-xs font-bold mb-1">Shift Date (YYYY-MM-DD)</Text>
                <TextInput
                  value={shiftDate}
                  onChangeText={setShiftDate}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-bold mb-3"
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                />

                {/* Notes */}
                <Text className="text-slate-300 text-xs font-bold mb-1">Kitchen Prep Instructions</Text>
                <TextInput
                  value={orderNotes}
                  onChangeText={setOrderNotes}
                  placeholder="e.g. Mild spice on butter chicken, vacuum pack separately"
                  placeholderTextColor="#64748B"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs mb-3"
                />

                {/* Totals Box */}
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800 gap-1">
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">Subtotal:</Text>
                    <Text className="text-slate-200 text-xs font-bold">₹{cartSubtotal.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">GST (5% B2B Food):</Text>
                    <Text className="text-slate-200 text-xs font-bold">₹{cartGst.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between pt-1 border-t border-slate-800">
                    <Text className="text-white text-sm font-black">Total Amount:</Text>
                    <Text className="text-emerald-400 text-sm font-black">₹{cartTotal.toFixed(2)}</Text>
                  </View>
                </View>
              </ScrollView>

              <View className="flex-row gap-2 pt-2 border-t border-slate-800">
                <TouchableOpacity
                  onPress={() => setCheckoutModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirmOrder}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-emerald-600 rounded-xl items-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-black text-xs">Submit Order</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* CONNECT TO CENTRAL KITCHEN MODAL */}
      {isConnectModalOpen && (
        <Modal visible={isConnectModalOpen} transparent animationType="fade" onRequestClose={() => setConnectModalOpen(false)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <Text className="text-white font-black text-base">Connect to Central Kitchen</Text>
                <TouchableOpacity onPress={() => setConnectModalOpen(false)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <Text className="text-slate-400 text-xs mt-3 leading-5">
                Enter the Central Kitchen's Partner Whitelist Code provided by your supplier or kitchen head.
              </Text>

              <TextInput
                placeholder="e.g. VSD-CK-889"
                placeholderTextColor="#64748B"
                value={partnerCodeInput}
                onChangeText={setPartnerCodeInput}
                autoCapitalize="characters"
                className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-white font-black text-sm text-center tracking-widest uppercase my-4"
              />

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setConnectModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConnectPartner}
                  disabled={isLoading}
                  className="flex-1 py-3 bg-[#5D3FD3] rounded-xl items-center active:bg-[#4D32B8]"
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-xs">Connect</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL: B2B INVOICE VIEW */}
      {selectedOrderForInvoice && (
        <Modal visible={!!selectedOrderForInvoice} transparent animationType="fade" onRequestClose={() => setSelectedOrderForInvoice(null)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View>
                  <Text className="text-white font-black text-base">B2B Delivery Slip</Text>
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
    </SafeAreaView>
  );
};
