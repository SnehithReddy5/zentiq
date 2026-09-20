import { toast } from '../../utils/toast';
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useCartStore } from '../../store/cart.store';
import { useTenantStore } from '../../store/tenant.store';
import { usePrinterStore } from '../../store/printer.store';
import { useToastStore } from '../../store/toast.store';
import { useAuthStore } from '../../store/auth.store';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { DBServices } from '../../services/firebase/db';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { Routes } from '../../constants/routes';
import { CreditCard, Banknote, Smartphone, HelpCircle, Trash2, Printer, CheckCircle2, Utensils } from 'lucide-react-native';

export const CartScreen = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const tableNo = route.params?.tableNo ?? 0;
  const orderType = route.params?.orderType || (tableNo === 0 ? 'PICKUP' : 'DINE_IN');

  const { carts, clearCart } = useCartStore();
  const { tenant, branding, features, locations, activeLocationId } = useTenantStore();
  const { settings } = usePrinterStore();
  const { user } = useAuthStore();
  const { isLargePOS } = useResponsiveLayout();

  const cartItems = carts[tableNo] || [];
  const rawItemsSum = cartItems.reduce((sum, i) => sum + (i.price * i.qty), 0);

  // Dynamic GST Tax Configuration from Store Settings
  const gstEnabled = features.gstEnabled !== false;
  const gstType = features.gstType || 'INCLUSIVE';
  const cgstRate = typeof features.cgstRate === 'number' ? features.cgstRate : 2.5;
  const sgstRate = typeof features.sgstRate === 'number' ? features.sgstRate : 2.5;
  const totalTaxRate = (cgstRate + sgstRate) / 100;

  const { subtotal, cgst, sgst, totalTax, cartTotal } = useMemo(() => {
    if (!gstEnabled) {
      return {
        subtotal: rawItemsSum,
        cgst: 0,
        sgst: 0,
        totalTax: 0,
        cartTotal: rawItemsSum,
      };
    }
    if (gstType === 'EXCLUSIVE') {
      const sub = rawItemsSum;
      const c = Math.round((sub * (cgstRate / 100)) * 100) / 100;
      const s = Math.round((sub * (sgstRate / 100)) * 100) / 100;
      const tax = c + s;
      const total = Math.round(sub + tax);
      return { subtotal: sub, cgst: c, sgst: s, totalTax: tax, cartTotal: total };
    } else {
      // INCLUSIVE
      const total = rawItemsSum;
      const sub = totalTaxRate > 0 ? Math.round((total / (1 + totalTaxRate)) * 100) / 100 : total;
      const tax = total - sub;
      const c = Math.round((tax * (cgstRate / ((cgstRate + sgstRate) || 1))) * 100) / 100;
      const s = Math.round((tax - c) * 100) / 100;
      return { subtotal: sub, cgst: c, sgst: s, totalTax: tax, cartTotal: total };
    }
  }, [rawItemsSum, gstEnabled, gstType, cgstRate, sgstRate, totalTaxRate]);

  // Features & Active Payment Methods
  const paymentsEnabled = features.paymentsEnabled !== false;
  const activePaymentMethods = useMemo(() => {
    if (!paymentsEnabled) return [];
    const methods: string[] = [];
    if (features.cashEnabled !== false) methods.push('CASH');
    if (features.upiEnabled !== false) methods.push('UPI');
    if (features.cardEnabled !== false) methods.push('CARD');
    if (features.customPaymentMethods && features.customPaymentMethods.length > 0) {
      features.customPaymentMethods.forEach(m => {
        if (!methods.includes(m)) methods.push(m);
      });
    }
    return methods;
  }, [features, paymentsEnabled]);

  const allowSplit = paymentsEnabled && features.splitPaymentsEnabled !== false && activePaymentMethods.length >= 2;

  // Payment Mode: FULL (1-tap single mode) vs SPLIT (multi-mode ledger)
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'SPLIT'>('FULL');
  const [selectedMethod, setSelectedMethod] = useState<string>(activePaymentMethods[0] || 'CASH');
  const [cashTendered, setCashTendered] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(cartTotal.toString());
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([]);
  const [isSettling, setIsSettling] = useState(false);

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
        items: cartItems,
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

      // 4. Clear cart and return
      clearCart(tableNo);
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
    await executeSettlement([{ method: methodToUse, amount: cartTotal }]);
  };

  const handleSettleAndPrint = async () => {
    // If no split payments entered, automatically pay remaining with selected method
    let finalPayments = [...payments];
    if (finalPayments.length === 0) {
      finalPayments = [{ method: selectedMethod, amount: cartTotal }];
    } else if (remaining > 0) {
      // Auto-cover remaining balance with current selected method
      finalPayments.push({ method: selectedMethod, amount: remaining });
    }
    await executeSettlement(finalPayments);
  };

  const executeSettlement = async (finalPayments: { method: string; amount: number }[]) => {
    if (user?.role === 'WAITER' || user?.role === 'captain') {
      toast.warning('Bill settlement requires Biller or Manager authorization. Please hand over this table order to the billing counter.', 'Action Restricted');
      return;
    }
    if (cartItems.length === 0) return;

    if (!activeLocationId && locations && locations.length > 0) {
      toast.warning('Please select an active operating branch on the home screen before completing orders.', 'Branch Required');
      return;
    }

    setIsSettling(true);
    try {
      const billNo = await DBServices.getNextSequenceNumber(tenant?.id, activeLocationId || undefined);

      // 1. Parallel database updates (Record Order & Free Table simultaneously)
      const orderPromise = DBServices.createOrder({
        orderNumber: billNo,
        kotNo: billNo,
        orderType,
        tableNo,
        captainId: user?.id || 'staff',
        captainName: user?.name || 'Staff',
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        payments: finalPayments.map(p => ({ ...p, id: 'pay_' + Date.now(), method: p.method as any, timestamp: new Date().toISOString() })),
        items: cartItems,
        totalAmount: cartTotal,
        createdAt: new Date(),
      }, tenant?.id, activeLocationId || undefined);

      const tablePromise = tableNo !== 0
        ? DBServices.updateTableStatusByNo(tableNo, 'available', tenant?.id, activeLocationId || undefined)
        : Promise.resolve();

      // 2. Pre-generate ESC/POS buffers synchronously in memory (< 1ms)
      const activeLoc = locations.find(l => l.id === activeLocationId);
      const branchName = activeLoc ? activeLoc.name : branding?.displayName;
      const brandPayload = branding ? { ...branding, gstEnabled, gstType, cgstRate, sgstRate } : null;
      const workflowMode = settings.printerWorkflowMode || 'RESTAURANT';

      // 3. Dispatch Thermal Prints in Background (Non-blocking: Cashier never waits for printer timeouts)
      const dispatchPrints = async () => {
        const isUsb = settings.printerType === 'USB';
        const mainTarget = isUsb ? (settings.printerName || 'POS-80') : (settings.ipAddress || '127.0.0.1');
        const mainPort = settings.port || 9100;
        const mainType = isUsb ? 'USB' : 'LAN';

        // Check configured mode
        const isCombinedMode = workflowMode === 'SINGLE_COMBINED' || workflowMode === 'TIFFIN_CENTER';
        const isSingleBillMode = workflowMode === 'SINGLE_BILL_ONLY' || workflowMode === 'CURRY_POINT';
        const isDualMode = workflowMode === 'DUAL_PRINTER' || workflowMode === 'RESTAURANT' || (!isCombinedMode && !isSingleBillMode);

        try {
          if (isCombinedMode) {
            // SINGLE PRINTER: Customer Bill + Kitchen Slip together in 1 combined fast buffer
            const combinedBuffer = ESCPOSService.buildCombinedTiffinPrints(
              billNo,
              tableNo,
              user?.name || 'Staff',
              cartItems,
              brandPayload,
              orderType,
              finalPayments
            );
            await printerService.connect(mainTarget, mainPort, mainType);
            await printerService.print(combinedBuffer, isUsb ? { printerType: 'USB', printerName: mainTarget } : { printerType: 'LAN', ip: mainTarget, port: mainPort });
            await printerService.disconnect();
          } else {
            // DUAL PRINTER or SINGLE BILL ONLY: Print Customer Bill ONLY.
            // In Dual Mode, KOT was already fired while dining via "Send KOT". Settlement prints ONLY the customer bill.
            const billBuffer = ESCPOSService.buildBill(
              billNo,
              tableNo,
              user?.name || 'Staff',
              cartItems,
              brandPayload,
              orderType,
              finalPayments
            );
            await printerService.connect(mainTarget, mainPort, mainType);
            await printerService.print(billBuffer, isUsb ? { printerType: 'USB', printerName: mainTarget } : { printerType: 'LAN', ip: mainTarget, port: mainPort });
            await printerService.disconnect();
          }
        } catch (printErr: any) {
          console.warn('Thermal print background dispatch error:', printErr);
          useToastStore.getState().showToast({
            type: 'error',
            title: 'Print Failed (Saved to Cloud)',
            message: `Bill #${billNo} recorded, but thermal printer (${settings.ipAddress || 'LAN'}) did not respond: ${printErr?.message || 'offline'}. Check Wi-Fi.`,
            duration: 7000,
          });
        }
      };

      // Fire-and-forget print job immediately
      dispatchPrints();

      // Await database write completion in parallel (~150ms)
      await Promise.all([orderPromise, tablePromise]);

      useToastStore.getState().showToast({
        type: 'success',
        title: 'Order Settled',
        message: `Bill #${billNo} settled successfully.`,
        duration: 3500,
      });

      clearCart(tableNo);
      // Reset navigation stack to Home so hardware back button never returns to checkout
      navigation.reset({
        index: 0,
        routes: [{ name: Routes.HOME }],
      });
    } catch (e: any) {
      toast.error(e.message, 'Checkout Error');
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title={tableNo === 0 ? 'Pick Up Checkout' : ('Table ' + tableNo + ' Bill Settlement')}
        subtitle={'Total: ₹' + cartTotal.toFixed(2) + ' • ' + cartItems.length + ' item' + (cartItems.length === 1 ? '' : 's')}
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
        <View className={isLargePOS ? 'flex-row gap-6 items-start' : ''}>
          {/* Left Panel (50% on desktop): Order Summary and Item Details */}
          <View className={isLargePOS ? 'flex-1' : ''}>
            <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <Text className="text-white font-black text-base">Order Breakdown</Text>
                <View className="bg-purple-500/20 px-2.5 py-0.5 rounded-lg border border-purple-500/30">
                  <Text className="text-purple-300 font-bold text-xs">
                    {orderType === 'PICKUP' ? 'Pick Up' : ('Table ' + tableNo)}
                  </Text>
                </View>
              </View>

              <View className="mt-3">
                {cartItems.map((item) => (
                  <View key={item.itemId} className="flex-row justify-between py-2 border-b border-slate-800/60 last:border-b-0">
                    <View className="flex-1 mr-3">
                      <Text className="text-white text-xs font-semibold">
                        {item.qty}x {item.itemName}
                      </Text>
                      {item.variantName && (
                        <Text className="text-slate-400 text-[11px]">{item.variantName}</Text>
                      )}
                    </View>
                    <Text className="text-purple-300 font-bold text-xs">
                      ₹{(item.price * item.qty).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Total Calculation */}
              <View className="pt-4 mt-3 border-t border-slate-800">
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-400 text-xs">
                    {gstEnabled && gstType === 'INCLUSIVE' ? 'Subtotal (Excl. Tax)' : 'Subtotal'}
                  </Text>
                  <Text className="text-slate-300 font-bold text-xs">₹{subtotal.toFixed(2)}</Text>
                </View>

                {gstEnabled ? (
                  <>
                    <View className="flex-row justify-between py-1">
                      <Text className="text-slate-400 text-xs">
                        CGST ({cgstRate}%){gstType === 'INCLUSIVE' ? ' [Incl]' : ''}
                      </Text>
                      <Text className="text-slate-300 text-xs font-semibold">₹{cgst.toFixed(2)}</Text>
                    </View>
                    <View className="flex-row justify-between py-1">
                      <Text className="text-slate-400 text-xs">
                        SGST ({sgstRate}%){gstType === 'INCLUSIVE' ? ' [Incl]' : ''}
                      </Text>
                      <Text className="text-slate-300 text-xs font-semibold">₹{sgst.toFixed(2)}</Text>
                    </View>
                  </>
                ) : (
                  <View className="flex-row justify-between py-1">
                    <Text className="text-slate-400 text-xs">GST / Tax</Text>
                    <Text className="text-slate-500 text-xs">Tax Disabled</Text>
                  </View>
                )}

                <View className="flex-row justify-between pt-3 mt-1 border-t border-slate-800/80 items-center">
                  <Text className="text-white font-black text-base">Grand Total</Text>
                  <Text className="text-emerald-400 font-black text-xl">₹{cartTotal.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Right Panel: Pure KOT Mode OR Dynamic Payment Settlement */}
          <View className={isLargePOS ? 'w-[480px]' : ''}>
            <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
              
              {/* CASE 1: PURE KOT MODE (Payments Disabled in Store Settings) */}
              {!paymentsEnabled || activePaymentMethods.length === 0 ? (
                <View>
                  <View className="flex-row items-center justify-between pb-3 mb-4 border-b border-slate-800">
                    <View className="flex-row items-center">
                      <Utensils size={20} color="#F59E0B" />
                      <Text className="text-white font-black text-base ml-2">Kitchen KOT Dispatch</Text>
                    </View>
                    <View className="px-2.5 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/30">
                      <Text className="text-amber-400 text-[10px] font-bold">Payments Disabled</Text>
                    </View>
                  </View>

                  <View className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 mb-5">
                    <Text className="text-slate-300 text-xs leading-relaxed">
                      Payment collection is currently turned OFF in Store Settings. Tapping below will print the kitchen ticket and create an active running order without collecting payment.
                    </Text>
                    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-850">
                      <Text className="text-slate-400 text-xs font-semibold">Order Total:</Text>
                      <Text className="text-white font-black text-lg">₹{cartTotal.toFixed(2)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handlePrintKOTOnly}
                    disabled={isSettling || cartItems.length === 0}
                    className={`w-full py-4 rounded-2xl items-center justify-center flex-row shadow-lg ${
                      cartItems.length > 0
                        ? 'bg-amber-500 shadow-amber-500/30 active:opacity-90'
                        : 'bg-slate-800 opacity-60'
                    }`}
                  >
                    {isSettling ? (
                      <ActivityIndicator size="small" color="#1E293B" />
                    ) : (
                      <>
                        <Printer size={18} color="#0F172A" />
                        <Text className="text-slate-950 font-black text-base ml-2">
                          Print KOT & Dispatch
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                /* CASE 2: PAYMENT METHODS ENABLED */
                <View>
                  {/* Payment Mode Segmented Tab (Only shown if split payments are enabled) */}
                  {allowSplit && (
                    <View className="flex-row bg-slate-950 p-1 rounded-2xl mb-5 border border-slate-800">
                      <TouchableOpacity
                        onPress={() => setPaymentMode('FULL')}
                        className={`flex-1 py-2 rounded-xl items-center ${
                          paymentMode === 'FULL' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                        }`}
                      >
                        <Text className={`text-xs font-black ${paymentMode === 'FULL' ? 'text-white' : 'text-slate-400'}`}>
                          ⚡ Single Payment (1-Tap)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setPaymentMode('SPLIT');
                          setPaymentAmount(remaining > 0 ? remaining.toString() : cartTotal.toString());
                        }}
                        className={`flex-1 py-2 rounded-xl items-center ${
                          paymentMode === 'SPLIT' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                        }`}
                      >
                        <Text className={`text-xs font-black ${paymentMode === 'SPLIT' ? 'text-white' : 'text-slate-400'}`}>
                          ✂️ Split Payment
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* MODE A: SINGLE PAYMENT */}
                  {paymentMode === 'FULL' || !allowSplit ? (
                    <View>
                      <Text className="text-slate-400 text-xs font-bold uppercase mb-3">
                        Choose Payment Method:
                      </Text>

                      {/* Dynamic Payment Methods Selector */}
                      <View className="flex-row flex-wrap gap-2 mb-4">
                        {activePaymentMethods.map(m => {
                          const isSelected = selectedMethod === m;
                          return (
                            <TouchableOpacity
                              key={m}
                              className={`flex-1 min-w-[90px] p-3 rounded-2xl border items-center ${
                                isSelected ? 'bg-purple-950/60 border-[#5D3FD3]' : 'bg-slate-800/80 border-slate-700'
                              }`}
                              onPress={() => setSelectedMethod(m)}
                            >
                              {m === 'CASH' ? (
                                <Banknote size={22} color={isSelected ? '#A78BFA' : '#94A3B8'} />
                              ) : m === 'UPI' ? (
                                <Smartphone size={22} color={isSelected ? '#A78BFA' : '#94A3B8'} />
                              ) : m === 'CARD' ? (
                                <CreditCard size={22} color={isSelected ? '#A78BFA' : '#94A3B8'} />
                              ) : (
                                <HelpCircle size={22} color={isSelected ? '#A78BFA' : '#94A3B8'} />
                              )}
                              <Text className="text-white font-bold text-xs mt-1.5" numberOfLines={1}>
                                {m}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Cash Return Change Calculator (if Cash is selected) */}
                      {selectedMethod === 'CASH' && (
                        <View className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 mb-4">
                          <View className="mb-2.5">
                            <Text className="text-slate-400 text-xs font-semibold mb-2">Cash Handed by Customer:</Text>
                            <View className="flex-row flex-wrap gap-2 mb-2">
                              <TouchableOpacity
                                onPress={() => setCashTendered(cartTotal.toFixed(0))}
                                className="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 active:bg-slate-700"
                              >
                                <Text className="text-purple-300 text-xs font-bold">Exact (₹{cartTotal.toFixed(0)})</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setCashTendered('500')}
                                className="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 active:bg-slate-700"
                              >
                                <Text className="text-slate-200 text-xs font-bold">₹500</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setCashTendered('1000')}
                                className="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 active:bg-slate-700"
                              >
                                <Text className="text-slate-200 text-xs font-bold">₹1000</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setCashTendered('2000')}
                                className="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 active:bg-slate-700"
                              >
                                <Text className="text-slate-200 text-xs font-bold">₹2000</Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          <TextInput
                            placeholder={`e.g. ${cartTotal.toFixed(0)}`}
                            placeholderTextColor="#64748B"
                            keyboardType="numeric"
                            value={cashTendered}
                            onChangeText={setCashTendered}
                            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-sm"
                          />

                          {parseFloat(cashTendered) > cartTotal && (
                            <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-slate-850">
                              <Text className="text-amber-400 font-bold text-xs">Return Change:</Text>
                              <Text className="text-amber-400 font-black text-sm">
                                ₹{(parseFloat(cashTendered) - cartTotal).toFixed(2)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Summary Card */}
                      <View className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80 mb-5 flex-row justify-between items-center">
                        <Text className="text-slate-400 text-xs">Full Payment via <Text className="text-white font-bold">{selectedMethod}</Text></Text>
                        <Text className="text-emerald-400 font-black text-lg">₹{cartTotal.toFixed(2)}</Text>
                      </View>

                      {/* Big 1-Click Settle CTA */}
                      <TouchableOpacity
                        onPress={handleSettleAndPrint}
                        disabled={isSettling || cartItems.length === 0}
                        className={`w-full py-4 rounded-2xl items-center justify-center flex-row shadow-lg ${
                          cartItems.length > 0 ? 'bg-emerald-600 shadow-emerald-600/30 active:opacity-90' : 'bg-slate-800 opacity-60'
                        }`}
                      >
                        {isSettling ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <Printer size={18} color="white" />
                            <Text className="text-white font-black text-base ml-2">
                              Settle & Print Bill (₹{cartTotal.toFixed(2)})
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    /* MODE B: SPLIT PAYMENT (MULTI-TENDER LEDGER) */
                    <View>
                      {/* Ledger Balance Strip */}
                      <View className="flex-row gap-2 mb-4">
                        <View className="flex-1 bg-slate-950 p-2.5 rounded-2xl border border-slate-800 items-center">
                          <Text className="text-slate-500 text-[10px] uppercase font-bold">Total Bill</Text>
                          <Text className="text-white font-black text-sm mt-0.5">₹{cartTotal.toFixed(2)}</Text>
                        </View>
                        <View className="flex-1 bg-slate-950 p-2.5 rounded-2xl border border-slate-800 items-center">
                          <Text className="text-slate-500 text-[10px] uppercase font-bold">Recorded</Text>
                          <Text className="text-indigo-400 font-black text-sm mt-0.5">₹{totalPaid.toFixed(2)}</Text>
                        </View>
                        <View className={`flex-1 p-2.5 rounded-2xl border items-center ${
                          remaining === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'
                        }`}>
                          <Text className={`text-[10px] uppercase font-bold ${remaining === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {remaining === 0 ? 'Balance' : 'Remaining'}
                          </Text>
                          <Text className={`font-black text-sm mt-0.5 ${remaining === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                            ₹{remaining.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {/* Add Split Section (only if balance remains) */}
                      {remaining > 0 && (
                        <View className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 mb-4">
                          <Text className="text-slate-400 text-xs font-bold mb-2">Record Part Payment:</Text>

                          {/* Dynamic Split Method Selector */}
                          <View className="flex-row flex-wrap gap-1.5 mb-3">
                            {activePaymentMethods.map(m => (
                              <TouchableOpacity
                                key={m}
                                onPress={() => setSelectedMethod(m)}
                                className={`flex-1 min-w-[70px] py-1.5 rounded-xl border items-center ${
                                  selectedMethod === m ? 'bg-purple-950/60 border-[#5D3FD3]' : 'bg-slate-800 border-slate-700'
                                }`}
                              >
                                <Text className={`text-[11px] font-bold ${selectedMethod === m ? 'text-purple-300' : 'text-slate-400'}`}>
                                  {m}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          {/* Part Amount Input & Add Button */}
                          <View className="flex-row gap-2 items-center">
                            <View className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex-row items-center">
                              <Text className="text-slate-400 font-bold mr-1">₹</Text>
                              <TextInput
                                placeholder="0.00"
                                placeholderTextColor="#64748B"
                                keyboardType="numeric"
                                value={paymentAmount}
                                onChangeText={setPaymentAmount}
                                className="flex-1 text-white font-bold text-sm"
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
                        <View className="bg-slate-950/50 border border-slate-800 p-3 rounded-2xl mb-4">
                          <Text className="text-slate-400 text-[11px] font-bold uppercase mb-2">
                            Recorded Split Parts ({payments.length}):
                          </Text>
                          {payments.map((p, idx) => (
                            <View key={idx} className="flex-row justify-between items-center py-1.5 border-b border-slate-850 last:border-b-0">
                              <View className="flex-row items-center">
                                <CheckCircle2 size={13} color="#10B981" />
                                <Text className="text-slate-200 text-xs font-semibold ml-1.5">{p.method}</Text>
                              </View>
                              <View className="flex-row items-center gap-2">
                                <Text className="text-emerald-400 font-bold text-xs">₹{p.amount.toFixed(2)}</Text>
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

                      {/* Settle Split CTA */}
                      <TouchableOpacity
                        onPress={handleSettleAndPrint}
                        disabled={isSettling || remaining > 0 || cartItems.length === 0}
                        className={`w-full py-4 rounded-2xl items-center justify-center flex-row shadow-lg ${
                          remaining === 0 && cartItems.length > 0
                            ? 'bg-emerald-600 shadow-emerald-600/30'
                            : 'bg-slate-800 opacity-60'
                        }`}
                      >
                        {isSettling ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <Printer size={18} color="white" />
                            <Text className="text-white font-black text-base ml-2">
                              {remaining === 0 ? 'Settle Order & Print Bill' : `Pending ₹${remaining.toFixed(2)} Split`}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
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
