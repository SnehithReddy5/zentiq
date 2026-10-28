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
  Lock,
  Receipt,
  Download,
  Check,
} from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { useCentralKitchenStore } from '../../store/centralKitchen.store';
import { toast } from '../../utils/toast';
import { B2BInvoicePdfService } from '../../services/invoice/b2bInvoicePdf.service';
import { CKMenuItem, CKOrder, CKDeliveryShift, CKOrderStatus } from '../../types/centralKitchen.types';

const COMMON_CATEGORIES = [
  'All',
  'Gravies & Curries',
  'Rice & Biryani',
  'Marinated Meats',
  'Bakery & Breads',
  'Desserts & Others',
];

// Visual 4-Step Timeline Component
export const CKTimeline = ({ status }: { status: CKOrderStatus }) => {
  if (status === 'REJECTED') {
    return (
      <View className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-2.5 my-2 flex-row items-center">
        <XCircle size={15} color="#F43F5E" />
        <Text className="text-rose-400 font-bold text-xs ml-2">Order Declined / Cancelled</Text>
      </View>
    );
  }

  const steps = [
    { key: 'PLACED', label: 'Placed' },
    { key: 'ACCEPTED', label: 'In Prep' },
    { key: 'DISPATCHED', label: 'Dispatched' },
    { key: 'DELIVERED', label: 'Received' },
  ];

  const getStepIndex = (st: CKOrderStatus) => {
    switch (st) {
      case 'PENDING': return 0;
      case 'ACCEPTED': return 1;
      case 'DISPATCHED': return 2;
      case 'DELIVERED': return 3;
      default: return 0;
    }
  };

  const currentIdx = getStepIndex(status);

  return (
    <View className="my-2.5 py-2 px-1 bg-slate-950/80 rounded-2xl border border-slate-800/70">
      <View className="flex-row items-center justify-between">
        {steps.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;

          return (
            <View key={step.key} className="flex-1 flex-row items-center">
              {/* Step Node */}
              <View className="items-center flex-1">
                <View
                  className={`w-6 h-6 rounded-full items-center justify-center border ${
                    isDone
                      ? 'bg-emerald-500 border-emerald-400'
                      : isCurrent
                      ? 'bg-[#5D3FD3] border-indigo-400 shadow-md shadow-indigo-500/40'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={13} color="white" />
                  ) : isCurrent ? (
                    <View className="w-2 h-2 rounded-full bg-white" />
                  ) : (
                    <View className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  )}
                </View>
                <Text
                  className={`text-[9px] mt-1 font-bold ${
                    isCurrent
                      ? 'text-indigo-400'
                      : isDone
                      ? 'text-emerald-400'
                      : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </Text>
              </View>

              {/* Connecting line */}
              {idx < steps.length - 1 && (
                <View
                  className={`h-0.5 flex-1 -mt-3 ${
                    idx < currentIdx ? 'bg-emerald-500' : 'bg-slate-800'
                  }`}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

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
    confirmOrderDelivery,
    cancelOrder,
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
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Subscribe to outgoing orders with real-time updates
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

  // Confirm Delivery receipt by buyer
  const handleConfirmDelivery = (order: CKOrder) => {
    Alert.alert(
      'Confirm Batch Delivery Receipt',
      `Confirm that your outlet has received food shipment for Order #${order.orderNumber} from "${order.sellerBusinessName}"?\n\nThis will mark the order as DELIVERED.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Confirm Receipt',
          onPress: async () => {
            try {
              await confirmOrderDelivery(order.id);
            } catch (e) {}
          },
        },
      ]
    );
  };

  // Cancel order (only allowed if PENDING)
  const handleCancelOrder = (order: CKOrder) => {
    if (order.status !== 'PENDING') {
      Alert.alert(
        'Cancellation Locked',
        'This order has already been accepted/in preparation by the Central Kitchen and cannot be cancelled directly. Please contact kitchen head.'
      );
      return;
    }

    Alert.alert(
      'Cancel Food Order',
      `Are you sure you want to cancel order #${order.orderNumber} before kitchen preparation begins?`,
      [
        { text: 'No, Keep Order', style: 'cancel' },
        {
          text: 'Yes, Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelOrder(order, 'Cancelled by ordering outlet before preparation');
            } catch (e) {}
          },
        },
      ]
    );
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
                          <View className="flex-row items-center gap-2 mb-1">
                            <Text className="text-white font-bold text-base">{item.name}</Text>
                            {!isAvailable && (
                              <View className="bg-rose-500/20 px-2 py-0.5 rounded-md">
                                <Text className="text-rose-300 text-[10px] font-bold">OUT OF STOCK</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-slate-400 text-xs">{item.category}</Text>
                          {item.description ? (
                            <Text className="text-slate-400 text-[11px] mt-1 leading-4">{item.description}</Text>
                          ) : null}
                          <View className="flex-row items-center gap-2 mt-2">
                            <Text className="text-[#818CF8] font-black text-sm">
                              ₹{item.pricePerUnit} <Text className="text-slate-400 text-xs font-normal">/ {item.unit}</Text>
                            </Text>
                            <Text className="text-slate-500 text-[11px]">MOQ: {item.minOrderQty} {item.unit}</Text>
                          </View>
                        </View>

                        {/* Cart Controller */}
                        {isAvailable && (
                          <View className="items-end justify-center">
                            {inCart ? (
                              <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-2xl p-1 gap-2">
                                <TouchableOpacity
                                  onPress={() => updateCartQuantity(item.id, inCart.quantity - 1)}
                                  className="w-7 h-7 bg-slate-800 rounded-xl items-center justify-center active:bg-slate-700"
                                >
                                  <Minus size={14} color="#CBD5E1" />
                                </TouchableOpacity>
                                <Text className="text-white font-black text-xs min-w-[20px] text-center">
                                  {inCart.quantity}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => updateCartQuantity(item.id, inCart.quantity + 1)}
                                  className="w-7 h-7 bg-[#5D3FD3] rounded-xl items-center justify-center active:bg-[#4D32B8]"
                                >
                                  <Plus size={14} color="white" />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                onPress={() => addToCart(item, item.minOrderQty || 1)}
                                className="bg-[#5D3FD3] px-3.5 py-2 rounded-2xl flex-row items-center shadow-md shadow-indigo-600/30 active:bg-[#4D32B8]"
                              >
                                <Plus size={14} color="white" />
                                <Text className="text-white font-bold text-xs ml-1">Add to Cart</Text>
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
                    <Text className="text-white font-bold text-base mt-3">No food items found</Text>
                    <Text className="text-slate-500 text-xs mt-1">Try another category or search term.</Text>
                  </View>
                }
              />
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
              const isPaid = item.paymentStatus === 'PAID';

              return (
                <View className="bg-slate-900 border border-slate-800 rounded-3xl p-4 mb-3.5 shadow-md">
                  {/* Top Line: Order Number, Shift Tag, and Total Amount (NO OVERLAPPING) */}
                  <View className="flex-row items-center justify-between pb-2.5 border-b border-slate-800/80">
                    <View className="flex-row items-center gap-2 flex-wrap flex-1 mr-2">
                      <Text className="text-white font-black text-base">#{item.orderNumber}</Text>
                      <View className="bg-slate-800 border border-slate-700/60 px-2.5 py-0.5 rounded-md">
                        <Text className="text-slate-300 text-[10px] font-semibold tracking-wide uppercase">
                          {item.deliveryShift.replace(/_/g, ' ')}
                        </Text>
                      </View>
                    </View>

                    {/* Amount & Status Indicator */}
                    <View className="items-end">
                      <Text className="text-white font-black text-base">₹{item.totalAmount.toFixed(2)}</Text>
                      <View className="flex-row items-center mt-0.5">
                        <View className={`w-1.5 h-1.5 rounded-full mr-1 ${isPaid ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        <Text className={`text-[10px] font-bold ${isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {isPaid ? `PAID (${item.paymentMode || 'ONLINE'})` : 'PAYMENT PENDING'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Supplier Info */}
                  <View className="pt-2 flex-row items-center justify-between">
                    <Text className="text-slate-400 text-xs">
                      Supplied by: <Text className="text-slate-200 font-bold">{item.sellerBusinessName}</Text>
                    </Text>
                    {item.shiftDate && (
                      <Text className="text-slate-400 text-xs font-medium">Req: {item.shiftDate}</Text>
                    )}
                  </View>

                  {/* Visual 4-Step Timeline */}
                  <CKTimeline status={item.status} />

                  {/* Items Summary Table */}
                  <View className="my-2 bg-slate-950/80 rounded-2xl p-3 border border-slate-800/80">
                    {item.items.map((i, idx) => (
                      <View key={idx} className="flex-row items-center justify-between py-1 border-b border-slate-800/40 last:border-b-0">
                        <Text className="text-white text-xs font-semibold flex-1 mr-2">
                          {i.quantity} {i.unit} × {i.name}
                        </Text>
                        <Text className="text-slate-200 text-xs font-bold">₹{i.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                    {item.rejectionReason && (
                      <View className="mt-2 pt-2 border-t border-slate-800/80">
                        <Text className="text-rose-400 text-xs font-bold">Decline / Cancel Reason: {item.rejectionReason}</Text>
                      </View>
                    )}
                  </View>

                  {/* Card Actions */}
                  <View className="flex-row items-center justify-between gap-2 pt-1 flex-wrap">
                    <TouchableOpacity
                      onPress={() => setSelectedOrderForInvoice(item)}
                      className="p-2.5 bg-slate-800 border border-slate-700 rounded-2xl flex-row items-center active:bg-slate-750"
                    >
                      <FileText size={14} color="#CBD5E1" />
                      <Text className="text-slate-300 font-bold text-xs ml-1.5">
                        {isPaid ? 'B2B Tax Invoice' : 'View B2B Slip'}
                      </Text>
                    </TouchableOpacity>

                    {/* Buyer Confirmation Action */}
                    {isDispatched && (
                      <TouchableOpacity
                        onPress={() => handleConfirmDelivery(item)}
                        className="flex-1 py-2.5 px-3 bg-emerald-600 rounded-2xl flex-row items-center justify-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
                      >
                        <CheckCircle2 size={15} color="white" />
                        <Text className="text-white font-black text-xs ml-1.5">Confirm Delivery & Stock</Text>
                      </TouchableOpacity>
                    )}

                    {isDelivered && (
                      <View className="flex-row items-center bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                        <CheckCircle2 size={13} color="#10B981" />
                        <Text className="text-emerald-400 font-bold text-xs ml-1.5">Received & Added to Stock</Text>
                      </View>
                    )}

                    {/* Cancellation Rules */}
                    {isPending && (
                      <TouchableOpacity
                        onPress={() => handleCancelOrder(item)}
                        className="px-3 py-2 bg-rose-500/15 border border-rose-500/30 rounded-xl flex-row items-center active:bg-rose-500/25"
                      >
                        <XCircle size={13} color="#F43F5E" />
                        <Text className="text-rose-400 font-bold text-xs ml-1.5">Cancel Order</Text>
                      </TouchableOpacity>
                    )}

                    {isAccepted && (
                      <View className="px-2.5 py-1 bg-slate-800/60 rounded-xl flex-row items-center">
                        <Lock size={11} color="#64748B" />
                        <Text className="text-slate-500 text-[10px] font-medium ml-1">In Preparation (Locked)</Text>
                      </View>
                    )}
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
                    { id: 'LUNCH_PREP_11AM' as CKDeliveryShift, label: '🍱 Lunch Shift (11:00 AM)' },
                    { id: 'DINNER_PREP_6PM' as CKDeliveryShift, label: '🌙 Dinner Shift (6:00 PM)' },
                  ].map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setSelectedShift(s.id)}
                      className={`p-3 rounded-xl border flex-row items-center justify-between ${
                        selectedShift === s.id ? 'bg-[#5D3FD3]/20 border-indigo-500' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${selectedShift === s.id ? 'text-indigo-300' : 'text-slate-400'}`}>
                        {s.label}
                      </Text>
                      {selectedShift === s.id && <CheckCircle2 size={16} color="#818CF8" />}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Date Input */}
                <Text className="text-slate-300 text-xs font-bold mb-1">Shift Delivery Date</Text>
                <TextInput
                  placeholder="YYYY-MM-DD (e.g. 2026-10-28)"
                  placeholderTextColor="#64748B"
                  value={shiftDate}
                  onChangeText={setShiftDate}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs mb-3"
                />

                {/* Special Instructions / Notes */}
                <Text className="text-slate-300 text-xs font-bold mb-1">Special Cooking / Packing Notes</Text>
                <TextInput
                  placeholder="e.g. Medium spicy gravy, deg packed with extra foil wrap..."
                  placeholderTextColor="#64748B"
                  value={orderNotes}
                  onChangeText={setOrderNotes}
                  multiline
                  numberOfLines={2}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white text-xs mb-3"
                />

                {/* Price Summary */}
                <View className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 gap-1.5">
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">Subtotal:</Text>
                    <Text className="text-white text-xs font-bold">₹{cartSubtotal.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">B2B GST (5% Food Supply):</Text>
                    <Text className="text-white text-xs font-bold">₹{cartGst.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between pt-1.5 border-t border-slate-800">
                    <Text className="text-white text-sm font-black">Total Indent Amount:</Text>
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
                    <Text className="text-white font-black text-xs">Connect</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ENHANCED B2B DELIVERY SLIP & TAX INVOICE MODAL */}
      {selectedOrderForInvoice && (
        <Modal
          visible={!!selectedOrderForInvoice}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedOrderForInvoice(null)}
        >
          <View className="flex-1 bg-black/85 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl max-h-[85%]">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View>
                  <Text className="text-white font-black text-base">
                    {selectedOrderForInvoice.paymentStatus === 'PAID' ? 'B2B GST Tax Invoice' : 'B2B Delivery Slip'}
                  </Text>
                  <Text className="text-slate-400 text-xs font-mono">
                    {selectedOrderForInvoice.invoiceNumber || `#${selectedOrderForInvoice.orderNumber}`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedOrderForInvoice(null)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView className="my-3 gap-2">
                {/* Payment Badge Stamp */}
                <View className={`p-3 rounded-2xl border flex-row items-center justify-between ${
                  selectedOrderForInvoice.paymentStatus === 'PAID'
                    ? 'bg-emerald-500/15 border-emerald-500/40'
                    : 'bg-amber-500/15 border-amber-500/40'
                }`}>
                  <View className="flex-row items-center">
                    {selectedOrderForInvoice.paymentStatus === 'PAID' ? (
                      <CheckCircle2 size={18} color="#10B981" />
                    ) : (
                      <Clock size={18} color="#F59E0B" />
                    )}
                    <View className="ml-2.5">
                      <Text className={`text-xs font-black ${
                        selectedOrderForInvoice.paymentStatus === 'PAID' ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {selectedOrderForInvoice.paymentStatus === 'PAID'
                          ? `PAID IN FULL - ${selectedOrderForInvoice.paymentMode || 'ONLINE'}`
                          : 'PAYMENT PENDING / ON CREDIT'}
                      </Text>
                      <Text className="text-slate-400 text-[10px]">
                        Status: {selectedOrderForInvoice.status}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-white font-black text-base">₹{selectedOrderForInvoice.totalAmount.toFixed(2)}</Text>
                </View>

                {/* Parties Details */}
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                  <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">SUPPLIER (CENTRAL KITCHEN):</Text>
                  <Text className="text-white font-black text-sm">{selectedOrderForInvoice.sellerBusinessName}</Text>
                  <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mt-2.5">DELIVER TO (RESTAURANT BUYER):</Text>
                  <Text className="text-white font-black text-sm">{selectedOrderForInvoice.buyerBusinessName}</Text>
                  <Text className="text-slate-400 text-xs mt-1">Shift: {selectedOrderForInvoice.deliveryShift.replace(/_/g, ' ')} ({selectedOrderForInvoice.shiftDate})</Text>
                </View>

                {/* Items */}
                <Text className="text-slate-300 text-xs font-bold mt-1">Itemized Batch Indent:</Text>
                <View className="bg-slate-950 rounded-2xl p-3 border border-slate-800">
                  {selectedOrderForInvoice.items.map((it, idx) => (
                    <View key={idx} className="flex-row justify-between py-1.5 border-b border-slate-800/40 last:border-b-0">
                      <View className="flex-1 mr-2">
                        <Text className="text-white text-xs font-bold">{it.name}</Text>
                        <Text className="text-slate-400 text-[10px]">
                          {it.quantity} {it.unit} × ₹{it.ratePerUnit}/{it.unit} (HSN: 2106)
                        </Text>
                      </View>
                      <Text className="text-slate-200 text-xs font-bold">₹{it.amount.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>

                {/* Tax Breakdown */}
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800 gap-1.5">
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">Wholesale Subtotal:</Text>
                    <Text className="text-slate-200 text-xs font-bold">₹{selectedOrderForInvoice.subtotal.toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">CGST (2.5%):</Text>
                    <Text className="text-slate-200 text-xs font-bold">₹{(selectedOrderForInvoice.taxAmount / 2).toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">SGST (2.5%):</Text>
                    <Text className="text-slate-200 text-xs font-bold">₹{(selectedOrderForInvoice.taxAmount / 2).toFixed(2)}</Text>
                  </View>
                  <View className="flex-row justify-between pt-1.5 border-t border-slate-800">
                    <Text className="text-white text-sm font-black">Total Invoice Value:</Text>
                    <Text className="text-emerald-400 text-sm font-black">₹{selectedOrderForInvoice.totalAmount.toFixed(2)}</Text>
                  </View>
                </View>
              </ScrollView>

              <View className="gap-2 mt-2">
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      setIsDownloadingPdf(true);
                      await B2BInvoicePdfService.downloadAndShareInvoicePdf(selectedOrderForInvoice, connectedCK);
                      toast.success('B2B GST Tax Invoice PDF ready!');
                    } catch (e: any) {
                      toast.error(e?.message || 'Failed to download PDF invoice');
                    } finally {
                      setIsDownloadingPdf(false);
                    }
                  }}
                  disabled={isDownloadingPdf}
                  className="py-3 bg-emerald-600 rounded-2xl flex-row items-center justify-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
                >
                  {isDownloadingPdf ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <View className="flex-row items-center justify-center">
                      <Download size={15} color="white" />
                      <Text className="text-white font-black text-xs ml-1.5">Download GST Tax Invoice (PDF)</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedOrderForInvoice(null)}
                  className="py-3 bg-slate-800 rounded-2xl items-center active:bg-slate-700"
                >
                  <Text className="text-slate-300 font-bold text-xs">Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};
