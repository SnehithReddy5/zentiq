import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  Building,
  LayoutGrid,
  MapPin,
  Menu as MenuIcon,
  Moon,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  X,
  Zap,
} from 'lucide-react-native';
import { HamburgerMenu } from '../../components/common/HamburgerMenu';
import { Routes } from '../../constants/routes';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  printTableBillAction,
  resolveActivePaymentMethods,
  resolveTableOrderContext,
  settleTableOrderAction,
  TableOrderContext,
  TableVisualState,
} from '../../services/orders/tableActions.service';
import { DBServices } from '../../services/firebase/db';
import { useAuthStore } from '../../store/auth.store';
import { useCartStore } from '../../store/cart.store';
import { useOrderStore } from '../../store/order.store';
import { usePrinterStore } from '../../store/printer.store';
import { useTableStore } from '../../store/table.store';
import { useTenantStore } from '../../store/tenant.store';
import { useThemeStore } from '../../store/theme.store';
import { Table } from '../../types/table.types';
import { confirmDialog } from '../../utils/confirm';
import { toast } from '../../utils/toast';
import { QuickSettleModal } from './components/QuickSettleModal';
import { TableTile } from './components/TableTile';
import { TableQrDownloadModal } from './TableQrDownloadModal';

type FilterStatus = 'ALL' | TableVisualState;

type FlatGridItem =
  | { type: 'SECTION_HEADER'; key: string; section: string; total: number; occupied: number }
  | { type: 'ROW'; key: string; items: Table[] };

const SECTION_PRESETS = ['Main Floor', 'A/C', 'Non A/C', 'Family', 'Outdoor', 'Bar'];
const CAPACITY_PRESETS = [2, 4, 6, 8];

export const TablesScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { tables, isLoading, subscribeToTables } = useTableStore();
  const carts = useCartStore(state => state.carts);
  const { tenant, branding, features, locations, activeLocationId, setActiveLocationId } = useTenantStore();
  const { user } = useAuthStore();
  const { orders, subscribeToOrders } = useOrderStore();
  const { settings } = usePrinterStore();
  const { tableGridColumns, isLargePOS } = useResponsiveLayout();
  const { themeMode, toggleTheme } = useThemeStore();
  const isDark = themeMode === 'dark';

  const userAssigned = user?.assignedLocationId;
  const hasMultiBranchAccess =
    (user?.role === 'ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'PLATFORM_ADMIN') &&
    (!userAssigned || (user?.locationIds && user.locationIds.includes('*')));

  const paymentsEnabled = features.paymentsEnabled !== false;
  const pickupEnabled = features.pickupEnabled !== false;
  const activeMethods = useMemo(() => resolveActivePaymentMethods(features), [features]);

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
  const [billSearchQuery, setBillSearchQuery] = useState('');

  const [busyPrintTableNo, setBusyPrintTableNo] = useState<number | null>(null);
  const [busySettleTableNo, setBusySettleTableNo] = useState<number | null>(null);
  const [settleTarget, setSettleTarget] = useState<{ table: Table; ctx: TableOrderContext } | null>(null);

  // Table metadata edit modal state (Section / Capacity)
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [editSectionText, setEditSectionText] = useState('Main Floor');
  const [editCapacity, setEditCapacity] = useState<number>(4);
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  useEffect(() => {
    const unsubTables = subscribeToTables();
    const unsubOrders = subscribeToOrders(activeLocationId);
    return () => {
      unsubTables();
      unsubOrders();
    };
  }, [tenant?.id, activeLocationId]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    const unsubTables = subscribeToTables();
    const unsubOrders = subscribeToOrders(activeLocationId);
    setTimeout(() => setIsRefreshing(false), 450);
    return () => {
      unsubTables();
      unsubOrders();
    };
  }, [subscribeToTables, subscribeToOrders, activeLocationId]);

  // Index running orders by table number for O(1) lookup
  const runningOrderMap = useMemo(() => {
    const map: Record<number, any> = {};
    orders.forEach(o => {
      const isRunning = o.status === 'RUNNING' || o.status === 'running';
      if (isRunning && o.tableNo !== undefined && o.tableNo !== null) {
        map[Number(o.tableNo)] = o;
      }
    });
    return map;
  }, [orders]);

  // Resolve visual & billing context per table once cleanly
  const tableContextMap = useMemo(() => {
    const map: Record<string, TableOrderContext> = {};
    tables.forEach(t => {
      const key = t.id || String(t.tableNo);
      map[key] = resolveTableOrderContext(
        t,
        carts[t.tableNo],
        runningOrderMap[Number(t.tableNo)] || null,
        features
      );
    });
    return map;
  }, [tables, carts, runningOrderMap, features]);

  // Unique floor sections discovered dynamically
  const availableSections = useMemo(() => {
    const set = new Set<string>();
    tables.forEach(t => set.add(t.section?.trim() || 'Main Floor'));
    return Array.from(set);
  }, [tables]);

  // Status summary counters for Legend bar
  const counts = useMemo(() => {
    const tally = {
      ALL: tables.length,
      BLANK: 0,
      RUNNING: 0,
      RUNNING_KOT: 0,
      PRINTED: 0,
      BILL_REQ: 0,
    };
    tables.forEach(t => {
      const ctx = tableContextMap[t.id || String(t.tableNo)];
      if (ctx) {
        tally[ctx.visualState] += 1;
      }
    });
    return tally;
  }, [tables, tableContextMap]);

  // Filtered + search-matched tables
  const filteredTables = useMemo(() => {
    const q = billSearchQuery.trim().toLowerCase();
    return [...tables]
      .sort((a, b) => Number(a.tableNo) - Number(b.tableNo))
      .filter(t => {
        const sec = t.section?.trim() || 'Main Floor';
        if (selectedSection !== 'ALL' && sec !== selectedSection) return false;

        const ctx = tableContextMap[t.id || String(t.tableNo)];
        if (statusFilter !== 'ALL' && ctx?.visualState !== statusFilter) return false;

        if (q) {
          const tableMatch = String(t.tableNo).includes(q) || `table ${t.tableNo}`.includes(q);
          const billMatch = ctx?.billNo ? String(ctx.billNo).includes(q) : false;
          const waiterMatch = ctx?.waiterName ? ctx.waiterName.toLowerCase().includes(q) : false;
          return tableMatch || billMatch || waiterMatch;
        }
        return true;
      });
  }, [tables, selectedSection, statusFilter, billSearchQuery, tableContextMap]);

  // Group into section headers + fixed multi-column rows for fast Android FlatList virtualization
  const gridRows = useMemo<FlatGridItem[]>(() => {
    const grouped: Record<string, Table[]> = {};
    filteredTables.forEach(t => {
      const sec = t.section?.trim() || 'Main Floor';
      if (!grouped[sec]) grouped[sec] = [];
      grouped[sec].push(t);
    });

    const items: FlatGridItem[] = [];
    const cols = Math.max(2, tableGridColumns);

    Object.entries(grouped).forEach(([section, list]) => {
      const occupiedInSection = list.filter(t => tableContextMap[t.id || String(t.tableNo)]?.isOccupied).length;
      items.push({
        type: 'SECTION_HEADER',
        key: `sec-${section}`,
        section,
        total: list.length,
        occupied: occupiedInSection,
      });

      for (let i = 0; i < list.length; i += cols) {
        items.push({
          type: 'ROW',
          key: `row-${section}-${i}`,
          items: list.slice(i, i + cols),
        });
      }
    });

    return items;
  }, [filteredTables, tableGridColumns, tableContextMap]);

  const handleBillSearchSubmit = () => {
    const q = billSearchQuery.trim();
    if (!q) return;
    const matchByBill = tables.find(t => {
      const ctx = tableContextMap[t.id || String(t.tableNo)];
      return ctx?.billNo && String(ctx.billNo) === q;
    });
    if (matchByBill) {
      navigation.navigate(Routes.CART, { tableNo: matchByBill.tableNo, orderType: 'DINE_IN' });
      return;
    }
    const matchByTable = tables.find(t => String(t.tableNo) === q);
    if (matchByTable) {
      handleTablePress(matchByTable);
      return;
    }
    navigation.navigate(Routes.ORDERS);
  };

  const handleAddTable = async () => {
    setIsAdding(true);
    try {
      const nextNo = tables.length > 0 ? Math.max(...tables.map(t => Number(t.tableNo) || 0)) + 1 : 1;
      const targetSection = selectedSection !== 'ALL' ? selectedSection : 'Main Floor';
      await DBServices.addTable(nextNo, tenant?.id, activeLocationId || undefined, targetSection, 4);
      toast.success(`Table ${nextNo} added to ${targetSection}`, 'Table Added');
    } catch (e: any) {
      toast.error(e.message, 'Error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteTable = useCallback((item: Table) => {
    const hasItems = carts[item.tableNo] && carts[item.tableNo].length > 0;
    confirmDialog({
      title: 'Delete Table',
      message: `Are you sure you want to delete Table ${item.tableNo}?${hasItems ? ' Note: This table has active items in cart.' : ''}`,
      confirmText: 'Delete Table',
      destructive: true,
      onConfirm: async () => {
        try {
          await DBServices.deleteTable(item.id, tenant?.id, activeLocationId || undefined);
        } catch (err: any) {
          toast.error(err.message, 'Failed');
        }
      },
    });
  }, [carts, tenant?.id, activeLocationId]);

  const handleTablePress = useCallback((item: Table) => {
    navigation.navigate(Routes.MENU, {
      tableId: item.id,
      tableNo: item.tableNo,
      orderType: 'DINE_IN',
    });
  }, [navigation]);

  const handleViewTable = useCallback((item: Table) => {
    navigation.navigate(Routes.CART, {
      tableNo: item.tableNo,
      orderType: 'DINE_IN',
    });
  }, [navigation]);

  const handleInlinePrint = useCallback(async (item: Table, ctx: TableOrderContext) => {
    if (busyPrintTableNo !== null) return;
    setBusyPrintTableNo(item.tableNo);
    try {
      await printTableBillAction({
        tableNo: item.tableNo,
        orderType: 'DINE_IN',
        cartItems: ctx.items,
        printedBillNo: ctx.billNo,
        existingRunningOrder: ctx.runningOrder,
        settings,
        branding,
        features,
        tenantId: tenant?.id,
        locationId: activeLocationId,
        staffName: user?.name || 'Staff',
      });
    } finally {
      setBusyPrintTableNo(null);
    }
  }, [busyPrintTableNo, settings, branding, features, tenant?.id, activeLocationId, user?.name]);

  const executeInlineSettle = useCallback(async (
    table: Table,
    ctx: TableOrderContext,
    method: string,
    shouldPrint: boolean
  ) => {
    setBusySettleTableNo(table.tableNo);
    try {
      const res = await settleTableOrderAction({
        tableNo: table.tableNo,
        orderType: 'DINE_IN',
        cartItems: ctx.items,
        finalPayments: [{ method, amount: ctx.displayAmount }],
        shouldPrint,
        printedBillNo: ctx.billNo,
        existingRunningOrder: ctx.runningOrder,
        user,
        tenantId: tenant?.id,
        locationId: activeLocationId,
        locations,
        settings,
        branding,
        features,
      });
      if (res.success) {
        setSettleTarget(null);
      }
    } finally {
      setBusySettleTableNo(null);
    }
  }, [user, tenant?.id, activeLocationId, locations, settings, branding, features]);

  const handleInlineSavePress = useCallback((item: Table, ctx: TableOrderContext) => {
    if (user?.role === 'WAITER' || user?.role === 'captain') {
      toast.warning(
        'Bill settlement requires Biller or Manager authorization. Please hand over this table order to the billing counter.',
        'Action Restricted'
      );
      return;
    }
    if (!paymentsEnabled) {
      executeInlineSettle(item, ctx, 'NO_PAYMENT', false);
      return;
    }
    setSettleTarget({ table: item, ctx });
  }, [user?.role, paymentsEnabled, executeInlineSettle]);

  const handleOpenMetaEditor = useCallback((item: Table) => {
    setEditingTable(item);
    setEditSectionText(item.section?.trim() || 'Main Floor');
    setEditCapacity(Number(item.capacity || 4));
  }, []);

  const handleSaveTableMeta = async () => {
    if (!editingTable) return;
    setIsSavingMeta(true);
    try {
      await DBServices.updateTableMetadata(
        editingTable.id,
        { section: editSectionText, capacity: editCapacity },
        tenant?.id,
        activeLocationId || undefined
      );
      toast.success(`Table ${editingTable.tableNo} updated`, 'Saved');
      setEditingTable(null);
    } catch (e: any) {
      toast.error(e.message || 'Could not update table', 'Error');
    } finally {
      setIsSavingMeta(false);
    }
  };

  const renderGridRow = useCallback(({ item }: { item: FlatGridItem }) => {
    if (item.type === 'SECTION_HEADER') {
      return (
        <View className="flex-row items-center justify-between px-2 pt-3 pb-1.5">
          <View className="flex-row items-center">
            <Text className={`font-black text-sm tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              {item.section}
            </Text>
            <View className={`ml-2 px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200/80'}`}>
              <Text className={`text-[10px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {item.occupied}/{item.total} busy
              </Text>
            </View>
          </View>
        </View>
      );
    }

    const cols = Math.max(2, tableGridColumns);
    return (
      <View className="flex-row items-start px-0.5 mb-2">
        {item.items.map(table => {
          const ctx = tableContextMap[table.id || String(table.tableNo)] ||
            resolveTableOrderContext(table, carts[table.tableNo], null, features);
          return (
            <View key={table.id || table.tableNo} style={{ width: `${100 / cols}%` }}>
              <TableTile
                table={table}
                ctx={ctx}
                isDark={isDark}
                isEditMode={isEditMode}
                isBusyPrint={busyPrintTableNo === table.tableNo}
                isBusySettle={busySettleTableNo === table.tableNo}
                onPressTable={handleTablePress}
                onPressPrint={handleInlinePrint}
                onPressView={handleViewTable}
                onPressSave={handleInlineSavePress}
                onPressDelete={handleDeleteTable}
                onPressEditMeta={handleOpenMetaEditor}
              />
            </View>
          );
        })}
      </View>
    );
  }, [
    isDark,
    tableGridColumns,
    tableContextMap,
    carts,
    features,
    isEditMode,
    busyPrintTableNo,
    busySettleTableNo,
    handleTablePress,
    handleInlinePrint,
    handleViewTable,
    handleInlineSavePress,
    handleDeleteTable,
    handleOpenMetaEditor,
  ]);

  const legendItems: { key: FilterStatus; label: string; count: number; dot: string }[] = [
    { key: 'ALL', label: 'All', count: counts.ALL, dot: 'bg-indigo-500' },
    { key: 'BLANK', label: 'Blank Table', count: counts.BLANK, dot: 'bg-slate-400' },
    { key: 'RUNNING', label: 'Running', count: counts.RUNNING, dot: 'bg-sky-400' },
    { key: 'RUNNING_KOT', label: 'Running KOT', count: counts.RUNNING_KOT, dot: 'bg-amber-400' },
    { key: 'PRINTED', label: 'Printed', count: counts.PRINTED, dot: 'bg-emerald-400' },
  ];

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#090D1A]' : 'bg-white'}`}>
      <HamburgerMenu isVisible={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Top Command Bar (New Order, Bill No Search, Live Orders, Pick Up / Take Away) */}
      <View
        className={`px-3 sm:px-4 py-2.5 border-b flex-row flex-wrap items-center justify-between gap-2 ${
          isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        {/* Left Command Group */}
        <View className="flex-row items-center gap-2 flex-wrap">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className={`p-2 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}
            accessibilityLabel="Back"
          >
            <ArrowLeft size={16} color={isDark ? '#CBD5E1' : '#475569'} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}
            accessibilityLabel="Open Navigation Menu"
          >
            <MenuIcon size={16} color={isDark ? '#CBD5E1' : '#475569'} />
          </TouchableOpacity>

          {/* New Order CTA */}
          <TouchableOpacity
            onPress={() => navigation.navigate(Routes.MENU, { tableNo: 0, orderType: 'COUNTER' })}
            className="bg-[#DC2626] px-3 py-2 rounded-xl flex-row items-center shadow-sm active:opacity-90"
          >
            <Zap size={14} color="white" />
            <Text className="text-white font-bold text-xs ml-1.5">New Order</Text>
          </TouchableOpacity>

          {/* Bill No / Table Search */}
          <View
            className={`flex-row items-center px-2.5 py-1 rounded-xl border min-w-[130px] sm:min-w-[180px] ${
              isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-300'
            }`}
          >
            <Search size={13} color="#94A3B8" />
            <TextInput
              value={billSearchQuery}
              onChangeText={setBillSearchQuery}
              onSubmitEditing={handleBillSearchSubmit}
              placeholder="Bill No / Table #"
              placeholderTextColor="#94A3B8"
              returnKeyType="search"
              className={`ml-1.5 py-1 text-xs flex-1 ${isDark ? 'text-white' : 'text-slate-800'}`}
            />
            {billSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setBillSearchQuery('')}>
                <X size={13} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Right Utility & Take Away Group */}
        <View className="flex-row items-center gap-1.5 sm:gap-2 flex-wrap">
          <TouchableOpacity
            onPress={() => navigation.navigate(Routes.ORDERS)}
            className={`px-2.5 py-2 rounded-xl border flex-row items-center ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <Receipt size={14} color={isDark ? '#CBD5E1' : '#475569'} />
            {isLargePOS && (
              <Text className={`text-xs font-bold ml-1.5 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                Bill History
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRefresh}
            className={`p-2 rounded-xl border ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}
            accessibilityLabel="Refresh Tables"
          >
            <RefreshCw size={15} color={isRefreshing ? '#6366F1' : isDark ? '#CBD5E1' : '#475569'} />
          </TouchableOpacity>

          {/* Take Away / Pick Up button - explicitly kept visible even when Pickup is enabled */}
          {pickupEnabled && (
            <TouchableOpacity
              onPress={() => navigation.navigate(Routes.MENU, { tableNo: 0, orderType: 'PICKUP' })}
              className="bg-[#DC2626] px-3 py-2 rounded-xl flex-row items-center shadow-sm active:opacity-90"
            >
              <ShoppingBag size={14} color="white" />
              <Text className="text-white font-bold text-xs ml-1.5">Pick Up / Take Away</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={toggleTheme}
            className={`p-2 rounded-xl border ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}
            accessibilityLabel="Toggle Theme"
          >
            {isDark ? <Sun size={15} color="#FBBF24" /> : <Moon size={15} color="#6366F1" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Multi-Branch Floor Plan Switcher */}
      {hasMultiBranchAccess && locations.length > 1 && (
        <View
          className={`px-4 py-2 border-b flex-row items-center justify-between ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <View className="flex-row items-center mr-3">
            <Building size={13} color="#5D3FD3" />
            <Text className={`text-xs font-bold ml-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Branch:
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
            {locations.map(loc => {
              const isSelected = activeLocationId === loc.id;
              return (
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => setActiveLocationId(loc.id)}
                  className={`px-3 py-1 rounded-full border flex-row items-center ${
                    isSelected
                      ? 'bg-[#5D3FD3] border-purple-500 shadow-sm'
                      : isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                  }`}
                >
                  <MapPin size={11} color={isSelected ? 'white' : '#94A3B8'} />
                  <Text className={`text-xs font-bold ml-1 ${isSelected ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {loc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Table View Actions + Color Legend Ribbon */}
      <View
        className={`px-3 sm:px-4 py-2.5 border-b ${
          isDark ? 'bg-[#0c1222] border-slate-800' : 'bg-slate-50/70 border-slate-200'
        }`}
      >
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          {/* Left Action Pills */}
          <View className="flex-row items-center gap-1.5 flex-wrap">
            <TouchableOpacity
              onPress={handleAddTable}
              disabled={isAdding}
              className="bg-[#5D3FD3] px-3 py-1.5 rounded-xl flex-row items-center shadow-sm"
            >
              {isAdding ? <ActivityIndicator size="small" color="white" /> : <Plus size={14} color="white" />}
              <Text className="text-white font-bold text-xs ml-1">Add Table</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsEditMode(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border flex-row items-center ${
                isEditMode
                  ? 'bg-amber-500 border-amber-600'
                  : isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
              }`}
            >
              <SlidersHorizontal size={13} color={isEditMode ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475569'} />
              <Text className={`text-xs font-bold ml-1.5 ${isEditMode ? 'text-white' : isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {isEditMode ? 'Done Editing' : 'Manage'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsQrModalOpen(true)}
              className="bg-emerald-600 px-2.5 py-1.5 rounded-xl flex-row items-center shadow-sm"
            >
              <QrCode size={13} color="white" />
              <Text className="text-white font-bold text-xs ml-1">QRs</Text>
            </TouchableOpacity>
          </View>

          {/* Right Legend & Quick Status Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            {legendItems.map(item => {
              const active = statusFilter === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => setStatusFilter(item.key)}
                  className={`px-2.5 py-1 rounded-full border flex-row items-center ${
                    active
                      ? isDark ? 'bg-slate-700 border-indigo-400' : 'bg-slate-900 border-slate-900'
                      : isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <View className={`w-2.5 h-2.5 rounded-full mr-1.5 ${item.dot}`} />
                  <Text
                    className={`text-[11px] font-bold ${
                      active ? 'text-white' : isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    {item.label} ({item.count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Floor Sections Filter Row (shown whenever > 1 section or Manage mode) */}
        {(availableSections.length > 1 || isEditMode) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-2"
            contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text className={`text-[11px] font-bold mr-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Floor Plan:
            </Text>
            {['ALL', ...availableSections].map(sec => {
              const active = selectedSection === sec;
              return (
                <TouchableOpacity
                  key={sec}
                  onPress={() => setSelectedSection(sec)}
                  className={`px-2.5 py-1 rounded-lg border ${
                    active
                      ? 'bg-indigo-600 border-indigo-600'
                      : isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <Text className={`text-[11px] font-bold ${active ? 'text-white' : isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {sec === 'ALL' ? 'Default Layout (All)' : sec}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Main Section-Grouped Virtualized Table Grid */}
      <FlatList
        className="flex-1"
        style={{ flex: 1 }}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        data={gridRows}
        renderItem={renderGridRow}
        keyExtractor={item => item.key}
        contentContainerStyle={{
          paddingHorizontal: 10,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom + 24, 32),
        }}
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center justify-center p-12">
              <ActivityIndicator size="large" color="#5D3FD3" />
              <Text className="text-slate-400 text-sm mt-3">Loading restaurant tables...</Text>
            </View>
          ) : (
            <View className="items-center justify-center p-12">
              <LayoutGrid size={44} color="#64748B" />
              <Text className={`font-bold text-base mt-3 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                No tables match your filter
              </Text>
              <Text className="text-slate-500 text-xs mt-1 text-center">
                Tap "Add Table" above or clear your status/section filter.
              </Text>
            </View>
          )
        }
      />

      {/* Quick 1-Tap Settle Modal (from inline Save button) */}
      <QuickSettleModal
        visible={Boolean(settleTarget)}
        table={settleTarget?.table || null}
        ctx={settleTarget?.ctx || null}
        activeMethods={activeMethods}
        paymentsEnabled={paymentsEnabled}
        isDark={isDark}
        isSettling={busySettleTableNo !== null}
        onClose={() => setSettleTarget(null)}
        onConfirmSettle={(method, shouldPrint) => {
          if (settleTarget) {
            executeInlineSettle(settleTarget.table, settleTarget.ctx, method, shouldPrint);
          }
        }}
        onOpenFullCart={handleViewTable}
      />

      {/* Edit Table Section & Capacity Modal */}
      <Modal
        visible={Boolean(editingTable)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingTable(null)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
          <View
            className={`w-full max-w-[380px] rounded-3xl border p-5 shadow-2xl ${
              isDark ? 'bg-[#111827] border-slate-700' : 'bg-white border-slate-200'
            }`}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Edit Table {editingTable?.tableNo}
              </Text>
              <TouchableOpacity
                onPress={() => setEditingTable(null)}
                className={`p-1.5 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}
              >
                <X size={16} color={isDark ? '#CBD5E1' : '#475569'} />
              </TouchableOpacity>
            </View>

            <Text className={`text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Floor Section (e.g. A/C, Non A/C, Bar)
            </Text>
            <TextInput
              value={editSectionText}
              onChangeText={setEditSectionText}
              placeholder="Main Floor"
              placeholderTextColor="#94A3B8"
              className={`border rounded-xl px-3 py-2 text-sm mb-2.5 ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
            <View className="flex-row flex-wrap gap-1.5 mb-4">
              {SECTION_PRESETS.map(preset => (
                <TouchableOpacity
                  key={preset}
                  onPress={() => setEditSectionText(preset)}
                  className={`px-2.5 py-1 rounded-lg border ${
                    editSectionText === preset
                      ? 'bg-indigo-600 border-indigo-600'
                      : isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  <Text className={`text-[11px] font-bold ${editSectionText === preset ? 'text-white' : isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className={`text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Seating Capacity
            </Text>
            <View className="flex-row gap-2 mb-5">
              {CAPACITY_PRESETS.map(cap => (
                <TouchableOpacity
                  key={cap}
                  onPress={() => setEditCapacity(cap)}
                  className={`flex-1 py-2 rounded-xl border items-center ${
                    editCapacity === cap
                      ? 'bg-indigo-600 border-indigo-600'
                      : isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  <Text className={`text-xs font-bold ${editCapacity === cap ? 'text-white' : isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {cap} Seats
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleSaveTableMeta}
              disabled={isSavingMeta}
              className="bg-[#5D3FD3] py-3 rounded-2xl items-center justify-center shadow-md"
            >
              {isSavingMeta ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-black text-sm">Save Table Settings</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Download QR Modal */}
      <TableQrDownloadModal
        visible={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
      />
    </SafeAreaView>
  );
};
