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
  Receipt,
  Download,
  CreditCard,
  Banknote,
  Building2,
  QrCode,
  Lock,
  AlertTriangle,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Routes } from '../../constants/routes';
import { Header } from '../../components/common/Header';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { useCentralKitchenStore } from '../../store/centralKitchen.store';
import { DBServices } from '../../services/firebase/db';
import { toast } from '../../utils/toast';
import { B2BInvoicePdfService } from '../../services/invoice/b2bInvoicePdf.service';
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

// Visual 4-Step Timeline Component
const CKTimeline = ({ status }: { status: CKOrderStatus }) => {
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
                  className={`w-6 h-6 rounded-full items-center justify-center border ${isDone
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
                  className={`text-[9px] mt-1 font-bold ${isCurrent
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
                  className={`h-0.5 flex-1 -mt-3 ${idx < currentIdx ? 'bg-emerald-500' : 'bg-slate-800'
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

export const CentralKitchenScreen = () => {
  const insets = useSafeAreaInsets();
  const { tenant, activeLocationId, branding } = useTenantStore();
  const navigation = useNavigation<any>();
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
    recordPaymentReceived,
    subscribeToIncomingOrders,
  } = useCentralKitchenStore();

  const hasGstin = Boolean(branding?.gstin?.trim() || ckProfile?.gstin?.trim());
  const hasFssai = Boolean(branding?.fssaiNumber?.trim() || ckProfile?.fssaiNumber?.trim());
  const isB2BCompliant = hasGstin && hasFssai;

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

  // Payment Recording Modal State
  const [orderForPayment, setOrderForPayment] = useState<CKOrder | null>(null);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'UPI' | 'NEFT' | 'CASH' | 'LEDGER'>('UPI');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

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
    if (!isB2BCompliant) {
      toast.warning(
        `GSTIN (${hasGstin ? '✓' : 'Missing'}) and FSSAI License (${hasFssai ? '✓' : 'Missing'}) must be configured in Settings under GST before adding B2B food items.`,
        'B2B Setup Required'
      );
      return;
    }
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
    if (!isB2BCompliant) {
      toast.warning('Cannot save B2B items until GSTIN and FSSAI License are configured in Settings under GST.', 'B2B Setup Required');
      return;
    }
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
    if (!isB2BCompliant) {
      toast.warning('Cannot accept B2B wholesale orders without valid GSTIN & FSSAI license numbers in Settings.', 'B2B Compliance Required');
      return;
    }
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
    } catch (e) { }
  };

  // Order Dispatch
  const handleDispatchOrder = (order: CKOrder) => {
    if (!isB2BCompliant) {
      toast.warning('Cannot dispatch food batch without valid GSTIN & FSSAI on tax invoice.', 'B2B Compliance Required');
      return;
    }
    Alert.alert(
      'Mark as Dispatched',
      `Mark order #${order.orderNumber} as dispatched for delivery to "${order.buyerBusinessName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dispatch Food', onPress: () => updateOrderStatus(order.id, 'DISPATCHED') },
      ]
    );
  };

  // Open Record Payment Modal
  const handleOpenRecordPayment = (order: CKOrder) => {
    setOrderForPayment(order);
    setSelectedPaymentMode('UPI');
  };

  // Confirm Payment Received
  const handleConfirmPaymentReceived = async () => {
    if (!orderForPayment) return;
    setIsRecordingPayment(true);
    try {
      const invNo = await recordPaymentReceived(orderForPayment, selectedPaymentMode);
      const updatedOrder = {
        ...orderForPayment,
        paymentStatus: 'PAID' as const,
        paymentMode: selectedPaymentMode,
        invoiceNumber: invNo,
      };
      setOrderForPayment(null);
      // Immediately open the official Tax Invoice with PAID stamp
      setSelectedOrderForInvoice(updatedOrder);
    } catch (e) {
    } finally {
      setIsRecordingPayment(false);
    }
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
                <Text className="text-indigo-300 font-mono font-bold text-xs ml-1.5">
                  {copiedCode ? 'Copied!' : ckProfile.partnerCode}
                </Text>
              </TouchableOpacity>
            )}

            {activeTab === 'MENU' && (
              <TouchableOpacity
                onPress={handleOpenAddItem}
                className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center shadow-md shadow-emerald-600/30"
              >
                <Plus size={14} color="white" />
                <Text className="text-white font-bold text-xs ml-1">New Item</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Compliance Warning Banner if FSSAI or GSTIN is missing */}
      {!isB2BCompliant && (
        <View className="mx-4 mt-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <View className="flex-1 mr-0 sm:mr-3">
            <View className="flex-row items-center mb-1">
              <AlertTriangle size={16} color="#F59E0B" />
              <Text className="text-amber-400 font-black text-xs ml-1.5 uppercase tracking-wider">
                B2B Compliance Action Required
              </Text>
            </View>
            <Text className="text-slate-300 text-xs leading-4">
              GSTIN ({hasGstin ? '✓ Configured' : '❌ Missing'}) & FSSAI License ({hasFssai ? '✓ Configured' : '❌ Missing'}) must be filled in Settings before selling B2B or fulfilling wholesale orders.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate(Routes.BUSINESS_PROFILE)}
            className="bg-amber-500 px-3 py-2 rounded-xl active:bg-amber-600 shadow-sm shrink-0 self-start sm:self-auto"
          >
            <Text className="text-slate-950 font-black text-xs">Configure in Settings ➔</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Tabs */}
      <View className="px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: 8 }}
        >
          <TouchableOpacity
            onPress={() => setActiveTab('ORDERS')}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center ${activeTab === 'ORDERS' ? 'bg-[#5D3FD3]' : 'bg-slate-950 border border-slate-800'
              }`}
          >
            <ChefHat size={14} color={activeTab === 'ORDERS' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'ORDERS' ? 'text-white' : 'text-slate-400'}`}>
              Incoming Food Orders ({incomingOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('MENU')}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center ${activeTab === 'MENU' ? 'bg-indigo-600' : 'bg-slate-950 border border-slate-800'
              }`}
          >
            <UtensilsCrossed size={14} color={activeTab === 'MENU' ? '#FFFFFF' : '#94A3B8'} />
            <Text className={`text-xs font-black ml-1.5 ${activeTab === 'MENU' ? 'text-white' : 'text-slate-400'}`}>
              Bulk Food Catalog ({menuItems.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('WHITELIST')}
            className={`px-4 py-2.5 rounded-2xl flex-row items-center ${activeTab === 'WHITELIST' ? 'bg-indigo-600' : 'bg-slate-950 border border-slate-800'
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
              const isPaid = item.paymentStatus === 'PAID';

              return (
                <View className="bg-slate-900 border border-slate-800 rounded-3xl p-4 mb-3.5 shadow-md">
                  {/* Order Header: Order #, Tags, and Total Amount (NO OVERLAPPING) */}
                  <View className="flex-row items-center justify-between pb-2.5 border-b border-slate-800/80">
                    <View className="flex-row items-center gap-1.5 flex-wrap flex-1 mr-2">
                      <Text className="text-white font-black text-base">#{item.orderNumber}</Text>
                      <View className={`px-2 py-0.5 rounded-md border ${item.isInternalBranch
                          ? 'bg-purple-500/15 border-purple-500/30'
                          : 'bg-indigo-500/15 border-indigo-500/30'
                        }`}>
                        <Text className={`text-[9px] font-bold uppercase ${item.isInternalBranch ? 'text-purple-300' : 'text-indigo-300'
                          }`}>
                          {item.isInternalBranch ? 'Internal Branch' : 'External Partner'}
                        </Text>
                      </View>
                      <View className="bg-slate-800 border border-slate-700/60 px-2 py-0.5 rounded-md">
                        <Text className="text-slate-300 text-[9px] font-semibold tracking-wide uppercase">
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

                  {/* Ordering Restaurant Info */}
                  <View className="pt-2 flex-row items-center justify-between">
                    <Text className="text-slate-300 font-bold text-sm">{item.buyerBusinessName}</Text>
                    {item.shiftDate && (
                      <Text className="text-slate-400 text-xs font-medium">Req for: {item.shiftDate}</Text>
                    )}
                  </View>

                  {/* Visual 4-Step Timeline */}
                  <CKTimeline status={item.status} />

                  {/* Order Items Table */}
                  <View className="my-2 bg-slate-950/80 rounded-2xl p-3 border border-slate-800/80">
                    {item.items.map((i, idx) => (
                      <View key={idx} className="flex-row items-center justify-between py-1.5 border-b border-slate-800/40 last:border-b-0">
                        <View className="flex-1 mr-2">
                          <Text className="text-white font-bold text-xs">{i.name}</Text>
                          <Text className="text-slate-400 text-[10px]">
                            {i.quantity} {i.unit} × ₹{i.ratePerUnit}/{i.unit} (HSN: 2106)
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
                    {item.rejectionReason ? (
                      <View className="mt-2 pt-2 border-t border-slate-800 flex-row items-center">
                        <Text className="text-rose-400 text-[11px] font-bold">Decline Reason: "{item.rejectionReason}"</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row items-center gap-2 pt-1 flex-wrap">
                    {/* Cooking actions */}
                    {isPending && (
                      <View className="flex-row items-center gap-2 flex-1">
                        <TouchableOpacity
                          onPress={() => handleAcceptOrder(item)}
                          className="flex-1 min-w-[120px] bg-emerald-600 py-2.5 rounded-2xl flex-row items-center justify-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
                        >
                          <CheckCircle2 size={15} color="white" />
                          <Text className="text-white font-black text-xs ml-1.5">Accept & Cook</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleOpenRejectOrder(item)}
                          className="px-3 py-2.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl flex-row items-center justify-center active:bg-rose-500/25"
                        >
                          <XCircle size={15} color="#F43F5E" />
                          <Text className="text-rose-400 font-bold text-xs ml-1.5">Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isAccepted && (
                      <TouchableOpacity
                        onPress={() => handleDispatchOrder(item)}
                        className="flex-1 min-w-[130px] bg-sky-600 py-2.5 rounded-2xl flex-row items-center justify-center active:bg-sky-700 shadow-md shadow-sky-600/30"
                      >
                        <Truck size={15} color="white" />
                        <Text className="text-white font-black text-xs ml-1.5">Mark Dispatched</Text>
                      </TouchableOpacity>
                    )}

                    {/* Payment Capture Button for CK Manager */}
                    {!isRejected && (
                      !isPaid ? (
                        <TouchableOpacity
                          onPress={() => handleOpenRecordPayment(item)}
                          className="flex-1 min-w-[140px] bg-emerald-500/20 border border-emerald-500/40 py-2.5 px-3 rounded-2xl flex-row items-center justify-center active:bg-emerald-500/30"
                        >
                          <Banknote size={15} color="#34D399" />
                          <Text className="text-emerald-300 font-black text-xs ml-1.5">Record Payment</Text>
                        </TouchableOpacity>
                      ) : (
                        <View className="px-3 py-2 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex-row items-center">
                          <CheckCircle2 size={13} color="#10B981" />
                          <Text className="text-emerald-400 font-bold text-xs ml-1.5">PAID ({item.paymentMode})</Text>
                        </View>
                      )
                    )}

                    {/* Bill / Invoice View */}
                    <TouchableOpacity
                      onPress={() => setSelectedOrderForInvoice(item)}
                      className="p-2.5 bg-slate-800 border border-slate-700 rounded-2xl active:bg-slate-750 flex-row items-center"
                    >
                      <FileText size={15} color="#CBD5E1" />
                      <Text className="text-slate-300 font-bold text-xs ml-1.5">
                        {isPaid ? 'Tax Invoice' : 'B2B Bill'}
                      </Text>
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
                  className={`px-3.5 py-1.5 rounded-full border ${selectedCategory === cat ? 'bg-emerald-600/30 border-emerald-400' : 'bg-slate-950 border-slate-800'
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
              <View className={`bg-slate-900 border p-4 rounded-3xl mb-3 flex-row items-center justify-between shadow-md ${item.isAvailable === false ? 'border-rose-900/50 opacity-80' : 'border-slate-800'
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
              💡 <Text className="font-bold text-slate-300">How Whitelisting Works:</Text> External restaurants or cafes must enter this partner code on their POS terminal before they can view your wholesale menu or place bulk food orders.
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
                      if (!isApproved && !isB2BCompliant) {
                        toast.warning('Cannot approve buyer restaurants until your Central Kitchen GSTIN & FSSAI License are set up in Settings.', 'B2B Setup Required');
                        return;
                      }
                      const newStatus = isApproved ? 'BLOCKED' : 'APPROVED';
                      updatePartnerStatus(tenant.id, item.tenantId, newStatus);
                    }}
                    className={`px-3 py-1.5 rounded-xl border flex-row items-center ${isApproved
                        ? 'bg-rose-500/15 border-rose-500/30'
                        : 'bg-emerald-500/15 border-emerald-500/30'
                      }`}
                  >
                    {isApproved ? (
                      <View className="flex-row items-center">
                        <Ban size={12} color="#F43F5E" />
                        <Text className="text-rose-400 font-bold text-xs ml-1">Block</Text>
                      </View>
                    ) : (
                      <View className="flex-row items-center">
                        <CheckCircle2 size={12} color="#34D399" />
                        <Text className="text-emerald-400 font-bold text-xs ml-1">Approve</Text>
                      </View>
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
                          className={`px-3 py-1.5 rounded-xl border ${formCategory === c ? 'bg-[#5D3FD3] border-indigo-400' : 'bg-slate-950 border-slate-800'
                            }`}
                        >
                          <Text className={`text-xs font-bold ${formCategory === c ? 'text-white' : 'text-slate-400'}`}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View>
                    <Text className="text-slate-300 text-xs font-bold mb-1">Unit of Measurement</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
                      {COMMON_UNITS.map((u) => (
                        <TouchableOpacity
                          key={u}
                          onPress={() => setFormUnit(u)}
                          className={`px-3 py-1.5 rounded-xl border ${formUnit === u ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-950 border-slate-800'
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
                    className={`flex-row items-center justify-between p-3 rounded-xl border ${formAvailable ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'
                      }`}
                  >
                    <Text className="text-white font-bold text-xs">Stock Availability Status</Text>
                    <Text className={`text-xs font-black ${formAvailable ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formAvailable ? '✅ In Stock' : '❌ Out of Stock'}
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

      {/* MODAL 2: RECORD PAYMENT RECEIVED MODAL */}
      {orderForPayment && (
        <Modal
          visible={!!orderForPayment}
          transparent
          animationType="fade"
          onRequestClose={() => setOrderForPayment(null)}
        >
          <View className="flex-1 bg-black/85 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View>
                  <Text className="text-white font-black text-base">Record Payment Received</Text>
                  <Text className="text-slate-400 text-xs">Order #{orderForPayment.orderNumber}</Text>
                </View>
                <TouchableOpacity onPress={() => setOrderForPayment(null)}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View className="my-3 gap-2.5">
                {/* Total amount highlight */}
                <View className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex-row items-center justify-between">
                  <View>
                    <Text className="text-slate-400 text-xs">Buyer Outlet:</Text>
                    <Text className="text-white font-black text-sm">{orderForPayment.buyerBusinessName}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-slate-400 text-xs">Total Bill Amount:</Text>
                    <Text className="text-emerald-400 font-black text-lg">₹{orderForPayment.totalAmount.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Payment Mode Selector */}
                <Text className="text-slate-300 text-xs font-bold mt-1">Select Payment Settlement Mode:</Text>
                <View className="gap-2">
                  {[
                    { id: 'UPI' as const, label: 'UPI / QR / GPay / PhonePe', icon: QrCode, desc: 'Instant UPI settlement' },
                    { id: 'NEFT' as const, label: 'Bank Transfer / NEFT / RTGS', icon: Building2, desc: 'Direct corporate account transfer' },
                    { id: 'CASH' as const, label: 'Cash on Delivery / Dispatch', icon: Banknote, desc: 'Hand-to-hand physical cash payment' },
                    { id: 'LEDGER' as const, label: 'B2B Credit Ledger Account', icon: Receipt, desc: 'Logged against buyer monthly ledger' },
                  ].map((mode) => {
                    const IconComp = mode.icon;
                    const isSelected = selectedPaymentMode === mode.id;

                    return (
                      <TouchableOpacity
                        key={mode.id}
                        onPress={() => setSelectedPaymentMode(mode.id)}
                        className={`p-3 rounded-2xl border flex-row items-center justify-between ${isSelected
                            ? 'bg-[#5D3FD3]/20 border-indigo-500 shadow-md shadow-indigo-500/20'
                            : 'bg-slate-950 border-slate-800'
                          }`}
                      >
                        <View className="flex-row items-center flex-1 mr-2">
                          <View className={`w-8 h-8 rounded-xl items-center justify-center mr-2.5 ${isSelected ? 'bg-indigo-600' : 'bg-slate-800'
                            }`}>
                            <IconComp size={16} color="white" />
                          </View>
                          <View className="flex-1">
                            <Text className={`text-xs font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-200'}`}>
                              {mode.label}
                            </Text>
                            <Text className="text-slate-500 text-[10px]">{mode.desc}</Text>
                          </View>
                        </View>
                        {isSelected && <CheckCircle2 size={18} color="#818CF8" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="flex-row gap-2 pt-2 border-t border-slate-800">
                <TouchableOpacity
                  onPress={() => setOrderForPayment(null)}
                  className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-bold text-xs">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirmPaymentReceived}
                  disabled={isRecordingPayment}
                  className="flex-1 py-3 bg-emerald-600 rounded-xl items-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
                >
                  {isRecordingPayment ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-black text-xs">Confirm & Issue Invoice</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL 3: B2B TAX INVOICE & DELIVERY SLIP VIEW */}
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
                <View className={`p-3 rounded-2xl border flex-row items-center justify-between ${selectedOrderForInvoice.paymentStatus === 'PAID'
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
                      <Text className={`text-xs font-black ${selectedOrderForInvoice.paymentStatus === 'PAID' ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                        {selectedOrderForInvoice.paymentStatus === 'PAID'
                          ? `PAID IN FULL - ${selectedOrderForInvoice.paymentMode || 'ONLINE'}`
                          : 'PAYMENT PENDING / ON CREDIT'}
                      </Text>
                      <Text className="text-slate-400 text-[10px]">
                        Order Status: {selectedOrderForInvoice.status}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-white font-black text-base">₹{selectedOrderForInvoice.totalAmount.toFixed(2)}</Text>
                </View>

                {/* Parties Details */}
                <View className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                  <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">SUPPLIER (CENTRAL KITCHEN):</Text>
                  <Text className="text-white font-black text-sm">{selectedOrderForInvoice.sellerBusinessName}</Text>
                  {ckProfile?.partnerCode && (
                    <Text className="text-indigo-400 text-[10px] font-bold mt-0.5">Code: {ckProfile.partnerCode}</Text>
                  )}
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
                      const res = await B2BInvoicePdfService.downloadAndShareInvoicePdf(selectedOrderForInvoice, ckProfile, branding);
                      if (res.method === 'DOWNLOAD') {
                        toast.success('B2B GST Tax Invoice saved to Downloads!', 'Downloaded');
                      } else {
                        toast.info('B2B GST Tax Invoice ready!', 'Invoice Ready');
                      }
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

      {/* MODAL 4: REJECT ORDER */}
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
                  className="flex-1 py-3 bg-rose-600 rounded-xl items-center"
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
