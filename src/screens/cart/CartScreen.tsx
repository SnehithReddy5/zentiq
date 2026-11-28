import { getBaseItemName } from '../../utils/itemDisplay';
import { toast } from '../../utils/toast';
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useCartStore, consolidateCartItems } from '../../store/cart.store';
import { useTableStore } from '../../store/table.store';
import { useOrderStore } from '../../store/order.store';
import { useMenuStore } from '../../store/menu.store';
import { useTenantStore } from '../../store/tenant.store';
import { usePrinterStore } from '../../store/printer.store';
import { useToastStore } from '../../store/toast.store';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { DBServices } from '../../services/firebase/db';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import {
  calculateOrderTotals,
  printTableBillAction,
  resolveActivePaymentMethods,
  settleTableOrderAction,
} from '../../services/orders/tableActions.service';
import { Routes } from '../../constants/routes';
import { CreditCard, Banknote, Smartphone, HelpCircle, Trash2, Printer, CheckCircle2, Utensils, Tag, X, Plus, Minus, ArrowLeft, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react-native';

export const CartScreen = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const tableNo = route.params?.tableNo ?? 0;
  const orderType = route.params?.orderType || (tableNo === 0 ? 'PICKUP' : 'DINE_IN');
  const [showMobileItems, setShowMobileItems] = useState(false);

  const { carts, clearCart, markAsSent, updateQuantity, removeItem } = useCartStore();
  const { orders } = useOrderStore();
  const { tenant, branding, features, locations, activeLocationId } = useTenantStore();
  const { settings } = usePrinterStore();
  const { user } = useAuthStore();
  const { isLargePOS } = useResponsiveLayout();
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';
  const isSingleKotMode = settings.printerWorkflowMode === 'SINGLE_KOT_ONLY' || settings.printerWorkflowMode === 'TOKEN_ONLY';

  const cartItems = useMemo(() => consolidateCartItems(carts[tableNo] || []), [carts, tableNo]);

  const handleIncrement = (item: any) => {
    updateQuantity(tableNo, item.itemId, item.qty + 1, item.variantName);
  };

  const handleDecrement = (item: any) => {
    if (item.qty > 1) {
      updateQuantity(tableNo, item.itemId, item.qty - 1, item.variantName);
    } else {
      removeItem(tableNo, item.itemId, item.variantName);
    }
  };

  const handleRemoveItem = (item: any) => {
    removeItem(tableNo, item.itemId, item.variantName);
  };

  // Keep CartScreen continuously synchronized with live running orders (including customer QR self-orders)
  useEffect(() => {
    if (tableNo !== 0) {
      try {
        const runningOrder = orders.find(
          (o: any) => (o.status === 'RUNNING' || o.status === 'running') && Number(o.tableNo) === Number(tableNo)
        );
        if (runningOrder && runningOrder.items && runningOrder.items.length > 0) {
          const menuItems = useMenuStore.getState().items;
          const formatted = runningOrder.items.map((it: any, idx: number) => {
            const rawName = (it.itemName || it.name || '').trim().toLowerCase();
            const matchedMaster = menuItems.find(m =>
              m.id === it.itemId ||
              (m.name && m.name.trim().toLowerCase() === rawName)
            );
            return {
              itemId: matchedMaster?.id || it.itemId || it.id || `item-${idx}`,
              baseItemId: matchedMaster?.id || it.baseItemId || undefined,
              itemName: matchedMaster?.name || it.itemName || it.name,
              price: Number(it.price || matchedMaster?.price || 0),
              qty: Number(it.qty || 1),
              sentQty: Number(it.sentQty ?? 0),
              variantId: it.variantId || null,
              variantName: it.variantName || null,
              note: it.note || '',
            };
          });
          useCartStore.getState().syncRunningOrderItems(tableNo, formatted);
          return;
        }

        if ((carts[tableNo] || []).length === 0) {
          const currentTable = useTableStore.getState().tables.find((t: any) => Number(t.tableNo) === Number(tableNo));
          if (currentTable && currentTable.status !== 'available' && (currentTable as any).cartItems && (currentTable as any).cartItems.length > 0) {
            useCartStore.getState().syncRemoteCarts({ [tableNo]: (currentTable as any).cartItems });
          }
        }
      } catch (err) {
        console.warn('Error syncing running order into CartScreen:', err);
      }
    }
  }, [tableNo, orders]);
  const rawItemsSum = cartItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const totalUnits = useMemo(() => cartItems.reduce((sum, i) => sum + (i.qty || 0), 0), [cartItems]);

  // Dynamic GST Tax Configuration from Store Settings
  const gstEnabled = features.gstEnabled !== false;
  const gstType = features.gstType || 'INCLUSIVE';
  const cgstRate = typeof features.cgstRate === 'number' ? features.cgstRate : 2.5;
  const sgstRate = typeof features.sgstRate === 'number' ? features.sgstRate : 2.5;

  // Role Check: Discount enabled for Biller and above only
  const isBillerOrAbove = Boolean(user?.role && !['WAITER', 'captain'].includes(user.role));
  const [discountText, setDiscountText] = useState('');

  const discountAmount = useMemo(() => {
    if (!isBillerOrAbove) return 0;
    const parsed = parseFloat(discountText) || 0;
    return Math.min(Math.max(0, parsed), rawItemsSum);
  }, [discountText, isBillerOrAbove, rawItemsSum]);

  const { subtotal, cgst, sgst, totalTax, cartTotal } = useMemo(
    () => calculateOrderTotals(cartItems, features, discountAmount),
    [cartItems, features, discountAmount]
  );

  // Features & Active Payment Methods
  const paymentsEnabled = features.paymentsEnabled !== false;
  const activePaymentMethods = useMemo(
    () => resolveActivePaymentMethods(features),
    [features]
  );

  const allowSplit = paymentsEnabled && features.splitPaymentsEnabled !== false && activePaymentMethods.length >= 2;

  // Payment Mode: FULL (1-tap single mode) vs SPLIT (multi-mode ledger)
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'SPLIT'>('FULL');
  const [selectedMethod, setSelectedMethod] = useState<string>(activePaymentMethods[0] || 'CASH');
  const [cashTendered, setCashTendered] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(cartTotal.toString());
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([]);
  const [isSettling, setIsSettling] = useState(false);
  const [isPrintingBillOnly, setIsPrintingBillOnly] = useState(false);
  const [printedBillNo, setPrintedBillNo] = useState<number | null>(null);

  // Sync default selected method if activePaymentMethods change
  useEffect(() => {
    if (activePaymentMethods.length > 0 && !activePaymentMethods.includes(selectedMethod)) {
      setSelectedMethod(activePaymentMethods[0]);
    }
  }, [activePaymentMethods]);

  // Pure KOT handler (when payments are disabled or no payment methods enabled)
  const handlePrintKOTOnly = async () => {
    if (cartItems.length === 0) return;

    if (!activeLocationId && locations && locations.length > 0) {
      toast.warning('Please select an operating branch on the home screen first.', 'Branch Required');
      return;
    }

    setIsSettling(true);
    try {
      const kotNo = await DBServices.getNextSequenceNumber(tenant?.id, activeLocationId || undefined);

      // 1. Create active RUNNING order in Firestore
      await DBServices.createOrder({
        kotNo,
        orderNumber: kotNo,
        orderType,
        tableNo,
        captainId: user?.id || 'staff',
        captainName: user?.name || 'Staff',
        status: 'RUNNING',
        paymentStatus: 'UNPAID',
        items: cartItems.map(i => ({ ...i, itemName: getBaseItemName(i.itemName, i.variantName) })),
        subtotal,
        tax: totalTax,
        totalAmount: cartTotal,
        createdAt: new Date(),
      }, tenant?.id, activeLocationId || undefined);

      // 2. Mark table as running/occupied if dine-in
      if (tableNo !== 0) {
        await DBServices.updateTableStatusByNo(tableNo, 'running', tenant?.id, activeLocationId || undefined);
      }

      // 3. Print Kitchen KOT (supports both USB & LAN Kitchen printers)
      const isKitchenUsb = settings.kitchenPrinterType === 'USB';
      const kitchenTarget = isKitchenUsb
        ? (settings.kitchenPrinterName || settings.printerName || 'POS-80')
        : (settings.kitchenIpAddress?.trim() || (settings.printerType === 'LAN' ? settings.ipAddress?.trim() : ''));
      const kitchenPort = settings.kitchenPort || settings.port || 9100;
      const kitchenType = isKitchenUsb ? 'USB' : 'LAN';

      if (kitchenTarget) {
        try {
          await printerService.connect(kitchenTarget, kitchenPort, kitchenType);
          const buffer = ESCPOSService.buildKOT(
            kotNo,
            tableNo,
            user?.name || 'Staff',
            cartItems,
            'KOT DISPATCH (NO PAYMENT)',
            orderType
          );
          await printerService.print(
            buffer,
            isKitchenUsb
              ? { printerType: 'USB', printerName: kitchenTarget }
              : { printerType: 'LAN', ip: kitchenTarget, port: kitchenPort }
          );
          await printerService.disconnect();
        } catch (printErr: any) {
          console.warn('Printer warning in KOT mode:', printErr.message);
        }
      }

      // 4. Mark cart items as sent and return to Home
      markAsSent(tableNo);
      toast.success(`KOT #${kotNo} printed and sent to kitchen!`, 'KOT Dispatched');
      navigation.reset({
        index: 0,
        routes: [{ name: Routes.HOME }],
      });
    } catch (e: any) {
      toast.error(e.message, 'Settlement Error');
    } finally {
      setIsSettling(false);
    }
  };

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, cartTotal - totalPaid);

  const handleAddPayment = () => {
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.warning('Please enter a valid amount.', 'Invalid Amount');
      return;
    }
    if (amt > remaining) {
      toast.warning('Remaining amount is only ₹' + remaining.toFixed(2), 'Amount Exceeded');
      return;
    }
    setPayments([...payments, { method: selectedMethod, amount: amt }]);
    setPaymentAmount((remaining - amt).toString());
  };

  const handleQuickAddAmount = (amountToAdd: number) => {
    const nextAmt = Math.min(remaining, amountToAdd);
    setPaymentAmount(nextAmt.toString());
  };

  const handleRemovePayment = (index: number) => {
    const removed = payments[index];
    const nextPayments = payments.filter((_, idx) => idx !== index);
    setPayments(nextPayments);
    setPaymentAmount((remaining + removed.amount).toString());
  };

  // 1-Tap Quick Settle with single payment method
  const handleQuickSettle = async (overrideMethod?: 'CASH' | 'UPI' | 'CARD') => {
    const methodToUse = overrideMethod || selectedMethod;
    await executeSettlement([{ method: methodToUse, amount: cartTotal }], false);
  };

  /**
   * PRINT BILL ONLY (Provisional Bill Slip):
   * Dispatches the thermal bill receipt to the billing printer.
   * Does NOT mark order as completed.
   * Does NOT free the table.
   * Does NOT clear the cart.
   * Guests remain seated and dining.
   */
  const handlePrintBillOnly = async () => {
    setIsPrintingBillOnly(true);
    try {
      const provisionalPayments = payments.length > 0
        ? payments
        : [{ method: selectedMethod, amount: cartTotal }];

      const res = await printTableBillAction({
        tableNo,
        orderType,
        cartItems,
        printedBillNo,
        provisionalPayments,
        discountAmount,
        settings,
        branding,
        features,
        tenantId: tenant?.id,
        locationId: activeLocationId,
        staffName: user?.name || 'Staff',
      });
      if (res.success && res.billNo) {
        setPrintedBillNo(res.billNo);
      }
    } finally {
      setIsPrintingBillOnly(false);
    }
  };

  /**
   * SAVE & SETTLE (Payment Finalization):
   * Saves the completed order to Firestore with payment rows.
   * Frees the table in Firestore ('available').
   * Clears the cart and returns home.
   * If shouldPrint is true (e.g. Counter / Takeaway), also prints the receipt.
   */
  const handleSaveAndSettle = async (shouldPrint: boolean = false) => {
    // If no split payments entered, automatically pay remaining with selected method
    let finalPayments = [...payments];
    if (finalPayments.length === 0) {
      finalPayments = [{ method: selectedMethod, amount: cartTotal }];
    } else if (remaining > 0) {
      // Auto-cover remaining balance with current selected method
      finalPayments.push({ method: selectedMethod, amount: remaining });
    }
    await executeSettlement(finalPayments, shouldPrint);
  };

  // Backwards compatible alias
  const handleSettleAndPrint = async () => {
    await handleSaveAndSettle(true);
  };

  const executeSettlement = async (
    finalPayments: { method: string; amount: number }[],
    shouldPrint: boolean = false
  ) => {
    setIsSettling(true);
    try {
      const result = await settleTableOrderAction({
        tableNo,
        orderType,
        cartItems,
        finalPayments,
        shouldPrint,
        printedBillNo,
        discountAmount,
        user,
        tenantId: tenant?.id,
        locationId: activeLocationId,
        locations,
        settings,
        branding,
        features,
      });

      if (result.success) {
        // Reset navigation stack to Home so hardware back button never returns to checkout
        navigation.reset({
          index: 0,
          routes: [{ name: Routes.HOME }],
        });
      }
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#090D1A]' : 'bg-slate-50'}`}>
      <Header
        title={tableNo === 0 ? (orderType === 'COUNTER' ? 'Quick Sale Checkout' : 'Pick Up Checkout') : ('Table ' + tableNo + ' Checkout')}
        subtitle={'Total: ₹' + cartTotal.toFixed(2) + ' • ' + totalUnits + ' item' + (totalUnits === 1 ? '' : 's')}
        rightElement={
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/30 flex-row items-center active:opacity-80 shrink-0"
          >
            <Plus size={14} color="#A855F7" />
            <Text className="text-purple-400 font-bold text-xs ml-1">+ Add Items</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: isLargePOS ? 24 : 16,
          paddingBottom: Math.max(insets.bottom + 36, 52),
          maxWidth: 1400,
          alignSelf: 'center',
          width: '100%'
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className={isLargePOS ? 'flex-row gap-6 items-start' : 'flex-col-reverse'}>
          {/* Left Panel (50% on desktop; collapsible items summary below payment on mobile) */}
          <View className={isLargePOS ? 'flex-1' : ''}>
            <View
              className={`p-5 rounded-3xl mb-5 shadow-md border ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <TouchableOpacity
                disabled={isLargePOS}
                activeOpacity={0.75}
                onPress={() => setShowMobileItems(prev => !prev)}
                className={`flex-row items-center justify-between pb-3 border-b ${
                  isDark ? 'border-slate-800' : 'border-slate-200'
                }`}
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <Text className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {isLargePOS ? 'Order Breakdown' : 'Order Items'}
                  </Text>
                  <Text className={`text-xs ml-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    ({totalUnits} {totalUnits === 1 ? 'item' : 'items'})
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="bg-purple-500/20 px-2.5 py-0.5 rounded-lg border border-purple-500/30">
                    <Text className="text-purple-400 font-bold text-xs">
                      {orderType === 'PICKUP' ? 'Pick Up' : (orderType === 'COUNTER' ? 'Quick Counter' : ('Table ' + tableNo))}
                    </Text>
                  </View>
                  {!isLargePOS && cartItems.length > 0 && (
                    showMobileItems
                      ? <ChevronUp size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                      : <ChevronDown size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                  )}
                </View>
              </TouchableOpacity>

              <View className="mt-3">
                {cartItems.length === 0 ? (
                  <View className="py-8 items-center justify-center">
                    <ShoppingBag size={32} color={isDark ? '#64748B' : '#94A3B8'} />
                    <Text className={`font-bold text-sm mt-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      No items in order
                    </Text>
                    <TouchableOpacity
                      onPress={() => navigation.goBack()}
                      className="mt-3 px-4 py-2 bg-[#5D3FD3] rounded-xl"
                    >
                      <Text className="text-white font-bold text-xs">← Back to Menu</Text>
                    </TouchableOpacity>
                  </View>
                ) : !isLargePOS && !showMobileItems ? (
                  <TouchableOpacity
                    onPress={() => setShowMobileItems(true)}
                    className={`py-2.5 px-3 rounded-xl border flex-row items-center justify-between ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <Text className={`text-xs flex-1 mr-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`} numberOfLines={1}>
                      {cartItems.map(i => `${i.qty}x ${getBaseItemName(i.itemName, i.variantName)}`).join(', ')}
                    </Text>
                    <Text className="text-indigo-500 text-xs font-bold shrink-0">Edit Items</Text>
                  </TouchableOpacity>
                ) : (
                  cartItems.map((item, idx) => (
                    <View
                      key={`${item.itemId || 'cart'}-${item.variantName || ''}-${idx}`}
                      className={`flex-row items-center justify-between py-2.5 border-b ${
                        isDark ? 'border-slate-800/60' : 'border-slate-100'
                      } last:border-b-0`}
                    >
                      <View className="flex-1 mr-3 min-w-0">
                        <Text className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {getBaseItemName(item.itemName, item.variantName)}
                        </Text>
                        {item.variantName && (
                          <Text className="text-slate-400 text-[11px]">{item.variantName}</Text>
                        )}
                        {item.selectedOptions && item.selectedOptions.length > 0 && (
                          <Text className="text-purple-400 text-[11px] mt-0.5">
                            + {item.selectedOptions.map(o => o.optionName).join(', ')}
                          </Text>
                        )}
                        {item.note ? (
                          <Text className="text-amber-400/90 text-[11px] italic mt-0.5">
                            Note: {item.note}
                          </Text>
                        ) : null}
                        <Text className="text-slate-400 text-[11px] mt-0.5">
                          ₹{item.price} each • <Text className="font-bold text-purple-400">₹{(item.price * item.qty).toFixed(2)}</Text>
                        </Text>
                      </View>

                      <View className="flex-row items-center gap-1.5 shrink-0">
                        <View className={`flex-row items-center rounded-full px-1 py-0.5 border ${
                          isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-100 border-slate-300'
                        }`}>
                          <TouchableOpacity
                            className={`w-6 h-6 rounded-full items-center justify-center active:opacity-75 ${
                              isDark ? 'bg-slate-800' : 'bg-white'
                            }`}
                            onPress={() => handleDecrement(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Minus size={11} color={isDark ? '#CBD5E1' : '#475569'} strokeWidth={2.5} />
                          </TouchableOpacity>

                          <Text className={`w-5 text-center font-black text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {item.qty}
                          </Text>

                          <TouchableOpacity
                            className="w-6 h-6 rounded-full bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-xs"
                            onPress={() => handleIncrement(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Plus size={11} color="white" strokeWidth={2.5} />
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          onPress={() => handleRemoveItem(item)}
                          className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 active:opacity-75"
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Trash2 size={13} color="#F43F5E" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Total Calculation */}
              <View className={`pt-4 mt-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-400 text-xs">
                    {gstEnabled && gstType === 'INCLUSIVE' ? 'Subtotal (Excl. Tax)' : 'Subtotal'}
                  </Text>
                  <Text className={`font-bold text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    ₹{subtotal.toFixed(2)}
                  </Text>
                </View>

                {gstEnabled ? (
                  <>
                    <View className="flex-row justify-between py-1">
                      <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        CGST ({cgstRate}%){gstType === 'INCLUSIVE' ? ' [Incl]' : ''}
                      </Text>
                      <Text className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>₹{cgst.toFixed(2)}</Text>
                    </View>
                    <View className="flex-row justify-between py-1">
                      <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        SGST ({sgstRate}%){gstType === 'INCLUSIVE' ? ' [Incl]' : ''}
                      </Text>
                      <Text className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>₹{sgst.toFixed(2)}</Text>
                    </View>
                  </>
                ) : (
                  <View className="flex-row justify-between py-1">
                    <Text className="text-slate-400 text-xs">GST / Tax</Text>
                    <Text className="text-slate-500 text-xs">Tax Disabled</Text>
                  </View>
                )}

                {/* Discount Field (Enabled for Biller and above only) */}
                {isBillerOrAbove && (
                  <View className={`py-2.5 my-1 border-t border-b ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <Tag size={13} color="#A855F7" />
                        <Text className="text-purple-400 font-bold text-xs ml-1.5">
                          Discount (₹)
                        </Text>
                      </View>
                      <View className={`flex-row items-center rounded-xl px-2.5 py-1 w-28 border ${
                        isDark ? 'bg-slate-950 border-purple-500/40' : 'bg-slate-50 border-purple-300'
                      }`}>
                        <Text className="text-purple-400 font-bold text-xs mr-1">₹</Text>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                          keyboardType="numeric"
                          value={discountText}
                          onChangeText={(val) => {
                            const cleaned = val.replace(/[^0-9.]/g, '');
                            setDiscountText(cleaned);
                          }}
                          className={`font-bold text-xs flex-1 p-0 ${isDark ? 'text-white' : 'text-slate-900'}`}
                        />
                        {Number(discountText) > 0 && (
                          <TouchableOpacity onPress={() => setDiscountText('')}>
                            <X size={13} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {discountAmount > 0 && (
                      <View className="flex-row justify-between items-center mt-1.5">
                        <Text className="text-slate-400 text-[10px]">Discount Applied</Text>
                        <Text className="text-purple-400 font-bold text-xs">
                          -₹{discountAmount.toFixed(2)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <View className={`flex-row justify-between pt-3 mt-1 border-t items-center ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                  <Text className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>Grand Total</Text>
                  <Text className="text-emerald-500 font-black text-xl">₹{cartTotal.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Right Panel: Pure KOT Mode OR Dynamic Payment Settlement */}
          <View className={isLargePOS ? 'w-[480px]' : ''}>
            <View className={`p-5 rounded-3xl mb-5 shadow-md border ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>

              {/* CASE 1: PURE KOT MODE (Payments Disabled in Store Settings) */}
              {!paymentsEnabled || activePaymentMethods.length === 0 ? (
                <View>
                  <View className={`flex-row items-center justify-between pb-3 mb-4 border-b ${
                    isDark ? 'border-slate-800' : 'border-slate-200'
                  }`}>
                    <View className="flex-row items-center">
                      <Utensils size={20} color="#F59E0B" />
                      <Text className={`font-black text-base ml-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>Kitchen KOT Dispatch</Text>
                    </View>
                    <View className="px-2.5 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/30">
                      <Text className="text-amber-500 text-[10px] font-bold">Payments Disabled</Text>
                    </View>
                  </View>

                  <View className={`p-4 rounded-2xl border mb-5 ${
                    isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <Text className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Payment collection is currently turned OFF in Store Settings. Tapping below will print the kitchen ticket and create an active running order without collecting payment.
                    </Text>
                    <View className={`flex-row items-center justify-between mt-3 pt-3 border-t ${
                      isDark ? 'border-slate-850' : 'border-slate-200'
                    }`}>
                      <Text className="text-slate-400 text-xs font-semibold">Order Total:</Text>
                      <Text className={`font-black text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>₹{cartTotal.toFixed(2)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handlePrintKOTOnly}
                    disabled={isSettling || cartItems.length === 0}
                    className={`w-full py-4 rounded-2xl items-center justify-center flex-row shadow-lg ${cartItems.length > 0
                      ? 'bg-amber-500 shadow-amber-500/30 active:opacity-90'
                      : isDark ? 'bg-slate-800 opacity-60' : 'bg-slate-200 opacity-60'
                      }`}
                  >
                    {isSettling ? (
                      <ActivityIndicator size="small" color="#1E293B" />
                    ) : (
                      <View className="flex-row items-center">
                        <Printer size={18} color="#0F172A" />
                        <Text className="text-slate-950 font-black text-base ml-2">
                          Print KOT & Dispatch
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                /* CASE 2: PAYMENT METHODS ENABLED */
                <View>
                  {/* Payment Mode Segmented Tab (Only shown if split payments are enabled) */}
                  {allowSplit && (
                    <View className={`flex-row p-1 rounded-2xl mb-5 border ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}>
                      <TouchableOpacity
                        onPress={() => setPaymentMode('FULL')}
                        className={`flex-1 py-2 rounded-xl items-center ${paymentMode === 'FULL' ? 'bg-[#5D3FD3] shadow-sm' : 'bg-transparent'
                          }`}
                      >
                        <Text className={`text-xs font-black ${paymentMode === 'FULL' ? 'text-white' : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>
                          ⚡ Single Payment (1-Tap)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setPaymentMode('SPLIT');
                          setPaymentAmount(remaining > 0 ? remaining.toString() : cartTotal.toString());
                        }}
                        className={`flex-1 py-2 rounded-xl items-center ${paymentMode === 'SPLIT' ? 'bg-[#5D3FD3] shadow-sm' : 'bg-transparent'
                          }`}
                      >
                        <Text className={`text-xs font-black ${paymentMode === 'SPLIT' ? 'text-white' : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>
                          ✂️ Split Payment
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* MODE A: SINGLE PAYMENT */}
                  {paymentMode === 'FULL' || !allowSplit ? (
                    <View>
                      <Text className={`text-xs font-bold uppercase mb-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Choose Payment Method:
                      </Text>

                      {/* Dynamic Payment Methods Selector */}
                      <View className="flex-row flex-wrap gap-2.5 mb-4">
                        {activePaymentMethods.map(m => {
                          const isSelected = selectedMethod === m;
                          const iconColor = isSelected
                            ? (isDark ? '#DDD6FE' : '#FFFFFF')
                            : (isDark ? '#94A3B8' : '#475569');
                          return (
                            <TouchableOpacity
                              key={m}
                              className={`flex-1 min-w-[90px] p-3.5 rounded-2xl border-2 items-center ${
                                isSelected
                                  ? isDark
                                    ? 'bg-[#5D3FD3]/30 border-[#7C3AED]'
                                    : 'bg-[#5D3FD3] border-[#5D3FD3] shadow-sm'
                                  : isDark
                                    ? 'bg-slate-800/80 border-slate-700'
                                    : 'bg-slate-50 border-slate-300'
                              }`}
                              onPress={() => setSelectedMethod(m)}
                            >
                              {m === 'CASH' ? (
                                <Banknote size={22} color={iconColor} />
                              ) : m === 'UPI' ? (
                                <Smartphone size={22} color={iconColor} />
                              ) : m === 'CARD' ? (
                                <CreditCard size={22} color={iconColor} />
                              ) : (
                                <HelpCircle size={22} color={iconColor} />
                              )}
                              <Text
                                className={`font-black text-xs mt-1.5 ${
                                  isSelected ? 'text-white' : (isDark ? 'text-slate-200' : 'text-slate-800')
                                }`}
                                numberOfLines={1}
                              >
                                {m}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Cash Return Change Calculator (if Cash is selected) */}
                      {selectedMethod === 'CASH' && (
                        <View className={`p-3.5 rounded-2xl border mb-4 ${
                          isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <View className="mb-2.5">
                            <Text className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Cash Handed by Customer:</Text>
                            <View className="flex-row flex-wrap gap-2 mb-2">
                              <TouchableOpacity
                                onPress={() => setCashTendered(cartTotal.toFixed(0))}
                                className={`px-3 py-1.5 rounded-xl border ${
                                  isDark ? 'bg-slate-800 border-slate-700 active:bg-slate-700' : 'bg-indigo-50 border-indigo-200 active:bg-indigo-100'
                                }`}
                              >
                                <Text className={`text-xs font-bold ${isDark ? 'text-purple-400' : 'text-indigo-700'}`}>Exact (₹{cartTotal.toFixed(0)})</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setCashTendered('500')}
                                className={`px-3 py-1.5 rounded-xl border ${
                                  isDark ? 'bg-slate-800 border-slate-700 active:bg-slate-700' : 'bg-slate-200 border-slate-300 active:bg-slate-300'
                                }`}
                              >
                                <Text className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>₹500</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setCashTendered('1000')}
                                className={`px-3 py-1.5 rounded-xl border ${
                                  isDark ? 'bg-slate-800 border-slate-700 active:bg-slate-700' : 'bg-slate-200 border-slate-300 active:bg-slate-300'
                                }`}
                              >
                                <Text className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>₹1000</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setCashTendered('2000')}
                                className={`px-3 py-1.5 rounded-xl border ${
                                  isDark ? 'bg-slate-800 border-slate-700 active:bg-slate-700' : 'bg-slate-200 border-slate-300 active:bg-slate-300'
                                }`}
                              >
                                <Text className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>₹2000</Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          <TextInput
                            placeholder={`e.g. ${cartTotal.toFixed(0)}`}
                            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                            keyboardType="numeric"
                            value={cashTendered}
                            onChangeText={setCashTendered}
                            className={`border rounded-xl px-3 py-2 font-bold text-sm ${
                              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          />

                          {parseFloat(cashTendered) > cartTotal && (
                            <View className={`flex-row justify-between items-center mt-2 pt-2 border-t ${
                              isDark ? 'border-slate-850' : 'border-slate-200'
                            }`}>
                              <Text className="text-amber-500 font-bold text-xs">Return Change:</Text>
                              <Text className="text-amber-500 font-black text-sm">
                                ₹{(parseFloat(cashTendered) - cartTotal).toFixed(2)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Summary Card */}
                      <View className={`p-3 rounded-2xl border mb-5 flex-row justify-between items-center ${
                        isDark ? 'bg-slate-950/40 border-slate-800/80' : 'bg-slate-100 border-slate-200'
                      }`}>
                        <Text className="text-slate-400 text-xs">Full Payment via <Text className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedMethod}</Text></Text>
                        <Text className="text-emerald-500 font-black text-lg">₹{cartTotal.toFixed(2)}</Text>
                      </View>

                      {/* CTA Action Buttons - Responsive Mobile Stacking (Same Settle & Print in Pick Up and Dine In) */}
                      <View className="flex-col sm:flex-row gap-2.5 sm:gap-3">
                        {/* Button 1: Print Bill Only (Dispatches thermal print; leaves table running for dine-in) */}
                        <TouchableOpacity
                          onPress={handlePrintBillOnly}
                          disabled={isPrintingBillOnly || isSettling || cartItems.length === 0}
                          className={`flex-1 py-3.5 sm:py-4 px-3 rounded-2xl items-center justify-center flex-row border ${cartItems.length > 0
                            ? isDark ? 'bg-slate-800 border-indigo-500/50 active:bg-slate-700' : 'bg-indigo-50 border-indigo-300 active:bg-indigo-100'
                            : isDark ? 'bg-slate-850 border-slate-800 opacity-50' : 'bg-slate-100 border-slate-200 opacity-50'
                            }`}
                        >
                          {isPrintingBillOnly ? (
                            <ActivityIndicator size="small" color="#6366F1" />
                          ) : (
                            <View className="flex-row items-center">
                              <Printer size={16} color={isDark ? '#A5B4FC' : '#4F46E5'} />
                              <Text
                                className={`font-black text-xs sm:text-sm ml-2 ${isDark ? 'text-indigo-200' : 'text-indigo-700'}`}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {isSingleKotMode ? 'Print Token' : 'Print Bill'}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        {/* Button 2: Settle & Save Bill (Restricted to Biller and above; Waiter sees handoff notice) */}
                        {isBillerOrAbove ? (
                          <TouchableOpacity
                            onPress={() => handleSaveAndSettle(false)}
                            disabled={isSettling || isPrintingBillOnly || cartItems.length === 0}
                            className={`flex-1 sm:flex-[1.3] py-3.5 sm:py-4 px-3 rounded-2xl items-center justify-center flex-row shadow-lg ${cartItems.length > 0
                              ? 'bg-emerald-600 shadow-emerald-600/30 active:opacity-90'
                              : isDark ? 'bg-slate-800 opacity-60' : 'bg-slate-200 opacity-60'
                              }`}
                          >
                            {isSettling ? (
                              <ActivityIndicator size="small" color="white" />
                            ) : (
                              <View className="flex-row items-center">
                                <CheckCircle2 size={16} color="white" />
                                <Text
                                  className="text-white font-black text-xs sm:text-sm ml-2"
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  Settle & Save (₹{cartTotal.toFixed(2)})
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <View className={`flex-1 sm:flex-[1.3] py-3 px-3 rounded-2xl border items-center justify-center ${
                            isDark ? 'bg-amber-950/30 border-amber-500/40' : 'bg-amber-50 border-amber-300'
                          }`}>
                            <Text className={`font-bold text-xs text-center ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                              Biller / Manager settles bill
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ) : (
                    /* MODE B: SPLIT PAYMENT (MULTI-TENDER LEDGER) */
                    <View>
                      {/* Ledger Balance Strip */}
                      <View className="flex-row gap-2 mb-4">
                        <View className={`flex-1 p-2.5 rounded-2xl border items-center ${
                          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                        }`}>
                          <Text className="text-slate-400 text-[10px] uppercase font-bold">Total Bill</Text>
                          <Text className={`font-black text-sm mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>₹{cartTotal.toFixed(2)}</Text>
                        </View>
                        <View className={`flex-1 p-2.5 rounded-2xl border items-center ${
                          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                        }`}>
                          <Text className="text-slate-400 text-[10px] uppercase font-bold">Recorded</Text>
                          <Text className="text-indigo-400 font-black text-sm mt-0.5">₹{totalPaid.toFixed(2)}</Text>
                        </View>
                        <View className={`flex-1 p-2.5 rounded-2xl border items-center ${remaining === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'
                          }`}>
                          <Text className={`text-[10px] uppercase font-bold ${remaining === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {remaining === 0 ? 'Balance' : 'Remaining'}
                          </Text>
                          <Text className={`font-black text-sm mt-0.5 ${remaining === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            ₹{remaining.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {/* Add Split Section (only if balance remains) */}
                      {remaining > 0 && (
                        <View className={`p-3.5 rounded-2xl border mb-4 ${
                          isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <Text className="text-slate-400 text-xs font-bold mb-2">Record Part Payment:</Text>

                          {/* Dynamic Split Method Selector */}
                          <View className="flex-row flex-wrap gap-1.5 mb-3">
                            {activePaymentMethods.map(m => {
                              const isSelected = selectedMethod === m;
                              return (
                                <TouchableOpacity
                                  key={m}
                                  onPress={() => setSelectedMethod(m)}
                                  className={`flex-1 min-w-[70px] py-2 rounded-xl border items-center ${
                                    isSelected
                                      ? isDark
                                        ? 'bg-[#5D3FD3]/30 border-[#7C3AED]'
                                        : 'bg-[#5D3FD3] border-[#5D3FD3]'
                                      : isDark
                                        ? 'bg-slate-800 border-slate-700'
                                        : 'bg-white border-slate-300'
                                  }`}
                                >
                                  <Text className={`text-[11px] font-bold ${
                                    isSelected
                                      ? 'text-white'
                                      : (isDark ? 'text-slate-300' : 'text-slate-700')
                                  }`}>
                                    {m}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {/* Part Amount Input & Add Button */}
                          <View className="flex-row gap-2 items-center">
                            <View className={`flex-1 border rounded-xl px-3 py-2 flex-row items-center ${
                              isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                            }`}>
                              <Text className="text-slate-400 font-bold mr-1">₹</Text>
                              <TextInput
                                placeholder="0.00"
                                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                                keyboardType="numeric"
                                value={paymentAmount}
                                onChangeText={setPaymentAmount}
                                className={`flex-1 font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}
                              />
                            </View>
                            <TouchableOpacity
                              onPress={handleAddPayment}
                              className="bg-[#5D3FD3] px-3.5 py-2.5 rounded-xl flex-row items-center active:opacity-80"
                            >
                              <Text className="text-white font-bold text-xs">+ Add Split</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {/* Recorded Splits History List */}
                      {payments.length > 0 && (
                        <View className={`border p-3 rounded-2xl mb-4 ${
                          isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <Text className="text-slate-400 text-[11px] font-bold uppercase mb-2">
                            Recorded Split Parts ({payments.length}):
                          </Text>
                          {payments.map((p, idx) => (
                            <View key={idx} className={`flex-row justify-between items-center py-1.5 border-b ${
                              isDark ? 'border-slate-850' : 'border-slate-200'
                            } last:border-b-0`}>
                              <View className="flex-row items-center">
                                <CheckCircle2 size={13} color="#10B981" />
                                <Text className={`text-xs font-semibold ml-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{p.method}</Text>
                              </View>
                              <View className="flex-row items-center gap-2">
                                <Text className="text-emerald-500 font-bold text-xs">₹{p.amount.toFixed(2)}</Text>
                                <TouchableOpacity
                                  onPress={() => handleRemovePayment(idx)}
                                  className="p-1 rounded bg-rose-500/20"
                                >
                                  <Trash2 size={12} color="#F43F5E" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* CTA Action Buttons - Responsive Mobile Stacking (Same Settle & Print in Pick Up and Dine In) */}
                      <View className="flex-col sm:flex-row gap-2.5 sm:gap-3">
                        {/* Button 1: Print Bill Only */}
                        <TouchableOpacity
                          onPress={handlePrintBillOnly}
                          disabled={isPrintingBillOnly || isSettling || cartItems.length === 0}
                          className={`flex-1 py-3.5 sm:py-4 px-3 rounded-2xl items-center justify-center flex-row border ${cartItems.length > 0
                            ? isDark ? 'bg-slate-800 border-indigo-500/50 active:bg-slate-700' : 'bg-indigo-50 border-indigo-300 active:bg-indigo-100'
                            : isDark ? 'bg-slate-850 border-slate-800 opacity-50' : 'bg-slate-100 border-slate-200 opacity-50'
                            }`}
                        >
                          {isPrintingBillOnly ? (
                            <ActivityIndicator size="small" color="#6366F1" />
                          ) : (
                            <View className="flex-row items-center">
                              <Printer size={16} color={isDark ? '#A5B4FC' : '#4F46E5'} />
                              <Text
                                className={`font-black text-xs sm:text-sm ml-2 ${isDark ? 'text-indigo-200' : 'text-indigo-700'}`}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {isSingleKotMode ? 'Print Token' : 'Print Bill'}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        {/* Button 2: Settle & Save Bill (Restricted to Biller and above) */}
                        {isBillerOrAbove ? (
                          <TouchableOpacity
                            onPress={() => handleSaveAndSettle(false)}
                            disabled={isSettling || isPrintingBillOnly || remaining > 0 || cartItems.length === 0}
                            className={`flex-1 sm:flex-[1.3] py-3.5 sm:py-4 px-3 rounded-2xl items-center justify-center flex-row shadow-lg ${remaining === 0 && cartItems.length > 0
                              ? 'bg-emerald-600 shadow-emerald-600/30 active:opacity-90'
                              : isDark ? 'bg-slate-800 opacity-60' : 'bg-slate-200 opacity-60'
                              }`}
                          >
                            {isSettling ? (
                              <ActivityIndicator size="small" color="white" />
                            ) : (
                              <View className="flex-row items-center">
                                <CheckCircle2 size={16} color="white" />
                                <Text
                                  className="text-white font-black text-xs sm:text-sm ml-2"
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {remaining === 0 ? 'Settle & Save' : `Pending ₹${remaining.toFixed(2)}`}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <View className={`flex-1 sm:flex-[1.3] py-3 px-3 rounded-2xl border items-center justify-center ${
                            isDark ? 'bg-amber-950/30 border-amber-500/40' : 'bg-amber-50 border-amber-300'
                          }`}>
                            <Text className={`font-bold text-xs text-center ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                              Biller / Manager settles bill
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
