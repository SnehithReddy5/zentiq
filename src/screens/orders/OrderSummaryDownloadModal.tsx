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
  Filter
} from 'lucide-react-native';
import { toast } from '../../utils/toast';
import { Order } from '../../types/order.types';
import { OrderSummaryExcelService } from '../../services/excel/orderSummaryExcel.service';

interface OrderSummaryDownloadModalProps {
  isVisible: boolean;
  onClose: () => void;
  orders: Order[];
  tenantName?: string;
  locationName?: string;
}

export const OrderSummaryDownloadModal: React.FC<OrderSummaryDownloadModalProps> = ({
  isVisible,
  onClose,
  orders,
  tenantName = 'Vasudha Restaurant',
  locationName = 'Main Branch',
}) => {
  const [selectedMode, setSelectedMode] = useState<'LAST_MONTH' | 'CUSTOM'>('LAST_MONTH');
  const [isExporting, setIsExporting] = useState(false);

  // Quick Date Helpers
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const now = new Date();
  
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
          <View className="p-5 border-b border-slate-800 flex-row items-center justify-between bg-slate-950/60">
            <View className="flex-row items-center flex-1 mr-3">
              <View className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mr-3">
                <FileSpreadsheet size={22} color="#10B981" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-black text-base">Vasudha Order Summary</Text>
                <Text className="text-slate-400 text-xs">Download complete sales & order history Excel</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-slate-800 active:bg-slate-700">
              <X size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView className="p-5 max-h-[500px]" showsVerticalScrollIndicator={false}>
            {/* Mode Tabs */}
            <View className="flex-row bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-4">
              <TouchableOpacity
                onPress={() => setSelectedMode('LAST_MONTH')}
                className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center ${
                  selectedMode === 'LAST_MONTH' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                }`}
              >
                <Calendar size={15} color={selectedMode === 'LAST_MONTH' ? '#FFFFFF' : '#94A3B8'} />
                <Text className={`text-xs font-bold ml-2 ${
                  selectedMode === 'LAST_MONTH' ? 'text-white' : 'text-slate-400'
                }`}>
                  Last Month
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSelectedMode('CUSTOM')}
                className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center ${
                  selectedMode === 'CUSTOM' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                }`}
              >
                <Filter size={15} color={selectedMode === 'CUSTOM' ? '#FFFFFF' : '#94A3B8'} />
                <Text className={`text-xs font-bold ml-2 ${
                  selectedMode === 'CUSTOM' ? 'text-white' : 'text-slate-400'
                }`}>
                  Custom Date Range
                </Text>
              </TouchableOpacity>
            </View>

            {/* Mode 1: Last Month Card */}
            {selectedMode === 'LAST_MONTH' && (
              <View className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Calendar size={18} color="#A78BFA" />
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

                <View className="flex-row justify-between items-center bg-slate-900/90 p-3 rounded-xl border border-slate-800 mb-4">
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

                <TouchableOpacity
                  onPress={handleExportLastMonth}
                  disabled={isExporting}
                  className="w-full py-3.5 bg-emerald-600 rounded-2xl flex-row items-center justify-center active:bg-emerald-700 shadow-lg shadow-emerald-600/30"
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Download size={18} color="white" />
                      <Text className="text-white font-bold text-sm ml-2">Download Last Month Report (.xlsx)</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Mode 2: Custom Date Range Card */}
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
                <View className="flex-row justify-between items-center bg-slate-900/90 p-3 rounded-xl border border-slate-800 mb-4">
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

                <TouchableOpacity
                  onPress={handleExportCustomRange}
                  disabled={isExporting}
                  className="w-full py-3.5 bg-emerald-600 rounded-2xl flex-row items-center justify-center active:bg-emerald-700 shadow-lg shadow-emerald-600/30"
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Download size={18} color="white" />
                      <Text className="text-white font-bold text-sm ml-2">Download Custom Range Report (.xlsx)</Text>
                    </>
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
                • Complete timestamped order history with bill & KOT numbers
              </Text>
              <Text className="text-slate-400 text-[11px] mb-1">
                • Full items list, quantities, table & cashier details
              </Text>
              <Text className="text-slate-400 text-[11px] mb-1">
                • <Text className="text-emerald-400 font-bold">🟢 Highest Sale (Peak)</Text> and <Text className="text-rose-400 font-bold">🔴 Lowest Sale</Text> clearly highlighted
              </Text>
              <Text className="text-slate-400 text-[11px]">
                • Auto-calculated subtotal, tax breakdown, and total revenue
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
