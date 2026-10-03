import React, { useState, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import {
  FileSpreadsheet,
  Calendar,
  Download,
  X,
  CheckCircle2,
  TrendingUp,
  Clock,
  Sparkles,
  ArrowRight,
  Filter,
  Banknote,
  Smartphone,
  CreditCard,
  Utensils
} from 'lucide-react-native';
import { toast } from '../../utils/toast';
import { Order } from '../../types/order.types';
import { OrderSummaryExcelService } from '../../services/excel/orderSummaryExcel.service';
import { useTenantStore } from '../../store/tenant.store';

interface OrderSummaryDownloadModalProps {
  isVisible: boolean;
  onClose: () => void;
  orders: Order[];
  tenantName?: string;
  locationName?: string;
}

const OrderSummaryDownloadModalInner: React.FC<OrderSummaryDownloadModalProps> = ({
  isVisible,
  onClose,
  orders,
  tenantName = 'Vasudha Restaurant',
  locationName = 'Main Branch',
}) => {
  const { features } = useTenantStore();
  const isPaymentsEnabled = features?.paymentsEnabled !== false;

  const [selectedMode, setSelectedMode] = useState<'TODAY' | 'LAST_MONTH' | 'CUSTOM'>('TODAY');
  const [isExporting, setIsExporting] = useState(false);

  // Quick Date Helpers
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const now = new Date();

  // Today Date Range
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const todayDateStr = formatDateStr(now);

  // Last Month Date Range
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const lastMonthStartStr = formatDateStr(lastMonthStart);
  const lastMonthEndStr = formatDateStr(lastMonthEnd);
  const lastMonthLabel = lastMonthStart.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Custom Date Range State (defaults to current month start to today)
  const defaultCustomStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const [customStartDate, setCustomStartDate] = useState<string>(formatDateStr(defaultCustomStart));
  const [customEndDate, setCustomEndDate] = useState<string>(formatDateStr(now));

  // Filtered orders for Today
  const todayOrders = useMemo(() => {
    return orders.filter((o) => {
      const oDate = OrderSummaryExcelService.parseOrderDate(o.createdAt);
      return oDate >= todayStart && oDate <= todayEnd;
    });
  }, [orders]);

  // Filtered orders for Last Month
  const lastMonthOrders = useMemo(() => {
    return orders.filter((o) => {
      const oDate = OrderSummaryExcelService.parseOrderDate(o.createdAt);
      return oDate >= lastMonthStart && oDate <= lastMonthEnd;
    });
  }, [orders]);

  // Filtered orders for Custom Range
  const customOrders = useMemo(() => {
    try {
      const s = new Date(`${customStartDate}T00:00:00`);
      const e = new Date(`${customEndDate}T23:59:59.999`);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return [];
      return orders.filter((o) => {
        const oDate = OrderSummaryExcelService.parseOrderDate(o.createdAt);
        return oDate >= s && oDate <= e;
      });
    } catch {
      return [];
    }
  }, [orders, customStartDate, customEndDate]);

  // Helper to compute payment ways and top items
  const computeMetrics = (list: Order[]) => {
    let cash = 0;
    let upi = 0;
    let card = 0;
    let other = 0;
    const itemsMap: Record<string, number> = {};

    list.forEach(o => {
      if (o.payments && Array.isArray(o.payments) && o.payments.length > 0) {
        o.payments.forEach((p: any) => {
          const m = String(p.method || 'CASH').toUpperCase();
          const amt = Number(p.amount) || 0;
          if (m === 'CASH') cash += amt;
          else if (m === 'UPI') upi += amt;
          else if (m === 'CARD') card += amt;
          else other += amt;
        });
      } else {
        const m = String(o.paymentMethod || 'CASH').toUpperCase();
        const amt = Number(o.totalAmount) || 0;
        if (m === 'CASH') cash += amt;
        else if (m === 'UPI') upi += amt;
        else if (m === 'CARD') card += amt;
        else other += amt;
      }

      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((it: any) => {
          const name = String(it.itemName || it.name || 'Item').trim();
          itemsMap[name] = (itemsMap[name] || 0) + (Number(it.qty) || 1);
        });
      }
    });

    const topItems = Object.entries(itemsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { cash, upi, card, other, topItems };
  };

  const todayMetrics = useMemo(() => computeMetrics(todayOrders), [todayOrders]);
  const lastMonthMetrics = useMemo(() => computeMetrics(lastMonthOrders), [lastMonthOrders]);
  const customMetrics = useMemo(() => computeMetrics(customOrders), [customOrders]);

  // Preset Date Handlers for Custom Range
  const applyPreset = (preset: 'TODAY' | 'WEEK' | 'THIS_MONTH' | 'PAST_30_DAYS') => {
    const today = new Date();
    const endStr = formatDateStr(today);
    if (preset === 'TODAY') {
      setCustomStartDate(endStr);
      setCustomEndDate(endStr);
    } else if (preset === 'WEEK') {
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      setCustomStartDate(formatDateStr(start));
      setCustomEndDate(endStr);
    } else if (preset === 'THIS_MONTH') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setCustomStartDate(formatDateStr(start));
      setCustomEndDate(endStr);
    } else if (preset === 'PAST_30_DAYS') {
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      setCustomStartDate(formatDateStr(start));
      setCustomEndDate(endStr);
    }
  };

  // Export Today
  const handleExportToday = async () => {
    setIsExporting(true);
    try {
      const result = await OrderSummaryExcelService.exportOrderSummary({
        orders,
        tenantName,
        locationName,
        startDate: todayStart,
        endDate: todayEnd,
        periodLabel: `Today_${todayDateStr}`,
      });
      toast.success(`Downloaded ${result.count} orders for Today!`, 'Excel Export Ready');
      onClose();
    } catch (err: any) {
      toast.error(err.message, 'Export Error');
    } finally {
      setIsExporting(false);
    }
  };

  // Export Last Month
  const handleExportLastMonth = async () => {
    setIsExporting(true);
    try {
      const result = await OrderSummaryExcelService.exportOrderSummary({
        orders,
        tenantName,
        locationName,
        startDate: lastMonthStart,
        endDate: lastMonthEnd,
        periodLabel: `Last_Month_${lastMonthLabel.replace(/\s+/g, '_')}`,
      });
      toast.success(`Downloaded ${result.count} orders for ${lastMonthLabel}!`, 'Excel Export Ready');
      onClose();
    } catch (err: any) {
      toast.error(err.message, 'Export Error');
    } finally {
      setIsExporting(false);
    }
  };

  // Export Custom Range
  const handleExportCustomRange = async () => {
    const s = new Date(`${customStartDate}T00:00:00`);
    const e = new Date(`${customEndDate}T23:59:59.999`);

    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      toast.warning('Please enter valid dates in YYYY-MM-DD format.', 'Invalid Date');
      return;
    }
    if (s > e) {
      toast.warning('Start date cannot be after end date.', 'Invalid Date Range');
      return;
    }

    setIsExporting(true);
    try {
      const label = `${customStartDate}_to_${customEndDate}`;
      const result = await OrderSummaryExcelService.exportOrderSummary({
        orders,
        tenantName,
        locationName,
        startDate: s,
        endDate: e,
        periodLabel: label,
      });
      toast.success(`Downloaded ${result.count} orders (${customStartDate} to ${customEndDate})!`, 'Excel Export Ready');
      onClose();
    } catch (err: any) {
      toast.error(err.message, 'Export Error');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal transparent animationType="fade" visible={isVisible} onRequestClose={onClose}>
      <View className="flex-1 bg-black/80 items-center justify-center p-4">
        <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
          {/* Header */}
          <View className="p-4 sm:p-5 border-b border-slate-800 flex-row items-center justify-between bg-slate-950/60">
            <View className="flex-row items-center flex-1 mr-3">
              <View className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mr-3 shrink-0">
                <FileSpreadsheet size={20} color="#10B981" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-black text-base" numberOfLines={1}>Vasudha Order Summary</Text>
                <Text className="text-slate-400 text-xs" numberOfLines={1}>Today's & historical sales with item frequency</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-slate-800 active:bg-slate-700">
              <X size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView className="p-4 sm:p-5 max-h-[520px]" showsVerticalScrollIndicator={false}>
            {/* Mode Tabs (Scrollable on small mobile) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row bg-slate-950 p-1 rounded-2xl border border-slate-800 gap-1">
                <TouchableOpacity
                  onPress={() => setSelectedMode('TODAY')}
                  className={`px-3.5 py-2 rounded-xl items-center flex-row justify-center ${selectedMode === 'TODAY' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                    }`}
                >
                  <Clock size={14} color={selectedMode === 'TODAY' ? '#FFFFFF' : '#94A3B8'} />
                  <Text className={`text-xs font-bold ml-1.5 ${selectedMode === 'TODAY' ? 'text-white' : 'text-slate-400'
                    }`}>
                    Today's Orders
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedMode('LAST_MONTH')}
                  className={`px-3.5 py-2 rounded-xl items-center flex-row justify-center ${selectedMode === 'LAST_MONTH' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                    }`}
                >
                  <Calendar size={14} color={selectedMode === 'LAST_MONTH' ? '#FFFFFF' : '#94A3B8'} />
                  <Text className={`text-xs font-bold ml-1.5 ${selectedMode === 'LAST_MONTH' ? 'text-white' : 'text-slate-400'
                    }`}>
                    Last Month
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedMode('CUSTOM')}
                  className={`px-3.5 py-2 rounded-xl items-center flex-row justify-center ${selectedMode === 'CUSTOM' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                    }`}
                >
                  <Filter size={14} color={selectedMode === 'CUSTOM' ? '#FFFFFF' : '#94A3B8'} />
                  <Text className={`text-xs font-bold ml-1.5 ${selectedMode === 'CUSTOM' ? 'text-white' : 'text-slate-400'
                    }`}>
                    Custom Range
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Mode 1: Today's Orders Card */}
            {selectedMode === 'TODAY' && (
              <View className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Clock size={16} color="#34D399" />
                    <Text className="text-white font-bold text-sm ml-2">Today ({todayDateStr})</Text>
                  </View>
                  <View className="bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex-row items-center">
                    <View className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
                    <Text className="text-emerald-300 font-bold text-[11px]">Today Live</Text>
                  </View>
                </View>

                {/* Orders & Revenue Summary */}
                <View className="flex-row justify-between items-center bg-slate-900/90 p-3 rounded-xl border border-slate-800 mb-3">
                  <View>
                    <Text className="text-slate-400 text-[10px] uppercase font-bold">Today's Orders</Text>
                    <Text className="text-white font-black text-lg">{todayOrders.length} orders</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-slate-400 text-[10px] uppercase font-bold">Today's Sales</Text>
                    <Text className="text-emerald-400 font-black text-lg">
                      ₹{todayOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Payment Breakdown (if enabled) */}

                {/* Top Items Sold Preview */}

                <TouchableOpacity
                  onPress={handleExportToday}
                  disabled={isExporting}
                  className="w-full py-3.5 bg-emerald-600 rounded-2xl flex-row items-center justify-center active:bg-emerald-700 shadow-lg shadow-emerald-600/30"
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <View className="flex-row items-center">
                      <Download size={17} color="white" />
                      <Text className="text-white font-bold text-sm ml-2">Download Today's Report (.xlsx)</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Mode 2: Last Month Card */}
            {selectedMode === 'LAST_MONTH' && (
              <View className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Calendar size={16} color="#A78BFA" />
                    <Text className="text-white font-bold text-sm ml-2">{lastMonthLabel}</Text>
                  </View>
                  <View className="bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 rounded-full">
                    <Text className="text-purple-300 font-bold text-[11px]">Full Month</Text>
                  </View>
                </View>

                <Text className="text-slate-400 text-xs mb-3">
                  Period: <Text className="text-white font-semibold">{lastMonthStartStr}</Text> to{' '}
                  <Text className="text-white font-semibold">{lastMonthEndStr}</Text>
                </Text>

                <View className="flex-row justify-between items-center bg-slate-900/90 p-3 rounded-xl border border-slate-800 mb-3">
                  <View>
                    <Text className="text-slate-400 text-[10px] uppercase font-bold">Matching Orders</Text>
                    <Text className="text-white font-black text-lg">{lastMonthOrders.length} orders</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-slate-400 text-[10px] uppercase font-bold">Total Sales</Text>
                    <Text className="text-emerald-400 font-black text-lg">
                      ₹{lastMonthOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Payment Breakdown (if enabled) */}
                {isPaymentsEnabled && (
                  <View className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 mb-3">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                      Payment Collections Breakdown
                    </Text>
                    <View className="flex-row gap-2 flex-wrap">
                      <View className="bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg flex-1 min-w-[100px]">
                        <Text className="text-[10px] text-emerald-400 font-bold">💵 Cash</Text>
                        <Text className="text-white font-black text-sm mt-0.5">₹{lastMonthMetrics.cash.toFixed(0)}</Text>
                      </View>
                      <View className="bg-purple-950/40 border border-purple-500/30 px-2.5 py-1.5 rounded-lg flex-1 min-w-[100px]">
                        <Text className="text-[10px] text-purple-400 font-bold">📱 UPI / QR</Text>
                        <Text className="text-white font-black text-sm mt-0.5">₹{lastMonthMetrics.upi.toFixed(0)}</Text>
                      </View>
                      {lastMonthMetrics.card > 0 && (
                        <View className="bg-sky-950/40 border border-sky-500/30 px-2.5 py-1.5 rounded-lg flex-1 min-w-[100px]">
                          <Text className="text-[10px] text-sky-400 font-bold">💳 Card</Text>
                          <Text className="text-white font-black text-sm mt-0.5">₹{lastMonthMetrics.card.toFixed(0)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Top Items Sold Preview */}
                {lastMonthMetrics.topItems.length > 0 && (
                  <View className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 mb-4">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                      🔥 Most Frequently Sold Last Month
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {lastMonthMetrics.topItems.map(([name, qty], idx) => (
                        <View key={name} className="bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg flex-row items-center">
                          <Text className="text-indigo-400 text-[10px] font-bold mr-1">#{idx + 1}</Text>
                          <Text className="text-slate-200 text-xs font-semibold mr-1.5" numberOfLines={1}>{name}</Text>
                          <Text className="text-emerald-400 text-xs font-black">x{qty}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  onPress={handleExportLastMonth}
                  disabled={isExporting}
                  className="w-full py-3.5 bg-emerald-600 rounded-2xl flex-row items-center justify-center active:bg-emerald-700 shadow-lg shadow-emerald-600/30"
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <View className="flex-row items-center">
                      <Download size={17} color="white" />
                      <Text className="text-white font-bold text-sm ml-2">Download Last Month Report (.xlsx)</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Mode 3: Custom Date Range Card */}
            {selectedMode === 'CUSTOM' && (
              <View className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl mb-4">
                <Text className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">Quick Presets</Text>
                <View className="flex-row flex-wrap gap-1.5 mb-4">
                  {(['TODAY', 'WEEK', 'THIS_MONTH', 'PAST_30_DAYS'] as const).map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => applyPreset(p)}
                      className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl active:bg-slate-800"
                    >
                      <Text className="text-slate-300 text-xs font-semibold">
                        {p === 'TODAY' ? 'Today' : p === 'WEEK' ? 'Last 7 Days' : p === 'THIS_MONTH' ? 'This Month' : 'Past 30 Days'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Date Inputs */}
                <View className="flex-row gap-3 mb-4">
                  <View className="flex-1">
                    <Text className="text-slate-400 text-[11px] font-bold uppercase mb-1.5">Start Date</Text>
                    <View className="bg-slate-900 border border-slate-800 rounded-2xl px-3 py-2">
                      <TextInput
                        value={customStartDate}
                        onChangeText={setCustomStartDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#64748B"
                        className="text-white text-xs font-bold py-0"
                      />
                    </View>
                  </View>

                  <View className="flex-1">
                    <Text className="text-slate-400 text-[11px] font-bold uppercase mb-1.5">End Date</Text>
                    <View className="bg-slate-900 border border-slate-800 rounded-2xl px-3 py-2">
                      <TextInput
                        value={customEndDate}
                        onChangeText={setCustomEndDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#64748B"
                        className="text-white text-xs font-bold py-0"
                      />
                    </View>
                  </View>
                </View>

                {/* Summary Card */}
                <View className="flex-row justify-between items-center bg-slate-900/90 p-3 rounded-xl border border-slate-800 mb-3">
                  <View>
                    <Text className="text-slate-400 text-[10px] uppercase font-bold">Selected Orders</Text>
                    <Text className="text-white font-black text-lg">{customOrders.length} orders</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-slate-400 text-[10px] uppercase font-bold">Total Sales</Text>
                    <Text className="text-emerald-400 font-black text-lg">
                      ₹{customOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Payment Breakdown (if enabled) */}
                {isPaymentsEnabled && (
                  <View className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 mb-3">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">
                      Payment Collections Breakdown
                    </Text>
                    <View className="flex-row gap-2 flex-wrap">
                      <View className="bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg flex-1 min-w-[100px]">
                        <Text className="text-[10px] text-emerald-400 font-bold">💵 Cash</Text>
                        <Text className="text-white font-black text-sm mt-0.5">₹{customMetrics.cash.toFixed(0)}</Text>
                      </View>
                      <View className="bg-purple-950/40 border border-purple-500/30 px-2.5 py-1.5 rounded-lg flex-1 min-w-[100px]">
                        <Text className="text-[10px] text-purple-400 font-bold">📱 UPI / QR</Text>
                        <Text className="text-white font-black text-sm mt-0.5">₹{customMetrics.upi.toFixed(0)}</Text>
                      </View>
                      {customMetrics.card > 0 && (
                        <View className="bg-sky-950/40 border border-sky-500/30 px-2.5 py-1.5 rounded-lg flex-1 min-w-[100px]">
                          <Text className="text-[10px] text-sky-400 font-bold">💳 Card</Text>
                          <Text className="text-white font-black text-sm mt-0.5">₹{customMetrics.card.toFixed(0)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Top Items Sold Preview */}
                {customMetrics.topItems.length > 0 && (
                  <View className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 mb-4">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                      🔥 Most Frequently Sold in Period
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {customMetrics.topItems.map(([name, qty], idx) => (
                        <View key={name} className="bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg flex-row items-center">
                          <Text className="text-indigo-400 text-[10px] font-bold mr-1">#{idx + 1}</Text>
                          <Text className="text-slate-200 text-xs font-semibold mr-1.5" numberOfLines={1}>{name}</Text>
                          <Text className="text-emerald-400 text-xs font-black">x{qty}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  onPress={handleExportCustomRange}
                  disabled={isExporting}
                  className="w-full py-3.5 bg-emerald-600 rounded-2xl flex-row items-center justify-center active:bg-emerald-700 shadow-lg shadow-emerald-600/30"
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <View className="flex-row items-center">
                      <Download size={17} color="white" />
                      <Text className="text-white font-bold text-sm ml-2">Download Custom Range Report (.xlsx)</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Feature Highlights Banner */}
            <View className="bg-slate-950/40 border border-slate-800/80 p-3.5 rounded-2xl">
              <View className="flex-row items-center mb-1.5">
                <Sparkles size={14} color="#34D399" />
                <Text className="text-emerald-400 font-bold text-xs ml-1.5">What's in the Excel Report?</Text>
              </View>
              <Text className="text-slate-400 text-[11px] mb-1">
                • Sheet 1: Timestamped order history with bill & KOT numbers, payments, taxes
              </Text>
              <Text className="text-slate-400 text-[11px] mb-1">
                • Sheet 2: <Text className="text-indigo-400 font-bold">Item Sales Frequency & Quantity</Text> with item sales rankings
              </Text>
              <Text className="text-slate-400 text-[11px] mb-1">
                • Cash, UPI, and Card collections breakdown in KPI summary
              </Text>
              <Text className="text-slate-400 text-[11px]">
                • <Text className="text-emerald-400 font-bold">🟢 Highest Sale (Peak)</Text> and <Text className="text-rose-400 font-bold">🔴 Lowest Sale</Text> clearly highlighted
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="p-4 border-t border-slate-800 bg-slate-950/80 flex-row justify-end">
            <TouchableOpacity onPress={onClose} className="px-5 py-2.5 rounded-xl bg-slate-800 active:bg-slate-700">
              <Text className="text-slate-300 font-bold text-xs">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};


export const OrderSummaryDownloadModal: React.FC<OrderSummaryDownloadModalProps> = (props) => {
  if (!props.isVisible) return null;
  return <OrderSummaryDownloadModalInner {...props} />;
};
