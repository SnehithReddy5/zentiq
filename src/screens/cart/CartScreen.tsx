import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useCartStore } from '../../store/cart.store';
import { useTenantStore } from '../../store/tenant.store';
import { usePrinterStore } from '../../store/printer.store';
import { useAuthStore } from '../../store/auth.store';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { DBServices } from '../../services/firebase/db';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { Routes } from '../../constants/routes';
import { CreditCard, Banknote, Smartphone, HelpCircle, Trash2, Printer, CheckCircle2 } from 'lucide-react-native';

export const CartScreen = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const tableNo = route.params?.tableNo ?? 0;
  const orderType = route.params?.orderType || (tableNo === 0 ? 'PICKUP' : 'DINE_IN');

  const { carts, clearCart } = useCartStore();
  const { tenant, branding, locations, activeLocationId } = useTenantStore();
  const { settings } = usePrinterStore();
  const { user } = useAuthStore();
  const { isLargePOS } = useResponsiveLayout();

  const cartItems = carts[tableNo] || [];
  const cartTotal = cartItems.reduce((sum, i) => sum + (i.price * i.qty), 0);

  // Split Payment states
  const [selectedMethod, setSelectedMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'OTHER'>('CASH');
  const [paymentAmount, setPaymentAmount] = useState(cartTotal.toString());
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([]);
  const [isSettling, setIsSettling] = useState(false);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, cartTotal - totalPaid);

  const handleAddPayment = () => {
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (amt > remaining) {
      Alert.alert('Amount Exceeded', 'Remaining amount is only ₹' + remaining.toFixed(2));
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

  const handleSettleAndPrint = async () => {
    if (user?.role === 'WAITER' || user?.role === 'captain') {
      Alert.alert(
        'Action Restricted',
        'Bill settlement requires Biller or Manager authorization. Please hand over this table order to the billing counter.'
      );
      return;
    }
    if (cartItems.length === 0) return;
    if (remaining > 0) {
      Alert.alert('Remaining Balance', 'There is still ₹' + remaining.toFixed(2) + ' unpaid.');
      return;
    }

    if (!activeLocationId && locations && locations.length > 0) {
      Alert.alert('Branch Required', 'Please select an active operating branch on the home screen before completing orders.');
      return;
    }

    setIsSettling(true);
    try {
      const billNo = await DBServices.getNextSequenceNumber(tenant?.id, activeLocationId || undefined);

      // 1. Create completed order in Firestore
      await DBServices.createOrder({
        orderNumber: billNo,
        kotNo: billNo,
        orderType,
        tableNo,
        captainId: user?.id || 'staff',
        captainName: user?.name || 'Staff',
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        payments: payments.map(p => ({ ...p, id: 'pay_' + Date.now(), method: p.method as any, timestamp: new Date().toISOString() })),
        items: cartItems,
        totalAmount: cartTotal,
        createdAt: new Date(),
      }, tenant?.id, activeLocationId || undefined);

      // 2. Free the table if dine-in
      if (tableNo !== 0) {
        await DBServices.updateTableStatusByNo(tableNo, 'available', tenant?.id, activeLocationId || undefined);
      }

      // 3. Print Customer Thermal Receipt
      const activeLoc = locations.find(l => l.id === activeLocationId);
      const branchName = activeLoc ? activeLoc.name : branding?.displayName;

      const buffer = ESCPOSService.buildBill(
        billNo,
        tableNo,
        user?.name || 'Staff',
        cartItems,
        branding,
        orderType,
        payments
      );

      try {
        await printerService.connect(settings.ipAddress, settings.port);
        await printerService.print(buffer);
        await printerService.disconnect();
      } catch (printErr) {
        console.warn('Billing printer offline or error:', printErr);
      }

      clearCart(tableNo);
      Alert.alert('Success', 'Order settled and bill generated!', [
        { text: 'Done', onPress: () => navigation.navigate(Routes.HOME) }
      ]);
    } catch (e: any) {
      Alert.alert('Checkout Error', e.message);
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
                  <Text className="text-slate-400 text-xs">Subtotal</Text>
                  <Text className="text-slate-300 font-bold text-xs">₹{cartTotal.toFixed(2)}</Text>
                </View>
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-400 text-xs">Taxes & GST (Included)</Text>
                  <Text className="text-slate-400 text-xs">₹0.00</Text>
                </View>
                <View className="flex-row justify-between pt-3 mt-1 border-t border-slate-800/80">
                  <Text className="text-white font-black text-base">Grand Total</Text>
                  <Text className="text-emerald-400 font-black text-xl">₹{cartTotal.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Right Panel (50% on desktop): Split Payment Keypad & Settlement */}
          <View className={isLargePOS ? 'w-[460px]' : ''}>
            <View className="bg-slate-900 border border-slate-800 p-5 rounded-3xl mb-5 shadow-md">
              <View className="flex-row items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <Text className="text-white font-black text-base">Payment Method</Text>
                <View className={'px-3 py-1 rounded-xl border ' + (remaining === 0 ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-amber-500/20 border-amber-500/30')}>
                  <Text className={'text-xs font-bold ' + (remaining === 0 ? 'text-emerald-300' : 'text-amber-300')}>
                    {remaining === 0 ? 'Paid in Full' : ('Due: ₹' + remaining.toFixed(2))}
                  </Text>
                </View>
              </View>

              {/* Payment Mode Selector */}
              <View className="flex-row gap-2 mb-4">
                <TouchableOpacity
                  className={'flex-1 p-3 rounded-2xl border items-center ' + (selectedMethod === 'CASH' ? 'bg-purple-950/50 border-[#5D3FD3]' : 'bg-slate-800/80 border-slate-700')}
                  onPress={() => setSelectedMethod('CASH')}
                >
                  <Banknote size={20} color={selectedMethod === 'CASH' ? '#A78BFA' : '#94A3B8'} />
                  <Text className="text-white font-bold text-xs mt-1">Cash</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className={'flex-1 p-3 rounded-2xl border items-center ' + (selectedMethod === 'UPI' ? 'bg-purple-950/50 border-[#5D3FD3]' : 'bg-slate-800/80 border-slate-700')}
                  onPress={() => setSelectedMethod('UPI')}
                >
                  <Smartphone size={20} color={selectedMethod === 'UPI' ? '#A78BFA' : '#94A3B8'} />
                  <Text className="text-white font-bold text-xs mt-1">UPI</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className={'flex-1 p-3 rounded-2xl border items-center ' + (selectedMethod === 'CARD' ? 'bg-purple-950/50 border-[#5D3FD3]' : 'bg-slate-800/80 border-slate-700')}
                  onPress={() => setSelectedMethod('CARD')}
                >
                  <CreditCard size={20} color={selectedMethod === 'CARD' ? '#A78BFA' : '#94A3B8'} />
                  <Text className="text-white font-bold text-xs mt-1">Card</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className={'flex-1 p-3 rounded-2xl border items-center ' + (selectedMethod === 'OTHER' ? 'bg-purple-950/50 border-[#5D3FD3]' : 'bg-slate-800/80 border-slate-700')}
                  onPress={() => setSelectedMethod('OTHER')}
                >
                  <HelpCircle size={20} color={selectedMethod === 'OTHER' ? '#A78BFA' : '#94A3B8'} />
                  <Text className="text-white font-bold text-xs mt-1">Other</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Cash Tender Buttons for Cashier */}
              <View className="mb-4">
                <Text className="text-slate-400 text-xs font-semibold mb-2">Quick Amount Tender:</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setPaymentAmount(remaining.toString())}
                    className="flex-1 bg-slate-800 border border-slate-700 py-1.5 rounded-xl items-center"
                  >
                    <Text className="text-purple-300 font-bold text-xs">Exact (₹{remaining.toFixed(0)})</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleQuickAddAmount(100)}
                    className="flex-1 bg-slate-800 border border-slate-700 py-1.5 rounded-xl items-center"
                  >
                    <Text className="text-slate-200 font-bold text-xs">₹100</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleQuickAddAmount(500)}
                    className="flex-1 bg-slate-800 border border-slate-700 py-1.5 rounded-xl items-center"
                  >
                    <Text className="text-slate-200 font-bold text-xs">₹500</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Amount Entry and Add Split */}
              <View className="flex-row gap-3 items-end mb-4">
                <View className="flex-1">
                  <Input
                    label="Payment Tender (₹)"
                    placeholder="0.00"
                    keyboardType="numeric"
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                  />
                </View>
                <Button
                  title="+ Record Mode"
                  onPress={handleAddPayment}
                  size="md"
                  disabled={remaining === 0}
                  className="mb-3"
                />
              </View>

              {/* Payments Recorded History */}
              {payments.length > 0 && (
                <View className="bg-slate-950/60 border border-slate-800 p-3 rounded-2xl mb-4">
                  <Text className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                    Splits Recorded:
                  </Text>
                  {payments.map((p, idx) => (
                    <View key={idx} className="flex-row justify-between items-center py-1.5 border-b border-slate-850 last:border-b-0">
                      <View className="flex-row items-center">
                        <CheckCircle2 size={12} color="#10B981" />
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

              {/* Settle & Print Final CTA Button */}
              <TouchableOpacity
                onPress={handleSettleAndPrint}
                disabled={isSettling || remaining > 0 || cartItems.length === 0}
                className={'w-full py-4 rounded-2xl items-center justify-center flex-row shadow-lg ' + (
                  remaining === 0 && cartItems.length > 0
                    ? 'bg-emerald-600 shadow-emerald-600/30'
                    : 'bg-slate-800 opacity-60'
                )}
              >
                {isSettling ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Printer size={18} color="white" />
                    <Text className="text-white font-black text-base ml-2">
                      {remaining === 0 ? 'Settle Order & Print Bill' : ('Pending ₹' + remaining.toFixed(2))}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
