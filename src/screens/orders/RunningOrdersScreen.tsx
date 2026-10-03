import { toast } from '../../utils/toast';
import React, {  useEffect, useState, useMemo , useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search,
  MapPin,
  Receipt,
  CheckCircle2,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Award,
  Clock,
  Printer,
  X,
  User,
  CreditCard,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Utensils,
  ArrowLeft,
  Trash2,
  FileSpreadsheet,
  Download,
  Banknote,
  Smartphone,
  Calendar,
  Filter
} from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { useOrderStore } from '../../store/order.store';
import { useTenantStore } from '../../store/tenant.store';
import { useAuthStore } from '../../store/auth.store';
import { usePrinterStore } from '../../store/printer.store';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { DBServices } from '../../services/firebase/db';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { OrderSummaryDownloadModal } from './OrderSummaryDownloadModal';
import { Order } from '../../types/order.types';

// Safe date helpers
const formatOrderDate = (createdAt: any) => {
  if (!createdAt) return 'Just now';
  const date = typeof createdAt.toDate === 'function'
    ? createdAt.toDate()
    : new Date(createdAt.seconds ? createdAt.seconds * 1000 : createdAt);

  if (isNaN(date.getTime())) return 'Just now';

  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const parseOrderDate = (rawDate: any): Date => {
  if (!rawDate) return new Date();
  if (typeof rawDate.toDate === 'function') {
    try { return rawDate.toDate(); } catch (e) { /* fallback */ }
  }
  if (rawDate.seconds !== undefined) {
    return new Date(rawDate.seconds * 1000);
  }
  if (typeof rawDate === 'string' || typeof rawDate === 'number') {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (rawDate instanceof Date) return rawDate;
  return new Date();
};

const isToday = (date: Date): boolean => {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};


interface OrderCardProps {
  item: any;
  ordersGridColumns: number;
  isHighest: boolean;
  isLowest: boolean;
  onPress: (order: any) => void;
}

const OrderCard = React.memo(({
  item,
  ordersGridColumns,
  isHighest,
  isLowest,
  onPress
}: OrderCardProps) => {
  const isRunning = item.status === 'running' || item.status === 'RUNNING';
  const itemsList = item.items || [];
  const displayedItems = itemsList.slice(0, 2);
  const remainingCount = itemsList.length - displayedItems.length;
  const orderBillNo = item.orderNumber ? `#${item.orderNumber}` : (item.kotNo ? `#${item.kotNo}` : `#${item.id.slice(0, 6)}`);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(item)}
      className={`p-4 rounded-3xl m-1.5 justify-between active:bg-slate-850 ${isHighest
        ? 'bg-slate-900 border-2 border-emerald-500'
        : isLowest
          ? 'bg-slate-900 border-2 border-rose-500'
          : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
        }`}
      style={{ flex: 1 / ordersGridColumns }}
    >
      <View>
        {/* Top & Least Badges */}
        {isHighest && (
          <View className="flex-row items-center mb-2 self-start bg-emerald-500/20 border border-emerald-500/50 px-2 py-0.5 rounded-full">
            <TrendingUp size={11} color="#34D399" />
            <Text className="text-emerald-300 font-black text-[10px] ml-1 tracking-wide">TOP ORDER (PEAK 🟢)</Text>
          </View>
        )}
        {isLowest && (
          <View className="flex-row items-center mb-2 self-start bg-rose-500/20 border border-rose-500/50 px-2 py-0.5 rounded-full">
            <TrendingDown size={11} color="#F43F5E" />
            <Text className="text-rose-300 font-black text-[10px] ml-1 tracking-wide">LEAST ORDER (MIN 🔴)</Text>
          </View>
        )}

        {/* Header Row: Table/Type pill, KOT, Status, and Total */}
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-2 flex-row items-center flex-wrap gap-1.5">
            <Text className="text-white font-black text-base">
              {item.tableNo ? (`Table ${item.tableNo}`) : (item.orderType === 'PICKUP' ? 'Pick Up' : 'Takeaway')}
            </Text>
            <View className="bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
              <Text className="text-indigo-300 text-[10px] font-bold">
                {orderBillNo}
              </Text>
            </View>
            <View className={`px-2 py-0.5 rounded border ${isRunning ? 'bg-amber-500/20 border-amber-500/30' : 'bg-emerald-500/20 border-emerald-500/30'
              }`}>
              <Text className={`text-[10px] font-bold ${isRunning ? 'text-amber-300' : 'text-emerald-300'
                }`}>
                {isRunning ? 'RUNNING' : 'SETTLED'}
              </Text>
            </View>
          </View>

          <Text className={`font-black text-lg shrink-0 ${isHighest ? 'text-emerald-300' : isLowest ? 'text-rose-300' : 'text-emerald-400'
            }`} numberOfLines={1}>
            ₹{Number(item.totalAmount || 0).toFixed(0)}
          </Text>
        </View>

        {/* Items Summary Preview */}
        <View className="mb-2">
          {displayedItems.map((it: any, idx: number) => (
            <Text key={idx} className="text-slate-300 text-xs py-0.5" numberOfLines={1}>
              <Text className="text-purple-400 font-bold">{it.qty || 1}x</Text> {it.itemName || it.name}
              {it.variantName ? ` (${it.variantName})` : ''}
            </Text>
          ))}
          {remainingCount > 0 && (
            <Text className="text-[11px] text-indigo-400 font-bold mt-0.5">+ {remainingCount} more items</Text>
          )}
        </View>
      </View>

      {/* Footer Row: Timestamp, Cashier, and Tap to Open */}
      <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-slate-800/80">
        <Text className="text-slate-400 text-[10px]">
          {formatOrderDate(item.createdAt)} • By {item.captainName || 'Staff'}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-[10px] text-indigo-300 font-bold">
            Details ➜
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});


interface OrdersSummaryDashboardProps {
  timeScope: 'TODAY' | 'ALL';
  setTimeScope: (scope: 'TODAY' | 'ALL') => void;
  isSummaryExpanded: boolean;
  setIsSummaryExpanded: (val: boolean) => void;
  summaryTab: 'OVERVIEW' | 'PAYMENTS' | 'ITEMS';
  setSummaryTab: (tab: 'OVERVIEW' | 'PAYMENTS' | 'ITEMS') => void;
  stats: any;
  isPaymentsEnabled: boolean;
  onOpenItemFrequencyModal: () => void;
}

const OrdersSummaryDashboard = React.memo(({
  timeScope,
  setTimeScope,
  isSummaryExpanded,
  setIsSummaryExpanded,
  summaryTab,
  setSummaryTab,
  stats,
  isPaymentsEnabled,
  onOpenItemFrequencyModal
}: OrdersSummaryDashboardProps) => {
            const activeRevenue = timeScope === 'TODAY' ? stats.todayRevenue : stats.totalRevenue;
            const activeCount = timeScope === 'TODAY' ? stats.todayOrdersCount : stats.totalOrdersCount;
            const activeDineIn = timeScope === 'TODAY' ? stats.todayDineInCount : stats.dineInCount;
            const activePickup = timeScope === 'TODAY' ? stats.todayPickupCount : stats.pickupCount;
            const activeTakeaway = timeScope === 'TODAY' ? stats.todayTakeawayCount : stats.takeawayCount;
            const activeAvg = timeScope === 'TODAY' ? stats.todayAvgOrder : stats.averageOrderValue;
            const activePayments = timeScope === 'TODAY' ? stats.paymentsToday : stats.paymentsAll;
            const activeItems = timeScope === 'TODAY' ? stats.itemFrequencyToday : stats.itemFrequencyAll;

            return (
              <View className="mb-3">
                {/* Comprehensive Order Summary Dashboard */}
                <View className="bg-slate-900 border border-slate-800/80 rounded-3xl p-3.5 sm:p-4 mb-2.5">
                  {/* Collapsed View (Ultra-Compact on Mobile) */}
                  {!isSummaryExpanded ? (
                    <View className="flex-row items-center justify-between py-0.5">
                      <View className="flex-row items-center flex-1 mr-2 flex-wrap gap-x-2 gap-y-1">
                        <View className="flex-row items-center px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800">
                          <View className={`w-2 h-2 rounded-full mr-1.5 ${timeScope === 'TODAY' ? 'bg-emerald-400' : 'bg-indigo-400'}`} />
                          <Text className="text-white text-xs font-bold">
                            {timeScope === 'TODAY' ? "Today's Revenue" : "All-Time Revenue"}: ₹{activeRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </Text>
                          <Text className="text-slate-400 text-[11px] ml-1.5">
                            ({activeCount} orders)
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        onPress={() => setIsSummaryExpanded(true)}
                        className="flex-row items-center bg-slate-800 px-3 py-1.5 rounded-xl active:bg-slate-700 shrink-0"
                      >
                        <ChevronDown size={13} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      {/* Expanded Header: Live Scope, Revenue & Collapse (Single Master Scope Controlled Above) */}
                      <View className="flex-row items-center justify-between pb-3 border-b border-slate-800/80">
                        <View className="flex-1 mr-2">
                          <View className="flex-row items-center mb-0.5">
                            <View className={`w-2 h-2 rounded-full mr-1.5 ${timeScope === 'TODAY' ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'}`} />
                            <Text className="text-slate-400 text-[10px] font-black uppercase tracking-wider">
                              {timeScope === 'TODAY' ? "Today's Orders Summary" : "All-Time Orders Summary"}
                            </Text>
                          </View>
                          <Text className="text-2xl font-black text-emerald-400" numberOfLines={1}>
                            ₹{activeRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <Text className="text-slate-400 text-[11px] mt-0.5 font-medium">
                            {activeCount} orders <Text className="text-slate-500">({activeDineIn} Dine · {activePickup} Pick{activeTakeaway > 0 ? ` · ${activeTakeaway} Take` : ''})</Text>
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => setIsSummaryExpanded(false)}
                          className="p-2 rounded-xl bg-slate-800 active:bg-slate-700 shrink-0"
                          accessibilityLabel="Collapse Summary"
                        >
                          <ChevronUp size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>

                      {/* Sub-Tabs: Overview, Payment Ways, Item Frequency (Scrollable for compact mobile) */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingTop: 10, paddingBottom: 4 }}>
                        <TouchableOpacity
                          onPress={() => setSummaryTab('OVERVIEW')}
                          className={`px-3 py-1.5 rounded-xl border flex-row items-center ${summaryTab === 'OVERVIEW' ? 'bg-indigo-600/30 border-indigo-500' : 'bg-slate-950 border-slate-800'
                            }`}
                        >
                          <Text className={`text-xs font-bold ${summaryTab === 'OVERVIEW' ? 'text-indigo-300' : 'text-slate-400'}`}>
                            📊 Overview
                          </Text>
                        </TouchableOpacity>

                        {isPaymentsEnabled && (
                          <TouchableOpacity
                            onPress={() => setSummaryTab('PAYMENTS')}
                            className={`px-3 py-1.5 rounded-xl border flex-row items-center ${summaryTab === 'PAYMENTS' ? 'bg-purple-600/30 border-purple-500' : 'bg-slate-950 border-slate-800'
                              }`}
                          >
                            <Text className={`text-xs font-bold ${summaryTab === 'PAYMENTS' ? 'text-purple-300' : 'text-slate-400'}`}>
                              💳 Payment Ways
                            </Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          onPress={() => setSummaryTab('ITEMS')}
                          className={`px-3 py-1.5 rounded-xl border flex-row items-center ${summaryTab === 'ITEMS' ? 'bg-emerald-600/30 border-emerald-500' : 'bg-slate-950 border-slate-800'
                            }`}
                        >
                          <Text className={`text-xs font-bold ${summaryTab === 'ITEMS' ? 'text-emerald-300' : 'text-slate-400'}`}>
                            🍲 Item Frequency ({activeItems.length})
                          </Text>
                        </TouchableOpacity>
                      </ScrollView>

                      {/* Tab 1: OVERVIEW METRIC TILES */}
                      {summaryTab === 'OVERVIEW' && (
                        <View className="flex-row flex-wrap gap-2 pt-2.5">
                          {/* Today's Orders Tile */}
                          <View className="bg-slate-950/80 border border-slate-800/80 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                            <View className="flex-row items-center justify-between">
                              <Text className="text-slate-400 text-[10px] font-bold uppercase">Today's Orders</Text>
                              <Clock size={13} color="#34D399" />
                            </View>
                            <Text className="text-emerald-300 font-black text-base mt-1" numberOfLines={1}>
                              {stats.todayOrdersCount} <Text className="text-xs text-slate-400 font-normal">({stats.todayDineInCount}D / {stats.todayPickupCount}P)</Text>
                            </Text>
                            <Text className="text-slate-400 text-[10px] mt-0.5">
                              ₹{stats.todayRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} today
                            </Text>
                          </View>

                          {/* Total Orders History Tile */}
                          <View className="bg-slate-950/80 border border-slate-800/80 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                            <View className="flex-row items-center justify-between">
                              <Text className="text-slate-400 text-[10px] font-bold uppercase">Total Orders</Text>
                              <Receipt size={13} color="#818CF8" />
                            </View>
                            <Text className="text-white font-black text-base mt-1" numberOfLines={1}>
                              {stats.totalOrdersCount} <Text className="text-xs text-slate-400 font-normal">({stats.dineInCount}D / {stats.pickupCount}P)</Text>
                            </Text>
                            <Text className="text-slate-400 text-[10px] mt-0.5">
                              ₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total
                            </Text>
                          </View>

                          {/* Avg Bill Value Tile */}
                          <View className="bg-slate-950/80 border border-slate-800/80 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                            <View className="flex-row items-center justify-between">
                              <Text className="text-slate-400 text-[10px] font-bold uppercase">Avg Ticket</Text>
                              <Utensils size={13} color="#C084FC" />
                            </View>
                            <Text className="text-purple-300 font-black text-base mt-1" numberOfLines={1}>
                              ₹{activeAvg.toFixed(0)}
                            </Text>
                            <Text className="text-slate-400 text-[10px] mt-0.5">
                              {timeScope === 'TODAY' ? "Today's avg bill" : "Historical avg"}
                            </Text>
                          </View>

                          {/* Top Order Peak Tile */}
                          <View className="bg-emerald-950/30 border border-emerald-500/40 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                            <View className="flex-row items-center justify-between">
                              <Text className="text-emerald-400 text-[10px] font-black uppercase tracking-wide">Peak Sale (🟢)</Text>
                              <TrendingUp size={13} color="#34D399" />
                            </View>
                            <View className="flex-row items-baseline gap-1 mt-1">
                              <Text className="text-emerald-300 font-black text-base" numberOfLines={1}>
                                ₹{stats.highestOrderAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </Text>
                              {stats.highestOrderKOT !== 'None' && (
                                <Text className="text-emerald-400/80 text-[10px] font-bold" numberOfLines={1}>{stats.highestOrderKOT}</Text>
                              )}
                            </View>
                            <Text className="text-slate-400 text-[10px] mt-0.5">
                              Min: ₹{stats.lowestOrderAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Tab 2: PAYMENT WAYS BREAKDOWN (Shown when payments are enabled) */}
                      {summaryTab === 'PAYMENTS' && isPaymentsEnabled && (
                        <View className="pt-2">
                          {/* Multi-Tender Visual Stacked Bar */}
                          {activePayments.totalCollected > 0 && (
                            <View className="h-1.5 rounded-full flex-row overflow-hidden bg-slate-950 mb-2.5">
                              {activePayments.cash.percent > 0 && (
                                <View style={{ width: `${activePayments.cash.percent}%` }} className="bg-emerald-500 h-full" />
                              )}
                              {activePayments.upi.percent > 0 && (
                                <View style={{ width: `${activePayments.upi.percent}%` }} className="bg-purple-500 h-full" />
                              )}
                              {activePayments.card.percent > 0 && (
                                <View style={{ width: `${activePayments.card.percent}%` }} className="bg-sky-500 h-full" />
                              )}
                              {activePayments.other.percent > 0 && (
                                <View style={{ width: `${activePayments.other.percent}%` }} className="bg-amber-500 h-full" />
                              )}
                            </View>
                          )}

                          {/* Payment Mode Tiles Grid */}
                          <View className="flex-row flex-wrap gap-2">
                            {/* Cash Collection */}
                            <View className="bg-emerald-950/25 border border-emerald-500/30 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                              <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center">
                                  <Banknote size={14} color="#10B981" />
                                  <Text className="text-emerald-400 text-[11px] font-black uppercase ml-1.5">Cash</Text>
                                </View>
                                <Text className="text-emerald-400 font-bold text-[10px]">
                                  {activePayments.cash.percent.toFixed(0)}%
                                </Text>
                              </View>
                              <Text className="text-white font-black text-base mt-1" numberOfLines={1}>
                                ₹{activePayments.cash.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </Text>
                              <Text className="text-slate-400 text-[10px] mt-0.5">
                                {activePayments.cash.count} orders settled
                              </Text>
                            </View>

                            {/* UPI Collection */}
                            <View className="bg-purple-950/25 border border-purple-500/30 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                              <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center">
                                  <Smartphone size={14} color="#A78BFA" />
                                  <Text className="text-purple-300 text-[11px] font-black uppercase ml-1.5">UPI / QR</Text>
                                </View>
                                <Text className="text-purple-300 font-bold text-[10px]">
                                  {activePayments.upi.percent.toFixed(0)}%
                                </Text>
                              </View>
                              <Text className="text-white font-black text-base mt-1" numberOfLines={1}>
                                ₹{activePayments.upi.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </Text>
                              <Text className="text-slate-400 text-[10px] mt-0.5">
                                {activePayments.upi.count} orders settled
                              </Text>
                            </View>

                            {/* Card Collection (if card enabled or card sales exist) */}
                            {(isPaymentsEnabled || activePayments.card.amount > 0) && (
                              <View className="bg-sky-950/25 border border-sky-500/30 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-row items-center">
                                    <CreditCard size={14} color="#38BDF8" />
                                    <Text className="text-sky-300 text-[11px] font-black uppercase ml-1.5">Card</Text>
                                  </View>
                                  <Text className="text-sky-300 font-bold text-[10px]">
                                    {activePayments.card.percent.toFixed(0)}%
                                  </Text>
                                </View>
                                <Text className="text-white font-black text-base mt-1" numberOfLines={1}>
                                  ₹{activePayments.card.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </Text>
                                <Text className="text-slate-400 text-[10px] mt-0.5">
                                  {activePayments.card.count} orders settled
                                </Text>
                              </View>
                            )}

                            {/* Other / Custom Tenders (if any) */}
                            {activePayments.other.amount > 0 && (
                              <View className="bg-amber-950/25 border border-amber-500/30 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-row items-center">
                                    <Receipt size={14} color="#FBBF24" />
                                    <Text className="text-amber-300 text-[11px] font-black uppercase ml-1.5">Other</Text>
                                  </View>
                                  <Text className="text-amber-300 font-bold text-[10px]">
                                    {activePayments.other.percent.toFixed(0)}%
                                  </Text>
                                </View>
                                <Text className="text-white font-black text-base mt-1" numberOfLines={1}>
                                  ₹{activePayments.other.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </Text>
                                <Text className="text-slate-400 text-[10px] mt-0.5">
                                  {activePayments.other.count} orders
                                </Text>
                              </View>
                            )}

                            {/* Unpaid / Active Running (if any) */}
                            {activePayments.unpaid.amount > 0 && (
                              <View className="bg-rose-950/20 border border-rose-500/30 p-2.5 rounded-2xl flex-1 min-w-[130px]">
                                <Text className="text-rose-400 text-[10px] font-bold uppercase">Unpaid / Running</Text>
                                <Text className="text-rose-300 font-black text-base mt-1" numberOfLines={1}>
                                  ₹{activePayments.unpaid.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </Text>
                                <Text className="text-slate-400 text-[10px] mt-0.5">
                                  {activePayments.unpaid.count} running tables
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      )}

                      {/* Tab 3: ITEM FREQUENCY (Top sold items & portions) */}
                      {summaryTab === 'ITEMS' && (
                        <View className="pt-2 gap-1.5">
                          {activeItems.length === 0 ? (
                            <View className="py-4 items-center">
                              <Text className="text-slate-500 text-xs">No items sold recorded for this period</Text>
                            </View>
                          ) : (
                            <View className="gap-1.5">
                              {activeItems.slice(0, 4).map((it: any, idx: number) => {
                                const maxQty = activeItems[0]?.qty || 1;
                                const widthPct = Math.max(8, Math.min(100, (it.qty / maxQty) * 100));
                                return (
                                  <View key={`${it.itemName}-${it.variantName || ''}-${idx}`} className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-2xl relative overflow-hidden">
                                    <View
                                      style={{ width: `${widthPct}%` }}
                                      className="absolute left-0 top-0 bottom-0 bg-indigo-500/10 rounded-2xl"
                                    />
                                    <View className="flex-row items-center justify-between relative z-10">
                                      <View className="flex-row items-center flex-1 mr-2">
                                        <View className={`w-5 h-5 rounded-full items-center justify-center mr-2 shrink-0 ${idx === 0 ? 'bg-amber-500/20 border border-amber-500/40' :
                                          idx === 1 ? 'bg-slate-400/20 border border-slate-400/40' :
                                            idx === 2 ? 'bg-amber-700/20 border border-amber-700/40' :
                                              'bg-slate-800'
                                          }`}>
                                          <Text className={`text-[10px] font-black ${idx === 0 ? 'text-amber-400' :
                                            idx === 1 ? 'text-slate-300' :
                                              idx === 2 ? 'text-amber-500' :
                                                'text-slate-400'
                                            }`}>
                                            #{idx + 1}
                                          </Text>
                                        </View>
                                        <View className="flex-1">
                                          <Text className="text-white text-xs font-bold" numberOfLines={1}>
                                            {it.itemName}
                                          </Text>
                                          {it.variantName ? (
                                            <Text className="text-slate-400 text-[10px]" numberOfLines={1}>{it.variantName}</Text>
                                          ) : null}
                                        </View>
                                      </View>

                                      <View className="items-end shrink-0">
                                        <View className="bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                                          <Text className="text-emerald-300 font-black text-xs">x{it.qty} sold</Text>
                                        </View>
                                        <Text className="text-slate-400 text-[10px] font-bold mt-0.5">
                                          ₹{it.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                );
                              })}

                              <TouchableOpacity
                                onPress={onOpenItemFrequencyModal}
                                className="mt-1 py-2 bg-indigo-600/20 border border-indigo-500/30 rounded-xl items-center flex-row justify-center active:bg-indigo-600/30"
                              >
                                <Sparkles size={13} color="#818CF8" />
                                <Text className="text-indigo-300 font-bold text-xs ml-1.5">
                                  View All Item Rankings ({activeItems.length} dishes)
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <Text className="text-[11px] text-slate-500 italic ml-1">
                  Tip: Tap any order to view full bill details and reprint receipts.
                </Text>
              </View>
            );
});

export const RunningOrdersScreen = () => {
  const insets = useSafeAreaInsets();
  const { orders, subscribeToOrders, isLoading } = useOrderStore();
  const { tenant, locations, activeLocationId, branding, features } = useTenantStore();
  const { settings } = usePrinterStore();
  const { user } = useAuthStore();
  const { ordersGridColumns, isLargePOS } = useResponsiveLayout();
  const isClientAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';
  const isPaymentsEnabled = features?.paymentsEnabled !== false;

  // Location filter: defaults to active branch or 'ALL'
  
  // Defer heavy analytics until JS thread is idle (requestIdleCallback) for 60 FPS slide transition
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const idleApi = (globalThis as any).requestIdleCallback;
    const cancelApi = (globalThis as any).cancelIdleCallback;
    if (typeof idleApi === 'function') {
      const id = idleApi(() => setIsReady(true), { timeout: 200 });
      return () => {
        if (typeof cancelApi === 'function') cancelApi(id);
      };
    }
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const staffBranch = activeLocationId || (user?.locationIds && user.locationIds[0] !== '*' ? user.locationIds[0] : null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    isClientAdmin ? (activeLocationId || (locations[0]?.id || 'ALL')) : (staffBranch || 'ALL')
  );
  const [search, setSearch] = useState('');
  const [selectedOrderTypeFilter, setSelectedOrderTypeFilter] = useState<'ALL' | 'DINE_IN' | 'PICKUP' | 'TAKEAWAY'>('ALL');

  // Single Master Scope for both Summary Dashboard & Order List: 'TODAY' vs 'ALL'
  const [timeScope, setTimeScope] = useState<'TODAY' | 'ALL'>('TODAY');
  const [summaryTab, setSummaryTab] = useState<'OVERVIEW' | 'PAYMENTS' | 'ITEMS'>('OVERVIEW');
  const [isSummaryExpanded, setIsSummaryExpanded] = useState<boolean>(true);
  const [isItemFrequencyModalOpen, setItemFrequencyModalOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  // Modal & Reprint states
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isDownloadModalOpen, setDownloadModalOpen] = useState(false);
  const [isReprinting, setIsReprinting] = useState(false);
  const [isReprintingKitchen, setIsReprintingKitchen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Subscribe dynamically to the selected location
  useEffect(() => {
    const unsub = subscribeToOrders(selectedLocationId);
    return () => unsub();
  }, [tenant?.id, selectedLocationId]);

  // Base filtered orders list (by location, search query, and order type filter)
  const baseFilteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cleanQ = q.replace(/^#/, '').trim();

    return orders.filter(o => {
      // Order type filter
      if (selectedOrderTypeFilter === 'DINE_IN' && (!o.tableNo || o.orderType === 'PICKUP' || o.orderType === 'TAKEAWAY')) {
        return false;
      }
      if (selectedOrderTypeFilter === 'PICKUP' && o.orderType !== 'PICKUP') {
        return false;
      }
      if (selectedOrderTypeFilter === 'TAKEAWAY' && o.orderType !== 'TAKEAWAY') {
        return false;
      }

      // If search query is empty, match all
      if (!q) return true;

      // 1. Bill #, Order #, KOT #, and ID
      const billNo = String(o.orderNumber || '');
      const kotNo = String(o.kotNo || '');
      const id = String(o.id || '').toLowerCase();
      if (
        billNo.includes(cleanQ) ||
        `#${billNo}`.includes(q) ||
        kotNo.includes(cleanQ) ||
        `kot-${kotNo}`.includes(q) ||
        `kot ${kotNo}`.includes(q) ||
        `#${kotNo}`.includes(q) ||
        id.includes(q)
      ) {
        return true;
      }

      // 2. Table #
      const tableNo = String(o.tableNo || '');
      if (
        (o.tableNo && tableNo === cleanQ) ||
        `table ${tableNo}`.toLowerCase().includes(q) ||
        `tbl ${tableNo}`.toLowerCase().includes(q) ||
        `t${tableNo}`.toLowerCase().includes(q)
      ) {
        return true;
      }

      // 3. Captain / Cashier name
      if (o.captainName && o.captainName.toLowerCase().includes(q)) {
        return true;
      }

      // 4. Food items ordered (item name, variant name)
      if (o.items && Array.isArray(o.items)) {
        const hasItem = o.items.some((it: any) => {
          const name = String(it.itemName || (it as any).name || '').toLowerCase();
          const variant = String(it.variantName || '').toLowerCase();
          return name.includes(q) || variant.includes(q);
        });
        if (hasItem) return true;
      }

      // 5. Payment method
      if (o.paymentMethod && String(o.paymentMethod).toLowerCase().includes(q)) {
        return true;
      }
      if (o.payments && Array.isArray(o.payments)) {
        const hasPayment = o.payments.some((p: any) => String(p.method || '').toLowerCase().includes(q));
        if (hasPayment) return true;
      }

      // 6. Branch / Location
      if (o.locationName && o.locationName.toLowerCase().includes(q)) {
        return true;
      }

      return false;
    });
  }, [orders, search, selectedOrderTypeFilter]);

  // Pre-calculate start and end of Today in ms once
  const { startOfTodayMs, endOfTodayMs } = useMemo(() => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { startOfTodayMs: start, endOfTodayMs: start + 86400000 };
  }, []);

  // Fast timestamp helper without allocating Date objects per check
  const getOrderTimestamp = (o: any): number => {
    const raw = o.createdAt;
    if (!raw) return 0;
    if (raw.seconds !== undefined) return raw.seconds * 1000;
    if (typeof raw === 'number') return raw;
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'string') {
      const parsed = Date.parse(raw);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // Pre-filter today's orders using numeric timestamp comparisons
  const todayOrders = useMemo(() => {
    return baseFilteredOrders.filter(o => {
      const t = getOrderTimestamp(o);
      return t >= startOfTodayMs && t < endOfTodayMs;
    });
  }, [baseFilteredOrders, startOfTodayMs, endOfTodayMs]);

  // Orders list rendered in FlatList: O(1) instantaneous pointer switch
  const filteredOrders = useMemo(() => {
    return timeScope === 'TODAY' ? todayOrders : baseFilteredOrders;
  }, [timeScope, todayOrders, baseFilteredOrders]);

  // Rich KPIs & Analytics Calculations (pre-calculated once, independent of timeScope toggle)
  const stats = useMemo(() => {
    const totalOrdersCount = baseFilteredOrders.length;
    const totalRevenue = baseFilteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const averageOrderValue = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;

    const todayOrdersCount = todayOrders.length;
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const todayAvgOrder = todayOrdersCount > 0 ? todayRevenue / todayOrdersCount : 0;

    const todayDineInCount = todayOrders.filter(o => o.tableNo && o.orderType !== 'PICKUP' && o.orderType !== 'TAKEAWAY').length;
    const todayPickupCount = todayOrders.filter(o => o.orderType === 'PICKUP').length;
    const todayTakeawayCount = todayOrders.filter(o => o.orderType === 'TAKEAWAY').length;

    const dineInCount = baseFilteredOrders.filter(o => o.tableNo && o.orderType !== 'PICKUP' && o.orderType !== 'TAKEAWAY').length;
    const pickupCount = baseFilteredOrders.filter(o => o.orderType === 'PICKUP').length;
    const takeawayCount = baseFilteredOrders.filter(o => o.orderType === 'TAKEAWAY').length;

    const emptyPayments = {
      cash: { amount: 0, count: 0, percent: 0 },
      upi: { amount: 0, count: 0, percent: 0 },
      card: { amount: 0, count: 0, percent: 0 },
      other: { amount: 0, count: 0, percent: 0 },
      unpaid: { amount: 0, count: 0 },
      totalCollected: 0
    };

    if (!isReady) {
      return {
        totalOrdersCount,
        totalRevenue,
        averageOrderValue,
        todayOrdersCount,
        todayRevenue,
        todayAvgOrder,
        todayDineInCount,
        todayPickupCount,
        todayTakeawayCount,
        highestOrderAmount: 0,
        highestOrderId: '',
        highestOrderKOT: 'None',
        lowestOrderAmount: 0,
        lowestOrderId: '',
        lowestOrderKOT: 'None',
        todayHighestAmount: 0,
        todayHighestId: '',
        todayHighestKOT: 'None',
        todayLowestAmount: 0,
        todayLowestId: '',
        todayLowestKOT: 'None',
        dineInCount,
        pickupCount,
        takeawayCount,
        paymentsAll: emptyPayments,
        paymentsToday: emptyPayments,
        itemFrequencyAll: [],
        itemFrequencyToday: []
      };
    }

    // Peak & Min for All-time
    let highestOrderAmount = -Infinity;
    let highestOrderId = '';
    let highestOrderKOT = 'None';
    let lowestOrderAmount = Infinity;
    let lowestOrderId = '';
    let lowestOrderKOT = 'None';

    if (baseFilteredOrders.length > 0) {
      baseFilteredOrders.forEach(o => {
        const amt = Number(o.totalAmount) || 0;
        if (amt > highestOrderAmount) {
          highestOrderAmount = amt;
          highestOrderId = o.id;
          highestOrderKOT = o.orderNumber ? `#${o.orderNumber}` : (o.kotNo ? `KOT #${o.kotNo}` : `#${o.id.slice(0, 5)}`);
        }
        if (amt < lowestOrderAmount) {
          lowestOrderAmount = amt;
          lowestOrderId = o.id;
          lowestOrderKOT = o.orderNumber ? `#${o.orderNumber}` : (o.kotNo ? `KOT #${o.kotNo}` : `#${o.id.slice(0, 5)}`);
        }
      });
    } else {
      highestOrderAmount = 0;
      lowestOrderAmount = 0;
    }

    // Peak & Min for Today
    let todayHighestAmount = -Infinity;
    let todayHighestId = '';
    let todayHighestKOT = 'None';
    let todayLowestAmount = Infinity;
    let todayLowestId = '';
    let todayLowestKOT = 'None';

    if (todayOrders.length > 0) {
      todayOrders.forEach(o => {
        const amt = Number(o.totalAmount) || 0;
        if (amt > todayHighestAmount) {
          todayHighestAmount = amt;
          todayHighestId = o.id;
          todayHighestKOT = o.orderNumber ? `#${o.orderNumber}` : (o.kotNo ? `KOT #${o.kotNo}` : `#${o.id.slice(0, 5)}`);
        }
        if (amt < todayLowestAmount) {
          todayLowestAmount = amt;
          todayLowestId = o.id;
          todayLowestKOT = o.orderNumber ? `#${o.orderNumber}` : (o.kotNo ? `KOT #${o.kotNo}` : `#${o.id.slice(0, 5)}`);
        }
      });
    } else {
      todayHighestAmount = 0;
      todayLowestAmount = 0;
    }

    // Payment collection breakdown calculation
    const calcPaymentBreakdown = (list: Order[]) => {
      let cashTotal = 0;
      let cashCount = 0;
      let upiTotal = 0;
      let upiCount = 0;
      let cardTotal = 0;
      let cardCount = 0;
      let otherTotal = 0;
      let otherCount = 0;
      let unpaidTotal = 0;
      let unpaidCount = 0;

      list.forEach(o => {
        const amt = Number(o.totalAmount) || 0;
        if (o.paymentStatus === 'UNPAID' && (!o.payments || o.payments.length === 0)) {
          unpaidTotal += amt;
          unpaidCount += 1;
          return;
        }

        if (o.payments && Array.isArray(o.payments) && o.payments.length > 0) {
          o.payments.forEach(p => {
            const m = String(p.method || 'CASH').toUpperCase();
            const pAmt = Number(p.amount) || 0;
            if (m === 'CASH') {
              cashTotal += pAmt;
              cashCount += 1;
            } else if (m === 'UPI') {
              upiTotal += pAmt;
              upiCount += 1;
            } else if (m === 'CARD') {
              cardTotal += pAmt;
              cardCount += 1;
            } else {
              otherTotal += pAmt;
              otherCount += 1;
            }
          });
        } else {
          const m = String(o.paymentMethod || 'CASH').toUpperCase();
          if (m === 'CASH') {
            cashTotal += amt;
            cashCount += 1;
          } else if (m === 'UPI') {
            upiTotal += amt;
            upiCount += 1;
          } else if (m === 'CARD') {
            cardTotal += amt;
            cardCount += 1;
          } else {
            otherTotal += amt;
            otherCount += 1;
          }
        }
      });

      const totalCollected = cashTotal + upiTotal + cardTotal + otherTotal;

      return {
        cash: { amount: cashTotal, count: cashCount, percent: totalCollected > 0 ? (cashTotal / totalCollected) * 100 : 0 },
        upi: { amount: upiTotal, count: upiCount, percent: totalCollected > 0 ? (upiTotal / totalCollected) * 100 : 0 },
        card: { amount: cardTotal, count: cardCount, percent: totalCollected > 0 ? (cardTotal / totalCollected) * 100 : 0 },
        other: { amount: otherTotal, count: otherCount, percent: totalCollected > 0 ? (otherTotal / totalCollected) * 100 : 0 },
        unpaid: { amount: unpaidTotal, count: unpaidCount },
        totalCollected
      };
    };

    // Item sales frequency calculation
    const calcItemFrequency = (list: Order[]) => {
      const map: Record<string, {
        itemName: string;
        variantName?: string;
        qty: number;
        orderCount: number;
        revenue: number;
      }> = {};

      list.forEach(o => {
        if (!o.items || !Array.isArray(o.items)) return;
        o.items.forEach(it => {
          const name = String(it.itemName || (it as any).name || 'Item').trim();
          const variant = it.variantName ? String(it.variantName).trim() : '';
          const key = variant ? `${name} (${variant})` : name;
          const q = Number(it.qty) || 1;
          const p = Number(it.price) || 0;

          if (!map[key]) {
            map[key] = {
              itemName: name,
              variantName: variant || undefined,
              qty: 0,
              orderCount: 0,
              revenue: 0,
            };
          }
          map[key].qty += q;
          map[key].orderCount += 1;
          map[key].revenue += q * p;
        });
      });

      return Object.values(map).sort((a, b) => b.qty - a.qty);
    };

    const paymentsAll = calcPaymentBreakdown(baseFilteredOrders);
    const paymentsToday = calcPaymentBreakdown(todayOrders);

    const itemFrequencyAll = calcItemFrequency(baseFilteredOrders);
    const itemFrequencyToday = calcItemFrequency(todayOrders);

    return {
      totalOrdersCount,
      totalRevenue,
      averageOrderValue,
      todayOrders,
      todayOrdersCount,
      todayRevenue,
      todayAvgOrder,
      todayDineInCount,
      todayPickupCount,
      todayTakeawayCount,
      highestOrderAmount: highestOrderAmount === -Infinity ? 0 : highestOrderAmount,
      highestOrderId,
      highestOrderKOT,
      lowestOrderAmount: lowestOrderAmount === Infinity ? 0 : lowestOrderAmount,
      lowestOrderId,
      lowestOrderKOT,
      todayHighestAmount: todayHighestAmount === -Infinity ? 0 : todayHighestAmount,
      todayHighestId,
      todayHighestKOT,
      todayLowestAmount: todayLowestAmount === Infinity ? 0 : todayLowestAmount,
      todayLowestId,
      todayLowestKOT,
      dineInCount,
      pickupCount,
      takeawayCount,
      paymentsAll,
      paymentsToday,
      itemFrequencyAll,
      itemFrequencyToday
    };
  }, [baseFilteredOrders, todayOrders, isReady]);

  // Reprint Bill handler
  const handleReprintBill = async (order: any) => {
    const isUsb = settings.printerType === 'USB';
    const mainTarget = isUsb ? (settings.printerName || 'POS-80') : settings.ipAddress?.trim();
    const targetPort = settings.port || 9100;
    if (!mainTarget) {
      toast.warning(
        isUsb ? 'Please select your USB Printer in Settings -> Thermal Printers first.' : 'Please enter your Billing Printer IP in Settings -> Thermal Printers first.',
        'Billing Printer Required'
      );
      return;
    }

    setIsReprinting(true);
    try {
      await printerService.connect(mainTarget, targetPort, isUsb ? 'USB' : 'LAN');
      const buffer = ESCPOSService.buildBill(
        order.orderNumber || order.kotNo || order.id.slice(0, 6),
        order.tableNo || 0,
        order.captainName || 'Staff',
        order.items || [],
        branding || null,
        order.orderType || (order.tableNo ? 'DINE_IN' : 'PICKUP'),
        order.payments && order.payments.length > 0
          ? order.payments
          : [{ method: order.paymentMethod || 'CASH', amount: order.totalAmount || 0 }]
      );
      await printerService.print(buffer);
      await printerService.disconnect();
      setToastMessage(`Receipt for Bill #${order.orderNumber || order.kotNo || order.id.slice(0, 6)} reprinted!`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (e: any) {
      toast.error(`Could not connect to billing printer at ${mainTarget}: ${e.message}`, 'Printer Error');
    } finally {
      setIsReprinting(false);
    }
  };

  // Reprint Kitchen KOT handler
  const handleReprintKitchenKOT = async (order: any) => {
    const isKitchenUsb = settings.kitchenPrinterType === 'USB';
    const kitchenTarget = isKitchenUsb
      ? (settings.kitchenPrinterName || settings.printerName || 'POS-80')
      : (settings.kitchenIpAddress?.trim() || (settings.printerType === 'LAN' ? settings.ipAddress?.trim() : ''));
    const kitchenPort = settings.kitchenPort || settings.port || 9100;
    const kitchenType = isKitchenUsb ? 'USB' : 'LAN';

    if (!kitchenTarget) {
      toast.warning('Please configure Kitchen Printer in Settings first.', 'Kitchen Printer Required');
      return;
    }

    setIsReprintingKitchen(true);
    try {
      await printerService.connect(kitchenTarget, kitchenPort, kitchenType);
      const buffer = ESCPOSService.buildKOT(
        order.kotNo || `RE-${order.id.slice(0, 5)}`,
        order.tableNo || 0,
        order.captainName || 'Staff',
        order.items || [],
        'DUPLICATE / REPRINT KOT',
        order.orderType || (order.tableNo ? 'DINE_IN' : 'PICKUP')
      );
      await printerService.print(
        buffer,
        isKitchenUsb
          ? { printerType: 'USB', printerName: kitchenTarget }
          : { printerType: 'LAN', ip: kitchenTarget, port: kitchenPort }
      );
      await printerService.disconnect();
      setToastMessage(`Kitchen KOT reprinted successfully!`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (e: any) {
      toast.error(`Failed to print KOT: ${e.message}`, 'Kitchen Printer Error');
    } finally {
      setIsReprintingKitchen(false);
    }
  };

  // Delete Order handler (Admin / Manager only)
  const handleDeleteOrder = (id: string, kotNo: number | string) => {
    Alert.alert(
      'Delete Order',
      `Are you sure you want to delete Order #${kotNo}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await DBServices.deleteOrder(id, tenant?.id, activeLocationId || undefined);
              setSelectedOrder(null);
              setToastMessage('Order deleted successfully');
              setTimeout(() => setToastMessage(null), 3000);
            } catch (e: any) {
              toast.error(`Could not delete order: ${e.message}`, 'Delete Error');
            }
          }
        }
      ]
    );
  };

  const formatOrderDate = (createdAt: any) => {
    if (!createdAt) return 'Just now';
    const date = typeof createdAt.toDate === 'function'
      ? createdAt.toDate()
      : new Date(createdAt.seconds ? createdAt.seconds * 1000 : createdAt);

    if (isNaN(date.getTime())) return 'Just now';

    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };


  const listHeader = useMemo(() => (
    <OrdersSummaryDashboard
      timeScope={timeScope}
      setTimeScope={setTimeScope}
      isSummaryExpanded={isSummaryExpanded}
      setIsSummaryExpanded={setIsSummaryExpanded}
      summaryTab={summaryTab}
      setSummaryTab={setSummaryTab}
      stats={stats}
      isPaymentsEnabled={isPaymentsEnabled}
      onOpenItemFrequencyModal={() => setItemFrequencyModalOpen(true)}
    />
  ), [timeScope, isSummaryExpanded, summaryTab, stats, isPaymentsEnabled]);

  const renderOrderItem = useCallback(({ item }: any) => {
    const activeHighestId = timeScope === 'TODAY' ? stats.todayHighestId : stats.highestOrderId;
    const activeLowestId = timeScope === 'TODAY' ? stats.todayLowestId : stats.lowestOrderId;
    const isHighest = filteredOrders.length > 1 && item.id === activeHighestId;
    const isLowest = filteredOrders.length > 1 && item.id === activeLowestId && activeHighestId !== activeLowestId;

    return (
      <OrderCard
        item={item}
        ordersGridColumns={ordersGridColumns}
        isHighest={isHighest}
        isLowest={isLowest}
        onPress={setSelectedOrder}
      />
    );
  }, [timeScope, stats.todayHighestId, stats.highestOrderId, stats.todayLowestId, stats.lowestOrderId, filteredOrders.length, ordersGridColumns]);

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Orders History"
        subtitle={`${filteredOrders.length} ${timeScope === 'TODAY' ? "Today's" : 'Total'} Orders`}
        rightElement={
          <TouchableOpacity
            onPress={() => setDownloadModalOpen(true)}
            className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center active:bg-emerald-700 shadow-md shadow-emerald-600/30"
          >
            <FileSpreadsheet size={15} color="white" />
            <Text className="text-white font-bold text-xs ml-1.5">Download Summary</Text>
          </TouchableOpacity>
        }
      />

      {/* Floating Success Toast */}
      {toastMessage && (
        <View className="absolute top-16 left-6 right-6 z-50 bg-emerald-500 p-3.5 rounded-2xl shadow-xl flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <CheckCircle2 size={18} color="white" />
            <Text className="text-white font-bold text-xs ml-2">{toastMessage}</Text>
          </View>
          <TouchableOpacity onPress={() => setToastMessage(null)}>
            <X size={16} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Top Filter & Search Bar */}
      <View className="bg-slate-900 border-b border-slate-800 px-4 py-3 gap-2.5">
        {/* Branch Selector Pill if Multi-Branch */}
        {locations.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingBottom: 2 }}>
            <TouchableOpacity
              onPress={() => setSelectedLocationId('ALL')}
              className={`px-3 py-1 rounded-full border ${selectedLocationId === 'ALL'
                ? 'bg-[#5D3FD3] border-purple-500'
                : 'bg-slate-800 border-slate-700'
                }`}
            >
              <Text className={`text-xs font-bold ${selectedLocationId === 'ALL' ? 'text-white' : 'text-slate-400'}`}>
                All Branches
              </Text>
            </TouchableOpacity>

            {locations.map(loc => (
              <TouchableOpacity
                key={loc.id}
                onPress={() => setSelectedLocationId(loc.id)}
                className={`px-3 py-1 rounded-full border ${selectedLocationId === loc.id
                  ? 'bg-[#5D3FD3] border-purple-500'
                  : 'bg-slate-800 border-slate-700'
                  }`}
              >
                <Text className={`text-xs font-bold ${selectedLocationId === loc.id ? 'text-white' : 'text-slate-400'}`}>
                  {loc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Full-Width Search Input */}
        <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2.5">
          <Search size={16} color="#94A3B8" />
          <TextInput
            placeholder="Search by Bill #, KOT #, Table, Item, or Cashier..."
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-white text-xs ml-2 py-0"
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={15} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Unified Filters: Time Scope & Order Types (Horizontal Scroll) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Synchronized Date Scope Toggle (Today vs All Orders) */}
          <View className="flex-row bg-slate-950 p-0.5 rounded-full border border-slate-800">
            <TouchableOpacity
              onPress={() => setTimeScope('TODAY')}
              className={`px-3 py-1.5 rounded-full flex-row items-center ${timeScope === 'TODAY' ? 'bg-emerald-600 border border-emerald-500' : 'bg-transparent'
                }`}
            >
              <Clock size={12} color={timeScope === 'TODAY' ? '#FFFFFF' : '#34D399'} />
              <Text className={`text-xs font-black ml-1.5 ${timeScope === 'TODAY' ? 'text-white' : 'text-slate-300'
                }`}>
                Today
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setTimeScope('ALL')}
              className={`px-3 py-1.5 rounded-full flex-row items-center ${timeScope === 'ALL' ? 'bg-[#5D3FD3] border border-purple-500' : 'bg-transparent'
                }`}
            >
              <Receipt size={12} color={timeScope === 'ALL' ? '#FFFFFF' : '#A78BFA'} />
              <Text className={`text-xs font-black ml-1.5 ${timeScope === 'ALL' ? 'text-white' : 'text-slate-400'
                }`}>
                All Orders
              </Text>
            </TouchableOpacity>
          </View>

          {/* Vertical Separator */}
          <View className="h-5 w-[1px] bg-slate-800 mx-0.5" />

          {/* Order Type Filter: All Types, Dine In, Pick Up, Takeaway */}
          {(['ALL', 'DINE_IN', 'PICKUP', 'TAKEAWAY'] as const).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setSelectedOrderTypeFilter(f)}
              className={`px-3.5 py-1.5 rounded-full border ${selectedOrderTypeFilter === f
                ? 'bg-slate-800 border-slate-600'
                : 'bg-slate-950 border-slate-800'
                }`}
            >
              <Text className={`text-xs font-bold ${selectedOrderTypeFilter === f ? 'text-white' : 'text-slate-400'
                }`}>
                {f === 'ALL' ? 'All Types' : f === 'DINE_IN' ? 'Dine In' : f === 'PICKUP' ? 'Pick Up' : 'Takeaway'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Orders List with Analytics Header */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#5D3FD3" />
          <Text className="text-slate-400 text-xs font-medium mt-3">Loading orders history...</Text>
        </View>
      ) : (
        <FlatList
          key={ordersGridColumns}
          data={filteredOrders}
          numColumns={ordersGridColumns}
          keyExtractor={(item) => item.id}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={50}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: Math.max(insets.bottom + 36, 52),
            maxWidth: 1600,
            alignSelf: 'center',
            width: '100%'
          }}          ListHeaderComponent={listHeader}
          renderItem={renderOrderItem}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Receipt size={48} color="#475569" />
              <Text className="text-slate-400 font-bold text-sm mt-3">No orders found</Text>
              <Text className="text-slate-500 text-xs mt-1">Try searching a different bill number or table</Text>
            </View>
          }
        />
      )}

      {/* FULL KOTAPP-STYLE ORDER DETAILS MODAL WITH REPRINT */}
      {selectedOrder && (
        <Modal
          visible={!!selectedOrder}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedOrder(null)}
        >
          <SafeAreaView className="flex-1 bg-[#0B1120]">
            {/* Modal Header matching KOTApp */}
            <View className="flex-row items-center justify-between px-4 py-4 bg-slate-900 border-b border-slate-800 shadow-sm">
              <View className="flex-row items-center">
                <TouchableOpacity
                  onPress={() => setSelectedOrder(null)}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  className="p-2 bg-slate-800 rounded-full"
                >
                  <ArrowLeft size={20} color="white" />
                </TouchableOpacity>
                <Text className="text-lg font-black ml-3 text-white">Order Details</Text>
              </View>

              <View className="flex-row items-center gap-2">
                <View className={`px-3 py-1 rounded-full ${selectedOrder.orderType === 'PICKUP' ? 'bg-purple-500/20 border border-purple-500/40' : 'bg-blue-500/20 border border-blue-500/40'}`}>
                  <Text className={`text-xs font-bold ${selectedOrder.orderType === 'PICKUP' ? 'text-purple-300' : 'text-blue-300'}`}>
                    {selectedOrder.orderType === 'PICKUP' ? 'Pick Up' : (selectedOrder.tableNo ? `Table ${selectedOrder.tableNo}` : 'Takeaway')}
                  </Text>
                </View>

                {isClientAdmin && (
                  <TouchableOpacity
                    onPress={() => handleDeleteOrder(selectedOrder.id, selectedOrder.kotNo || selectedOrder.orderNumber || '0')}
                    className="p-2 bg-red-500/20 border border-red-500/30 rounded-full ml-1"
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                  >
                    <Trash2 size={18} color="#F87171" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView className="flex-1 px-4 py-4" contentContainerStyle={{ paddingBottom: 60 }}>
              {/* Top & Least Order Callout Banners in Modal */}
              {selectedOrder.id === stats.highestOrderId && filteredOrders.length > 1 && (
                <View className="bg-emerald-500/15 border-2 border-emerald-500/40 p-3.5 rounded-2xl mb-4 flex-row items-center">
                  <TrendingUp size={20} color="#34D399" />
                  <View className="ml-3 flex-1">
                    <Text className="text-emerald-300 font-black text-xs uppercase tracking-wide">🟢 TOP ORDER (PEAK SALE)</Text>
                    <Text className="text-emerald-400/80 text-[11px] mt-0.5">
                      Highest-value bill in this view (₹${Number(selectedOrder.totalAmount || 0).toFixed(2)})
                    </Text>
                  </View>
                </View>
              )}
              {selectedOrder.id === stats.lowestOrderId && filteredOrders.length > 1 && stats.highestOrderId !== stats.lowestOrderId && (
                <View className="bg-rose-500/15 border-2 border-rose-500/40 p-3.5 rounded-2xl mb-4 flex-row items-center">
                  <TrendingDown size={20} color="#F43F5E" />
                  <View className="ml-3 flex-1">
                    <Text className="text-rose-300 font-black text-xs uppercase tracking-wide">🔴 LEAST ORDER (MIN SALE)</Text>
                    <Text className="text-rose-400/80 text-[11px] mt-0.5">
                      Lowest-value bill in this view (₹${Number(selectedOrder.totalAmount || 0).toFixed(2)})
                    </Text>
                  </View>
                </View>
              )}

              {/* Order Info Card */}
              <View className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-sm mb-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xl font-black text-white">
                    {selectedOrder.orderNumber ? `Bill #${selectedOrder.orderNumber}` : (selectedOrder.kotNo ? `KOT #${selectedOrder.kotNo}` : `Order #${selectedOrder.id.slice(0, 6)}`)}
                  </Text>
                  <Text className="text-xs text-slate-400 font-medium">{formatOrderDate(selectedOrder.createdAt)}</Text>
                </View>
                <View className="flex-row items-center border-t border-slate-800 pt-3 mt-1 justify-between flex-wrap gap-2">
                  <View className="flex-row items-center flex-1 min-w-[140px] mr-2">
                    <Text className="text-xs text-slate-400 font-medium shrink-0">Staff:</Text>
                    <Text className="text-xs font-bold text-white ml-1.5 flex-1" numberOfLines={1}>
                      {selectedOrder.captainName || 'Staff'}
                    </Text>
                  </View>
                  <View className="flex-row items-center shrink-0">
                    <Text className="text-xs text-slate-400 font-medium">Status:</Text>
                    <View className="ml-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                      <Text className="text-xs font-black text-emerald-400 uppercase">
                        {selectedOrder.status || 'COMPLETED'}
                      </Text>
                    </View>
                  </View>
                </View>
                {selectedOrder.locationName && (
                  <View className="flex-row items-center pt-2">
                    <Text className="text-xs text-slate-400">Branch:</Text>
                    <Text className="text-xs font-bold text-indigo-300 ml-1.5">{selectedOrder.locationName}</Text>
                  </View>
                )}
              </View>

              {/* Items Card */}
              <View className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-sm mb-4">
                <Text className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-3">Items List</Text>
                {(selectedOrder.items || []).map((item: any, idx: number) => (
                  <View key={idx} className="flex-row justify-between items-start py-3 border-b border-slate-800 last:border-b-0">
                    <View className="flex-1 mr-4">
                      <Text className="text-white text-sm font-bold">
                        <Text className="text-purple-400 font-black">{item.qty || 1}x</Text> {item.itemName || item.name}
                      </Text>
                      {item.variantName && (
                        <Text className="text-xs text-indigo-300 mt-0.5">Variant: {item.variantName}</Text>
                      )}
                      {item.note && (
                        <Text className="text-amber-400/80 text-[11px] mt-0.5 italic">Note: {item.note}</Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text className="text-white font-bold text-sm">₹{Number((item.price || 0) * (item.qty || 1)).toFixed(2)}</Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">₹{Number(item.price || 0).toFixed(2)} each</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Special Notes Card */}
              {selectedOrder.specialNote ? (
                <View className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-3xl mb-4">
                  <Text className="text-[10px] text-amber-300 font-black uppercase tracking-wider mb-1">Special Instruction</Text>
                  <Text className="text-xs text-amber-200 font-medium">{selectedOrder.specialNote}</Text>
                </View>
              ) : null}

              {/* Bill Financials Card */}
              <View className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-sm mb-4">
                <Text className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-3">Receipt Invoice</Text>

                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-slate-400 text-xs">Total Quantity</Text>
                  <Text className="text-white text-xs font-bold">
                    {(selectedOrder.items || []).reduce((s: number, i: any) => s + (i.qty || 1), 0)} items
                  </Text>
                </View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-slate-400 text-xs">Subtotal</Text>
                  <Text className="text-slate-300 text-xs font-semibold">₹{((selectedOrder.totalAmount || 0) / 1.05).toFixed(2)}</Text>
                </View>
                <View className="flex-row justify-between items-center mb-3 pb-3 border-b border-slate-800">
                  <Text className="text-slate-400 text-xs">Taxes (CGST + SGST)</Text>
                  <Text className="text-purple-300 text-xs font-semibold">₹{((selectedOrder.totalAmount || 0) - ((selectedOrder.totalAmount || 0) / 1.05)).toFixed(2)}</Text>
                </View>

                <View className="flex-row justify-between items-center">
                  <Text className="text-white text-base font-bold">Total Paid</Text>
                  <Text className="text-emerald-400 text-2xl font-black">₹{Number(selectedOrder.totalAmount || 0).toFixed(2)}</Text>
                </View>

                {/* Payment breakdown */}
                {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                  <View className="mt-3 pt-3 border-t border-slate-800">
                    <Text className="text-slate-400 text-[10px] font-bold uppercase mb-2">Settlement Breakdown:</Text>
                    {selectedOrder.payments.map((p: any, idx: number) => (
                      <View key={idx} className="flex-row justify-between py-1">
                        <Text className="text-slate-300 text-xs">{p.method}</Text>
                        <Text className="text-emerald-400 text-xs font-bold">₹{Number(p.amount).toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Thermal Reprint Action Buttons */}
              <View className="gap-3 mt-2">
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => handleReprintBill(selectedOrder)}
                    disabled={isReprinting}
                    className="flex-1 bg-emerald-600 py-4 rounded-2xl flex-row items-center justify-center active:opacity-80 shadow-lg shadow-emerald-600/30"
                  >
                    {isReprinting ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <View className="flex-row items-center justify-center">
                        <Printer size={18} color="white" />
                        <Text className="text-white font-black text-sm ml-2">Reprint Bill Receipt</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleReprintKitchenKOT(selectedOrder)}
                    disabled={isReprintingKitchen}
                    className="flex-1 bg-amber-600/20 border border-amber-500/40 py-4 rounded-2xl flex-row items-center justify-center active:opacity-80"
                  >
                    {isReprintingKitchen ? (
                      <ActivityIndicator size="small" color="#F59E0B" />
                    ) : (
                      <View className="flex-row items-center justify-center">
                        <Utensils size={18} color="#FBBF24" />
                        <Text className="text-amber-300 font-black text-sm ml-2">Reprint KOT</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedOrder(null)}
                  className="bg-slate-800 py-3 rounded-2xl items-center"
                >
                  <Text className="text-slate-400 font-bold text-xs">Close Details</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}

      {/* Vasudha Order Summary Excel Download Modal */}
      {isDownloadModalOpen && (
        <OrderSummaryDownloadModal
        isVisible={isDownloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        orders={orders}
        tenantName={tenant?.businessName || tenant?.displayName || 'Vasudha Restaurant'}
        locationName={locations.find(l => l.id === selectedLocationId)?.name || 'All Branches'}
      />
      )}

      {/* Item Sales Frequency & Quantity Breakdown Modal */}
      {isItemFrequencyModalOpen && (
        <Modal
          visible={isItemFrequencyModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setItemFrequencyModalOpen(false)}
        >
          <View className="flex-1 bg-black/80 items-center justify-center p-3 sm:p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl">
              {/* Modal Header */}
              <View className="p-4 sm:p-5 border-b border-slate-800 flex-row items-center justify-between bg-slate-950/70">
                <View className="flex-row items-center flex-1 mr-2">
                  <View className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 items-center justify-center mr-3 shrink-0">
                    <Utensils size={20} color="#818CF8" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-black text-base" numberOfLines={1}>Item Sales Frequency</Text>
                    <Text className="text-slate-400 text-xs" numberOfLines={1}>
                      {timeScope === 'TODAY' ? "Today's Sold Quantities & Rankings" : "All-Time Sold Quantities & Rankings"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setItemFrequencyModalOpen(false)}
                  className="p-2 rounded-xl bg-slate-800 active:bg-slate-700"
                >
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Scope Switcher & Search Bar */}
              <View className="p-3.5 sm:p-4 border-b border-slate-800/80 gap-2.5 bg-slate-950/40">
                <View className="flex-row items-center justify-between flex-wrap gap-2">
                  <View className="flex-row bg-slate-950 p-0.5 rounded-xl border border-slate-800">
                    <TouchableOpacity
                      onPress={() => setTimeScope('TODAY')}
                      className={`px-3 py-1 rounded-lg flex-row items-center ${timeScope === 'TODAY' ? 'bg-emerald-600' : 'bg-transparent'
                        }`}
                    >
                      <Clock size={11} color={timeScope === 'TODAY' ? '#FFFFFF' : '#94A3B8'} />
                      <Text className={`text-xs font-black ml-1.5 ${timeScope === 'TODAY' ? 'text-white' : 'text-slate-400'
                        }`}>
                        Today ({stats.itemFrequencyToday.length})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setTimeScope('ALL')}
                      className={`px-3 py-1 rounded-lg flex-row items-center ${timeScope === 'ALL' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                        }`}
                    >
                      <Receipt size={11} color={timeScope === 'ALL' ? '#FFFFFF' : '#94A3B8'} />
                      <Text className={`text-xs font-black ml-1.5 ${timeScope === 'ALL' ? 'text-white' : 'text-slate-400'
                        }`}>
                        All-Time ({stats.itemFrequencyAll.length})
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text className="text-slate-400 text-xs font-bold">
                    {(timeScope === 'TODAY' ? stats.itemFrequencyToday : stats.itemFrequencyAll).reduce((sum, it) => sum + it.qty, 0)} portions sold
                  </Text>
                </View>

                {/* Search Bar */}
                <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <Search size={14} color="#94A3B8" />
                  <TextInput
                    placeholder="Search sold dishes or sizes..."
                    placeholderTextColor="#64748B"
                    value={itemSearchQuery}
                    onChangeText={setItemSearchQuery}
                    className="flex-1 text-white text-xs ml-2 py-0"
                    autoCorrect={false}
                  />
                  {itemSearchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setItemSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <X size={14} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Items List */}
              <ScrollView className="p-3.5 sm:p-4 max-h-[420px]" showsVerticalScrollIndicator={false}>
                {(() => {
                  const currentScopeItems = timeScope === 'TODAY' ? stats.itemFrequencyToday : stats.itemFrequencyAll;
                  const filtered = currentScopeItems.filter(it => {
                    const q = itemSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return it.itemName.toLowerCase().includes(q) || (it.variantName && it.variantName.toLowerCase().includes(q));
                  });

                  if (filtered.length === 0) {
                    return (
                      <View className="py-12 items-center">
                        <Utensils size={36} color="#475569" />
                        <Text className="text-slate-400 font-bold text-xs mt-2">No matching dishes sold</Text>
                        <Text className="text-slate-500 text-[11px] mt-0.5">Try a different search term or change scope</Text>
                      </View>
                    );
                  }

                  const maxQ = currentScopeItems[0]?.qty || 1;

                  return (
                    <View className="gap-2 pb-6">
                      {filtered.map((it, idx) => {
                        const rank = currentScopeItems.findIndex(x => x.itemName === it.itemName && x.variantName === it.variantName) + 1;
                        const wPct = Math.max(5, Math.min(100, (it.qty / maxQ) * 100));

                        return (
                          <View
                            key={`${it.itemName}-${it.variantName || ''}-${idx}`}
                            className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-2xl relative overflow-hidden"
                          >
                            <View
                              style={{ width: `${wPct}%` }}
                              className="absolute left-0 top-0 bottom-0 bg-indigo-500/10 rounded-2xl"
                            />
                            <View className="flex-row items-center justify-between relative z-10">
                              <View className="flex-row items-center flex-1 mr-3">
                                <View className={`w-6 h-6 rounded-full items-center justify-center mr-2.5 shrink-0 ${rank === 1 ? 'bg-amber-500/25 border border-amber-500/50' :
                                  rank === 2 ? 'bg-slate-400/25 border border-slate-400/50' :
                                    rank === 3 ? 'bg-amber-700/25 border border-amber-700/50' :
                                      'bg-slate-800'
                                  }`}>
                                  <Text className={`text-xs font-black ${rank === 1 ? 'text-amber-400' :
                                    rank === 2 ? 'text-slate-300' :
                                      rank === 3 ? 'text-amber-500' :
                                        'text-slate-400'
                                    }`}>
                                    #{rank}
                                  </Text>
                                </View>

                                <View className="flex-1">
                                  <Text className="text-white text-xs font-bold" numberOfLines={1}>{it.itemName}</Text>
                                  <Text className="text-slate-400 text-[10px] mt-0.5">
                                    {it.variantName ? `${it.variantName} · ` : ''}In {it.orderCount} orders
                                  </Text>
                                </View>
                              </View>

                              <View className="items-end shrink-0">
                                <View className="bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg">
                                  <Text className="text-emerald-300 font-black text-xs">x{it.qty} sold</Text>
                                </View>
                                <Text className="text-slate-300 text-[11px] font-bold mt-0.5">
                                  ₹{it.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </ScrollView>

              {/* Modal Footer */}
              <View className="p-3.5 border-t border-slate-800 bg-slate-950/80 flex-row justify-end">
                <TouchableOpacity
                  onPress={() => setItemFrequencyModalOpen(false)}
                  className="px-5 py-2 rounded-xl bg-slate-800 active:bg-slate-700"
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
