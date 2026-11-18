import { toast } from '../../utils/toast';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Modal, ScrollView, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Search, X, Settings, ShoppingBag, Send, CreditCard, ChevronRight, Star, Sparkles, CheckCircle2, Package, Lock, ShieldCheck, LayoutGrid, List, Menu as MenuIcon, MapPin, Receipt, Bike, TrendingUp } from 'lucide-react-native';
import { HamburgerMenu } from '../../components/common/HamburgerMenu';
import { useMenuStore } from '../../store/menu.store';
import { useCartStore, consolidateCartItems } from '../../store/cart.store';
import { useTableStore } from '../../store/table.store';
import { useOrderStore } from '../../store/order.store';
import { usePrinterStore } from '../../store/printer.store';
import { useToastStore } from '../../store/toast.store';
import { useAuthStore } from '../../store/auth.store';
import { useTenantStore } from '../../store/tenant.store';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { printerService } from '../../services/printer/printer.service';
import { ESCPOSService } from '../../services/printer/escpos.service';
import { DBServices } from '../../services/firebase/db';
import { Button } from '../../components/common/Button';
import { Routes } from '../../constants/routes';
import { MenuItem } from '../../types/menu.types';

interface MenuScreenProps {
  isDirectHome?: boolean;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({ isDirectHome = false }) => {
  const insets = useSafeAreaInsets();
  let routeParams: any = {};
  try {
    const route = useRoute<any>();
    routeParams = route?.params || {};
  } catch (e) {}

  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { tenant, activeLocationId, setActiveLocationId, features, branding, locations, getActiveLocation } = useTenantStore();
  const activeLocation = getActiveLocation();
  const isClientAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';

  // Quick Sale direct counter mode active if requested, or if both dine-in floor and pickup are turned off
  const isDirect = isDirectHome || routeParams.isDirectHome || (features.dineInEnabled === false && features.pickupEnabled === false && (!routeParams.tableNo || routeParams.tableNo === 0));
  const tableNo = isDirect ? 0 : (routeParams.tableNo ?? 0);
  const orderType = isDirect ? 'COUNTER' : (routeParams.orderType || (tableNo === 0 ? 'PICKUP' : 'DINE_IN'));

  const [isMobileCartOpen, setMobileCartOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isBranchModalOpen, setBranchModalOpen] = useState(false);

  const { categories, items, subscribeToMenu } = useMenuStore();
  const paymentsEnabled = features.paymentsEnabled !== false;
  const { settings: printerSettings } = usePrinterStore();
  const rawWorkflowMode = printerSettings.printerWorkflowMode || 'DUAL_PRINTER';
  const isDualPrinterMode = rawWorkflowMode === 'DUAL_PRINTER' || rawWorkflowMode === 'RESTAURANT';
  const { carts, addItem, removeItem, updateQuantity, markAsSent, clearCart } = useCartStore();
  const { tables } = useTableStore();
  const { orders } = useOrderStore();
  const { settings } = usePrinterStore();
  const { isSplitView, isLargePOS } = useResponsiveLayout();

  // Role check: Only Admin and Manager are allowed to edit items once bill has been printed
  const isManagerOrAdmin = Boolean(
    user?.role && [
      'ADMIN',
      'admin',
      'CLIENT_ADMIN',
      'TENANT_SUPER_ADMIN',
      'PLATFORM_ADMIN',
      'MANAGER',
      'manager',
    ].includes(user.role)
  );

  const currentTable = useMemo(() => {
    return tables.find((t: any) => Number(t.tableNo) === Number(tableNo));
  }, [tables, tableNo]);

  const runningOrder = useMemo(() => {
    return orders.find(
      (o: any) => (o.status === 'RUNNING' || o.status === 'running') && Number(o.tableNo) === Number(tableNo)
    );
  }, [orders, tableNo]);

  const isBillPrinted = Boolean(
    tableNo !== 0 && ((currentTable as any)?.billPrinted === true || (runningOrder as any)?.billPrinted === true)
  );

  const activePrintedBillNo = (runningOrder as any)?.billNo || (currentTable as any)?.billNo || null;

  const checkCanEditCart = (): boolean => {
    if (isBillPrinted && !isManagerOrAdmin) {
      toast.warning(
        `Bill #${activePrintedBillNo || ''} has already been printed for Table ${tableNo}. Modifying items is restricted to Admin & Manager only.`,
        'Bill Printed • Locked'
      );
      return false;
    }
    return true;
  };

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemForVariants, setSelectedItemForVariants] = useState<MenuItem | null>(null);
  const [isSendingKOT, setIsSendingKOT] = useState(false);
  const [kotToast, setKotToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'lines'>('grid');

  useEffect(() => {
    AsyncStorage.getItem('@zentiq_pos_menu_view_mode')
      .then((saved) => {
        if (saved === 'grid' || saved === 'lines') {
          setViewMode(saved);
        }
      })
      .catch(() => {});
  }, []);

  const handleSetViewMode = (mode: 'grid' | 'lines') => {
    setViewMode(mode);
    AsyncStorage.setItem('@zentiq_pos_menu_view_mode', mode).catch(() => {});
  };

  const numColumns = useMemo(() => {
    if (viewMode === 'lines') return 1;
    if (isLargePOS) return isSplitView ? 3 : 4;
    return 2;
  }, [viewMode, isLargePOS, isSplitView]);

  useEffect(() => {
    const unsub = subscribeToMenu();
    return () => unsub();
  }, [tenant?.id, activeLocationId]);

  const cartItems = useMemo(() => consolidateCartItems(carts[tableNo] || []), [carts, tableNo]);

  // Differential KOT filtering: Only items with qty > sentQty
  const unsentItems = cartItems
    .map(i => ({ ...i, qty: i.qty - (i.sentQty || 0) }))
    .filter(i => i.qty > 0);

  // Keep table cart continuously synchronized with live running orders (including customer QR self-orders)
  useEffect(() => {
    if (tableNo !== 0) {
      try {
        const runningOrder = orders.find(
          (o: any) => (o.status === 'RUNNING' || o.status === 'running') && Number(o.tableNo) === Number(tableNo)
        );
        if (runningOrder && runningOrder.items && runningOrder.items.length > 0) {
          const formatted = runningOrder.items.map((it: any, idx: number) => {
            const rawName = (it.itemName || it.name || '').trim().toLowerCase();
            const matchedMaster = items.find(m =>
              m.id === it.itemId ||
              (m.name && m.name.trim().toLowerCase() === rawName)
            );
            return {
              itemId: matchedMaster?.id || it.itemId || it.id || `item-${idx}`,
              baseItemId: matchedMaster?.id || it.baseItemId || undefined,
              itemName: matchedMaster?.name || it.itemName || it.name,
              price: Number(it.price || matchedMaster?.price || 0),
              qty: Number(it.qty || 1),
              sentQty: Number(it.sentQty ?? it.qty ?? 1),
              variantId: it.variantId || null,
              variantName: it.variantName || null,
              note: it.note || '',
            };
          });
          useCartStore.getState().syncRunningOrderItems(tableNo, formatted);
          return;
        }

        if (cartItems.length === 0) {
          const currentTable = useTableStore.getState().tables.find((t: any) => t.tableNo === tableNo);
          if (currentTable && (currentTable as any).cartItems && (currentTable as any).cartItems.length > 0) {
            useCartStore.getState().syncRemoteCarts({ [tableNo]: (currentTable as any).cartItems });
          }
        }
      } catch (err) {
        console.warn('Error syncing table running order into cart:', err);
      }
    }
  }, [tableNo, orders]);

  const { cartTotal, cartItemCount } = useMemo(() => {
    let total = 0;
    let count = 0;
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      total += item.price * item.qty;
      count += item.qty;
    }
    return { cartTotal: total, cartItemCount: count };
  }, [cartItems]);

  const handleSendToKitchen = () => {
    if (unsentItems.length === 0) return;
    if (!activeLocationId) {
      toast.warning('Please select an operating branch on home screen first.', 'Branch Required');
      return;
    }

    // 1. Instant Optimistic UI Response (0ms perceptible lag)
    const itemsToDispatch = [...unsentItems];
    markAsSent(tableNo);
    setKotToast('✓ KOT sent to kitchen');
    setTimeout(() => setKotToast(null), 3000);

    // 2. Background Dispatch: Firestore sequence, sync & Thermal Print (Non-blocking)
    (async () => {
      try {
        const kotNo = await DBServices.getNextSequenceNumber(tenant?.id, activeLocationId || undefined);

        if (tableNo !== 0) {
          DBServices.updateTableStatusByNo(tableNo, 'running', tenant?.id, activeLocationId || undefined).catch(() => {});
        }

        // Persist KOT items to Firestore running order
        try {
          const { useOrderStore } = require('../../store/order.store');
          const existingRunning = useOrderStore.getState().orders.find(
            (o: any) => (o.status === 'RUNNING' || o.status === 'running') && Number(o.tableNo) === Number(tableNo)
          );
          if (existingRunning && existingRunning.id) {
            await DBServices.appendKOTItemsToRunningOrder(
              existingRunning.id,
              itemsToDispatch.map(i => ({
                itemId: i.itemId,
                itemName: i.itemName,
                qty: i.qty,
                price: i.price,
                variantId: i.variantId || null,
                variantName: i.variantName || null,
                note: i.note || '',
              })),
              tenant?.id,
              existingRunning.locationId || activeLocationId || undefined
            );
          } else if (tableNo !== 0) {
            await DBServices.createOrder({
              kotNo,
              orderNumber: kotNo,
              orderType,
              tableNo,
              captainId: user?.id || 'staff',
              captainName: user?.name || 'Staff',
              status: 'RUNNING',
              paymentStatus: 'UNPAID',
              items: cartItems.map(i => ({ ...i })),
              subtotal: cartItems.reduce((s, i) => s + i.price * i.qty, 0),
              tax: 0,
              totalAmount: cartItems.reduce((s, i) => s + i.price * i.qty, 0),
              createdAt: new Date(),
            }, tenant?.id, activeLocationId || undefined);
          }
        } catch (persistErr) {
          console.warn('KOT persist to Firestore failed (non-critical):', persistErr);
        }

        // Build ESC/POS KOT buffer with orderType
        const buffer = ESCPOSService.buildKOT(
          kotNo,
          tableNo,
          user?.name || 'Staff',
          itemsToDispatch,
          undefined,
          orderType
        );

        // Route print to Kitchen Printer (supports both USB & LAN with main printer fallback)
        const isKitchenUsb = settings.kitchenPrinterType === 'USB';
        const kitchenTarget = isKitchenUsb
          ? (settings.kitchenPrinterName || settings.printerName || 'POS-80')
          : (settings.kitchenIpAddress?.trim() || (settings.printerType === 'LAN' ? settings.ipAddress?.trim() : ''));
        const kitchenPort = settings.kitchenPort || settings.port || 9100;
        const kitchenType = isKitchenUsb ? 'USB' : 'LAN';

        let printSuccess = false;
        let printErrorMsg = '';

        if (kitchenTarget) {
          try {
            await printerService.connect(kitchenTarget, kitchenPort, kitchenType);
            await printerService.print(
              buffer,
              isKitchenUsb
                ? { printerType: 'USB', printerName: kitchenTarget }
                : { printerType: 'LAN', ip: kitchenTarget, port: kitchenPort }
            );
            await printerService.disconnect();
            printSuccess = true;
          } catch (printErr: any) {
            console.warn('Kitchen thermal print error:', printErr);
            printErrorMsg = printErr.message || 'Printer error';
          }
        } else {
          printErrorMsg = 'Kitchen printer not configured. Go to Settings -> Thermal Printers.';
        }

        if (printSuccess) {
          toast.success(`✓ KOT #${kotNo} printed to kitchen!`, 'KOT Printed');
          setKotToast(`✓ KOT #${kotNo} printed to kitchen`);
        } else {
          toast.warning(
            `KOT #${kotNo} saved, but kitchen printer failed: ${printErrorMsg}`,
            'Printer Offline'
          );
          setKotToast(`KOT #${kotNo} saved (Printer offline)`);
        }
        setTimeout(() => setKotToast(null), 3500);
      } catch (err: any) {
        console.warn('KOT dispatch background error:', err);
      }
    })();
  };

  const favoriteCount = useMemo(() => items.filter(i => i.isFavorite).length, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter(i => {
        if (activeCategory === 'favorites') return i.isFavorite === true;
        if (activeCategory === 'all') return true;
        return i.categoryId === activeCategory;
      })
      .filter(i => !q || i.name.toLowerCase().includes(q));
  }, [items, activeCategory, searchQuery]);

  // Inventory Calculation & Stock Guard Helpers
  const getReservedStock = (baseItemId: string): number => {
    const master = items.find(m => m.id === baseItemId);
    const masterNameNorm = (master?.name || '').trim().toLowerCase();
    return cartItems
      .filter(i => (i.baseItemId === baseItemId) || (i.itemId === baseItemId) || (masterNameNorm && i.itemName && i.itemName.trim().toLowerCase() === masterNameNorm))
      .reduce((total, i) => total + (i.qty * (i.portionDeduction || 1)), 0);
  };

  const getAvailableStock = (item: MenuItem): number => {
    if (!item.trackInventory) return 999999;
    const reserved = getReservedStock(item.id);
    return Math.max(0, (item.stockQuantity || 0) - reserved);
  };

  const handleAddSimpleItem = (item: MenuItem) => {
    if (!checkCanEditCart()) return;
    if (item.isAvailable === false) {
      toast.warning(`"${item.name}" is marked out of stock.`, 'Out of Stock');
      return;
    }
    if (item.trackInventory) {
      const avail = getAvailableStock(item);
      if (avail < 1) {
        toast.warning(`Cannot sell more than available stock! Only ${avail.toFixed(2)} ${item.stockUnit || 'kg'} of "${item.name}" remaining.`, 'Insufficient Stock');
        return;
      }
    }
    addItem(tableNo, {
      itemId: item.id,
      baseItemId: item.id,
      itemName: item.name,
      price: item.price,
      qty: 1,
      portionDeduction: 1,
    });
  };

  const handleSelectBranch = (loc: any) => {
    setActiveLocationId(loc.id);
    setBranchModalOpen(false);
    toast.success(`Switched branch to ${loc.name}`, 'Branch Activated');
  };

  const handleIncrementSimpleItem = (item: MenuItem, currentQty: number) => {
    if (!checkCanEditCart()) return;
    if (item.isAvailable === false) {
      toast.warning(`"${item.name}" is marked out of stock.`, 'Out of Stock');
      return;
    }
    if (item.trackInventory) {
      const avail = getAvailableStock(item);
      if (avail < 1) {
        toast.warning(`Cannot sell more than available stock! Only ${avail.toFixed(2)} ${item.stockUnit || 'kg'} of "${item.name}" remaining.`, 'Insufficient Stock');
        return;
      }
    }
    updateQuantity(tableNo, item.id, currentQty + 1);
  };

  const handleIncrementCartItem = (cItem: any) => {
    if (!checkCanEditCart()) return;
    const baseId = cItem.baseItemId || cItem.itemId;
    const masterItem = items.find(i => i.id === baseId);
    if (masterItem && masterItem.isAvailable === false) {
      toast.warning(`"${masterItem.name}" is marked out of stock.`, 'Out of Stock');
      return;
    }
    if (masterItem && masterItem.trackInventory) {
      const deduction = typeof cItem.portionDeduction === 'number' ? cItem.portionDeduction : 1;
      const avail = getAvailableStock(masterItem);
      if (avail < deduction) {
        toast.warning(`Cannot add more! Only ${avail.toFixed(2)} ${masterItem.stockUnit || 'kg'} of "${masterItem.name}" remaining in stock.`, 'Insufficient Stock');
        return;
      }
    }
    updateQuantity(tableNo, cItem.itemId, cItem.qty + 1, cItem.variantId || cItem.variantName);
  };

  const renderLineCard = ({ item }: { item: MenuItem }) => {
    const hasVariants = item.variants && item.variants.length > 0;
    const itemNameNorm = (item.name || '').trim().toLowerCase();
    const matchingCartItems = cartItems.filter(i =>
      i.itemId === item.id ||
      (i as any).baseItemId === item.id ||
      (i.itemName && i.itemName.trim().toLowerCase() === itemNameNorm)
    );
    const qty = matchingCartItems.reduce((sum, i) => sum + (i.qty || 0), 0);
    const availStock = getAvailableStock(item);
    const isExplicitlyOutOfStock = item.isAvailable === false;
    const isOutOfStock = isExplicitlyOutOfStock || (item.trackInventory && availStock <= 0);
    const isLowStock = !isExplicitlyOutOfStock && item.trackInventory && !isOutOfStock && availStock <= (item.lowStockThreshold || 2);

    return (
      <View className={`p-4 rounded-2xl mb-3 flex-row items-center justify-between shadow-lg transition-all ${
        isOutOfStock
          ? 'bg-slate-900/60 border border-rose-950/40 opacity-70'
          : qty > 0
          ? 'bg-[#141B33] border-2 border-indigo-500 shadow-indigo-500/15'
          : 'bg-[#10172A] border border-slate-800/90'
      }`}>
        <View className="flex-1 mr-3">
          <View className="flex-row items-center flex-wrap gap-1.5">
            {item.isFavorite && (
              <View className="mr-0.5 bg-amber-500/20 px-1.5 py-0.5 rounded flex-row items-center">
                <Star size={10} color="#FBBF24" fill="#FBBF24" />
              </View>
            )}
            <Text className="text-white font-extrabold text-base" numberOfLines={1}>
              {item.name}
            </Text>

            {/* Out of Stock / Inventory Status Badge */}
            {isExplicitlyOutOfStock ? (
              <View className="px-2 py-0.5 rounded-full border bg-rose-500/20 border-rose-500/40">
                <Text className="text-[10px] font-black text-rose-400 tracking-wider uppercase">
                  OUT OF STOCK
                </Text>
              </View>
            ) : item.trackInventory ? (
              <View className={`px-2 py-0.5 rounded-full border ${
                isOutOfStock
                  ? 'bg-rose-500/15 border-rose-500/30'
                  : isLowStock
                  ? 'bg-amber-500/15 border-amber-500/30'
                  : 'bg-emerald-500/15 border-emerald-500/30'
              }`}>
                <Text className={`text-[10px] font-black ${
                  isOutOfStock
                    ? 'text-rose-400'
                    : isLowStock
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}>
                  {isOutOfStock
                    ? 'Out of Stock'
                    : isLowStock
                    ? `Low: ${availStock.toFixed(availStock % 1 === 0 ? 0 : 2)} ${item.stockUnit || 'kg'}`
                    : `Stock: ${availStock.toFixed(availStock % 1 === 0 ? 0 : 2)} ${item.stockUnit || 'kg'}`}
                </Text>
              </View>
            ) : null}

            {qty > 0 && (
              <View className="bg-indigo-500/30 border border-indigo-400/50 px-2 py-0.5 rounded-full">
                <Text className="text-indigo-300 text-[10px] font-black">{qty} in cart</Text>
              </View>
            )}
          </View>
          <Text className="text-emerald-400 font-black text-sm mt-1">₹{item.price}</Text>
          {hasVariants && (
            <Text className="text-indigo-300 text-[11px] mt-0.5 font-semibold">
              {item.variants?.length} Options available
            </Text>
          )}
        </View>

        {hasVariants ? (
          <TouchableOpacity
            onPress={() => {
              if (!checkCanEditCart()) return;
              setSelectedItemForVariants(item);
            }}
            disabled={isOutOfStock}
            className={`px-3.5 py-2 rounded-xl active:opacity-80 ${
              isOutOfStock
                ? 'bg-slate-800 border border-slate-700 opacity-60'
                : 'bg-[#5D3FD3] shadow-md shadow-purple-500/30'
            }`}
          >
            <Text className={`font-bold text-xs ${isOutOfStock ? 'text-slate-400' : 'text-white'}`}>
              {isOutOfStock ? 'Out of Stock' : '+ Options'}
            </Text>
          </TouchableOpacity>
        ) : isOutOfStock ? (
          <View className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl">
            <Text className="text-rose-400 font-bold text-xs">Out of Stock</Text>
          </View>
        ) : qty > 0 ? (
          <View className="flex-row items-center bg-slate-800/90 rounded-xl p-1 border border-slate-700">
            <TouchableOpacity
              className="w-7 h-7 rounded-lg bg-slate-700 items-center justify-center active:opacity-75"
              onPress={() => {
                if (!checkCanEditCart()) return;
                if (qty > 1) updateQuantity(tableNo, item.id, qty - 1);
                else removeItem(tableNo, item.id);
              }}
            >
              <Text className="text-white font-black text-sm">-</Text>
            </TouchableOpacity>
            <Text className="w-7 text-center text-white font-black text-xs">{qty}</Text>
            <TouchableOpacity
              className="w-7 h-7 rounded-lg bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-sm shadow-purple-500/30"
              onPress={() => handleIncrementSimpleItem(item, qty)}
            >
              <Text className="text-white font-black text-sm">+</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => handleAddSimpleItem(item)}
            className="bg-[#5D3FD3] px-4 py-2 rounded-xl shadow-md shadow-purple-500/30 active:opacity-80"
          >
            <Text className="text-white font-black text-xs">+ Add</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderGridCard = ({ item }: { item: MenuItem }) => {
    const hasVariants = item.variants && item.variants.length > 0;
    const itemNameNorm = (item.name || '').trim().toLowerCase();
    const matchingCartItems = cartItems.filter(i =>
      i.itemId === item.id ||
      (i as any).baseItemId === item.id ||
      (i.itemName && i.itemName.trim().toLowerCase() === itemNameNorm)
    );
    const qty = matchingCartItems.reduce((sum, i) => sum + (i.qty || 0), 0);
    const availStock = getAvailableStock(item);
    const isExplicitlyOutOfStock = item.isAvailable === false;
    const isOutOfStock = isExplicitlyOutOfStock || (item.trackInventory && availStock <= 0);

    return (
      <View
        style={{ flex: 1, margin: 4, minHeight: 115 }}
        className={`rounded-2xl p-3.5 justify-between shadow-lg transition-all ${
          isOutOfStock
            ? 'bg-slate-900/60 border border-rose-950/40 opacity-70'
            : qty > 0
            ? 'bg-[#141B33] border-2 border-indigo-500 shadow-indigo-500/20'
            : 'bg-[#10172A] border border-slate-800/90'
        }`}
      >
        {/* Top: Name & Badges */}
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-1">
            <View className="flex-row items-center flex-wrap gap-1">
              {item.isFavorite && (
                <View className="mr-0.5 bg-amber-500/20 px-1 py-0.5 rounded">
                  <Star size={9} color="#FBBF24" fill="#FBBF24" />
                </View>
              )}
              <Text className="text-white font-extrabold text-xs sm:text-sm leading-snug" numberOfLines={2}>
                {item.name}
              </Text>
            </View>
            {isOutOfStock ? (
              <Text className="text-rose-400 font-bold text-[9px] uppercase mt-1">Out of Stock</Text>
            ) : item.trackInventory && availStock <= (item.lowStockThreshold || 2) ? (
              <Text className="text-amber-400 font-bold text-[9px] mt-0.5">Low: {availStock.toFixed(0)} {item.stockUnit || 'kg'}</Text>
            ) : null}
          </View>
          {qty > 0 && (
            <View className="bg-indigo-500/30 border border-indigo-400/50 px-1.5 py-0.5 rounded-md shrink-0">
              <Text className="text-indigo-300 text-[9px] font-black">{qty}</Text>
            </View>
          )}
        </View>

        {/* Bottom Row: Price & Action Stepper / Add Button */}
        <View className="flex-row items-end justify-between mt-auto pt-1">
          <Text className="text-emerald-400 font-black text-base sm:text-lg tracking-tight">
            ₹{item.price}
          </Text>

          {hasVariants ? (
            <View className="items-end">
              <Text className="text-indigo-300 text-[10px] font-bold leading-none mb-1">
                Options
              </Text>
              {qty > 0 ? (
                <View className="flex-row items-center bg-slate-800/90 rounded-xl p-0.5 border border-slate-700">
                  <TouchableOpacity
                    className="w-6 h-6 rounded-lg bg-slate-700 items-center justify-center active:opacity-75"
                    onPress={() => {
                      if (!checkCanEditCart()) return;
                      setSelectedItemForVariants(item);
                    }}
                  >
                    <Text className="text-white font-bold text-xs">-</Text>
                  </TouchableOpacity>
                  <Text className="w-5 text-center text-white font-black text-xs">{qty}</Text>
                  <TouchableOpacity
                    className="w-6 h-6 rounded-lg bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-sm shadow-purple-500/30"
                    onPress={() => {
                      if (!checkCanEditCart()) return;
                      setSelectedItemForVariants(item);
                    }}
                  >
                    <Text className="text-white font-bold text-xs">+</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    if (!checkCanEditCart()) return;
                    setSelectedItemForVariants(item);
                  }}
                  disabled={isOutOfStock}
                  className={`px-3 py-1.5 rounded-xl active:opacity-80 ${
                    isOutOfStock ? 'bg-slate-800 border border-slate-700 opacity-60' : 'bg-[#5D3FD3] shadow-md shadow-purple-500/30'
                  }`}
                >
                  <Text className={`font-bold text-xs ${isOutOfStock ? 'text-slate-400' : 'text-white'}`}>
                    + Add
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : isOutOfStock ? (
            <View className="bg-slate-800/80 border border-slate-700 px-2.5 py-1 rounded-xl">
              <Text className="text-rose-400 font-bold text-[10px]">Out</Text>
            </View>
          ) : qty > 0 ? (
            <View className="flex-row items-center bg-slate-800/90 rounded-xl p-0.5 border border-slate-700">
              <TouchableOpacity
                className="w-6 h-6 rounded-lg bg-slate-700 items-center justify-center active:opacity-75"
                onPress={() => {
                  if (!checkCanEditCart()) return;
                  if (qty > 1) updateQuantity(tableNo, item.id, qty - 1);
                  else removeItem(tableNo, item.id);
                }}
              >
                <Text className="text-white font-bold text-xs">-</Text>
              </TouchableOpacity>
              <Text className="w-5 text-center text-white font-black text-xs">{qty}</Text>
              <TouchableOpacity
                className="w-6 h-6 rounded-lg bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-sm shadow-purple-500/30"
                onPress={() => handleIncrementSimpleItem(item, qty)}
              >
                <Text className="text-white font-bold text-xs">+</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => handleAddSimpleItem(item)}
              className="bg-[#5D3FD3] px-3.5 py-1.5 rounded-xl shadow-md shadow-purple-500/30 active:opacity-80"
            >
              <Text className="text-white font-black text-xs">+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Persistent Right Panel for Tablets & POS
  const renderSplitCartPanel = () => (
    <View className="w-[360px] lg:w-[410px] bg-slate-900 border-l border-slate-800 p-4 flex-col justify-between shadow-2xl">
      <View className="flex-1">
        <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
          <Text className="text-white font-black text-lg">
            {tableNo === 0 ? (orderType === 'PICKUP' ? 'Pick Up Cart' : (orderType === 'COUNTER' ? 'Counter Cart' : 'Takeaway Cart')) : `Table ${tableNo} Cart`}
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (!checkCanEditCart()) return;
              clearCart(tableNo);
            }}
            className="px-2 py-1 bg-rose-500/10 rounded"
          >
            <Text className="text-rose-400 text-xs font-bold">Clear</Text>
          </TouchableOpacity>
        </View>

        {isBillPrinted && (
          <View className={`mt-2.5 p-2.5 rounded-xl border flex-row items-center ${
            isManagerOrAdmin
              ? 'bg-amber-500/15 border-amber-500/30'
              : 'bg-rose-500/15 border-rose-500/30'
          }`}>
            {isManagerOrAdmin ? (
              <ShieldCheck size={16} color="#F59E0B" />
            ) : (
              <Lock size={16} color="#F43F5E" />
            )}
            <View className="ml-2 flex-1">
              <Text className={`text-xs font-black ${isManagerOrAdmin ? 'text-amber-300' : 'text-rose-300'}`}>
                {isManagerOrAdmin ? `🧾 Bill #${activePrintedBillNo || ''} Printed (Manager Edit)` : `🔒 Bill #${activePrintedBillNo || ''} Printed • Locked`}
              </Text>
              <Text className="text-slate-400 text-[10px] mt-0.5">
                {isManagerOrAdmin
                  ? 'Authorized as Admin/Manager to edit this printed bill.'
                  : 'Items locked. Hand over to billing counter or ask Manager.'}
              </Text>
            </View>
          </View>
        )}

        <ScrollView className="flex-1 my-3">
          {cartItems.length === 0 ? (
            <View className="py-12 items-center">
              <ShoppingBag size={32} color="#475569" />
              <Text className="text-slate-500 text-xs mt-2">Cart is empty</Text>
            </View>
          ) : (
            cartItems.map((item, index) => (
              <View key={`${item.itemId}_${item.variantId || item.variantName || index}`} className="flex-row items-center justify-between py-2 border-b border-slate-800/50">
                <View className="flex-1 mr-2">
                  <Text className="text-white text-xs font-semibold" numberOfLines={1}>
                    {item.itemName} {item.variantName ? `(${item.variantName})` : ''}
                  </Text>
                  <Text className="text-slate-400 text-[10px]">₹{item.price} each</Text>
                </View>
                <View className="flex-row items-center bg-slate-800 rounded p-0.5">
                  <TouchableOpacity
                    className="w-6 h-6 rounded bg-slate-700 items-center justify-center"
                    onPress={() => {
                      if (!checkCanEditCart()) return;
                      if (item.qty > 1) updateQuantity(tableNo, item.itemId, item.qty - 1, item.variantId || item.variantName);
                      else removeItem(tableNo, item.itemId, item.variantId || item.variantName);
                    }}
                  >
                    <Text className="text-white font-bold">-</Text>
                  </TouchableOpacity>
                  <Text className="w-6 text-center text-white font-bold text-xs">{item.qty}</Text>
                  <TouchableOpacity
                    className="w-6 h-6 rounded bg-[#5D3FD3] items-center justify-center"
                    onPress={() => handleIncrementCartItem(item)}
                  >
                    <Text className="text-white font-bold">+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      <View className="pt-3 border-t border-slate-800" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        <View className="flex-row justify-between mb-3">
          <Text className="text-slate-400 font-semibold text-xs">Total Amount</Text>
          <Text className="text-white font-black text-lg">₹{cartTotal.toFixed(2)}</Text>
        </View>

        <View className="flex-row gap-2">
          {isDualPrinterMode && unsentItems.length > 0 && (
            <Button
              title={`Send KOT (${unsentItems.reduce((s, i) => s + i.qty, 0)} items)`}
              variant="secondary"
              onPress={handleSendToKitchen}
              isLoading={isSendingKOT}
              className="flex-1"
            />
          )}
          <Button
            title={paymentsEnabled ? "Checkout & Pay" : "View & Send KOT"}
            onPress={() => navigation.navigate(Routes.CART, { tableNo, orderType })}
            disabled={cartItems.length === 0}
            className="flex-1"
          />
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <HamburgerMenu isVisible={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-[#111827] border-b border-slate-800">
        <View className="flex-row items-center flex-1 mr-2">
          {isDirect ? (
            <TouchableOpacity
              onPress={() => setSidebarOpen(true)}
              className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 mr-3 active:opacity-80"
              accessibilityLabel="Open Navigation Menu"
            >
              <MenuIcon size={20} color="#CBD5E1" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate(Routes.HOME);
                }
              }}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 mr-3 active:opacity-80"
            >
              <ArrowLeft size={20} color="#CBD5E1" />
            </TouchableOpacity>
          )}

          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-white font-black text-base" numberOfLines={1}>
                {isDirect
                  ? (branding?.displayName || branding?.businessName || tenant?.businessName || 'Zentiq POS')
                  : (tableNo === 0 ? (orderType === 'PICKUP' ? 'Pick Up Order' : (orderType === 'COUNTER' ? 'Quick Counter Sale' : 'Takeaway Order')) : `Table ${tableNo} (Dine In)`)}
              </Text>
              {isDirect && (
                <View className="bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex-row items-center">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
                  <Text className="text-emerald-400 text-[10px] font-bold">Quick Sale</Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center gap-2 mt-0.5">
              {isDirect && isClientAdmin ? (
                <TouchableOpacity
                  onPress={() => setBranchModalOpen(true)}
                  className="flex-row items-center"
                >
                  <MapPin size={11} color="#A855F7" />
                  <Text className="text-purple-300 text-xs font-semibold ml-1">
                    {activeLocation?.name || 'Tap to select branch'} ▾
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text className="text-slate-400 text-xs" numberOfLines={1}>
                  {isDirect
                    ? `${activeLocation?.name || 'Main Branch'} • Tap items to add to cart`
                    : 'Tap items to add to order'}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          {/* Quick Orders History shortcut for Quick Sale Mode */}
          {isDirect && (
            <TouchableOpacity
              onPress={() => navigation.navigate(Routes.ORDERS)}
              className="hidden sm:flex flex-row items-center bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl active:opacity-80"
            >
              <Receipt size={14} color="#CBD5E1" />
              <Text className="text-slate-200 text-xs font-bold ml-1.5">Bill History</Text>
            </TouchableOpacity>
          )}

          {/* Mobile Cart Button in Header */}
          {!isSplitView && (
            <TouchableOpacity
              onPress={() => setMobileCartOpen(true)}
              className={`px-3 py-1.5 rounded-xl flex-row items-center border shadow-sm active:opacity-80 ${
                cartItemCount > 0
                  ? 'bg-[#5D3FD3] border-purple-400 shadow-purple-500/30'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              <ShoppingBag size={16} color={cartItemCount > 0 ? '#FFFFFF' : '#94A3B8'} />
              <Text className={`font-black text-xs ml-1.5 ${cartItemCount > 0 ? 'text-white' : 'text-slate-300'}`}>
                {cartItemCount > 0 ? `${cartItemCount} (₹${cartTotal.toFixed(0)})` : 'Cart'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Body */}
      {kotToast && (
        <View className="bg-emerald-500/20 border-b border-emerald-500/40 px-4 py-2.5 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <CheckCircle2 size={16} color="#34D399" />
            <Text className="text-emerald-300 font-bold text-xs ml-2">{kotToast}</Text>
          </View>
          <TouchableOpacity onPress={() => setKotToast(null)}>
            <Text className="text-emerald-400 text-xs font-bold">Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
      <View className="flex-1 flex-row">
        {/* Left Column (Menu & Categories) */}
        <View className="flex-1">
          {/* Search Bar & View Mode Toggle (Grid vs Lines) */}
          <View className="px-4 py-2.5 bg-[#090D1A] flex-row items-center gap-2">
            <View className="flex-1 flex-row items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
              <Search size={16} color="#64748B" />
              <TextInput
                placeholder="Search menu items..."
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 ml-2 text-xs text-white"
              />
            </View>

            {/* View Mode Toggle */}
            <View className="flex-row items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
              <TouchableOpacity
                onPress={() => handleSetViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-lg flex-row items-center gap-1.5 ${
                  viewMode === 'grid' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                }`}
                accessibilityLabel="Grid View"
              >
                <LayoutGrid size={13} color={viewMode === 'grid' ? '#FFFFFF' : '#94A3B8'} />
                <Text className={`text-[11px] font-bold ${viewMode === 'grid' ? 'text-white' : 'text-slate-400'}`}>
                  Grid
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSetViewMode('lines')}
                className={`px-2.5 py-1.5 rounded-lg flex-row items-center gap-1.5 ${
                  viewMode === 'lines' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                }`}
                accessibilityLabel="Lines View"
              >
                <List size={13} color={viewMode === 'lines' ? '#FFFFFF' : '#94A3B8'} />
                <Text className={`text-[11px] font-bold ${viewMode === 'lines' ? 'text-white' : 'text-slate-400'}`}>
                  Lines
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sub-menu Horizontal Category Bar with Favorites */}
          <View className="py-2.5 bg-[#0B101E] border-b border-slate-800/80 shadow-sm">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}
            >
              {/* Starred Favorites Tab */}
              <TouchableOpacity
                style={{ flexShrink: 0 }}
                onPress={() => setActiveCategory('favorites')}
                className={`mr-2 px-3.5 py-1.5 rounded-full flex-row items-center border shadow-sm ${
                  activeCategory === 'favorites'
                    ? 'bg-amber-500/25 border-amber-400 shadow-amber-500/20'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <Star size={13} color={activeCategory === 'favorites' ? '#FBBF24' : '#94A3B8'} fill={activeCategory === 'favorites' ? '#FBBF24' : 'transparent'} />
                <Text
                  className={`text-xs ml-1.5 font-black ${
                    activeCategory === 'favorites' ? 'text-amber-300' : 'text-slate-400'
                  }`}
                >
                  ★ Favorites ({favoriteCount})
                </Text>
              </TouchableOpacity>

              {/* All Items Tab */}
              <TouchableOpacity
                style={{ flexShrink: 0 }}
                onPress={() => setActiveCategory('all')}
                className={`mr-2 px-4 py-1.5 rounded-full border shadow-sm ${
                  activeCategory === 'all'
                    ? 'bg-[#5D3FD3] border-purple-400 shadow-purple-500/30'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <Text
                  className={`text-xs font-black ${
                    activeCategory === 'all' ? 'text-white' : 'text-slate-400'
                  }`}
                >
                  All ({items.length})
                </Text>
              </TouchableOpacity>

              {/* Category Tabs */}
              {categories.map(cat => {
                const count = items.filter(i => i.categoryId === cat.id).length;
                const isSelected = activeCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={{ flexShrink: 0 }}
                    onPress={() => setActiveCategory(cat.id)}
                    className={`mr-2 px-3.5 py-1.5 rounded-full border shadow-sm ${
                      isSelected
                        ? 'bg-[#5D3FD3] border-purple-400 shadow-purple-500/30'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        isSelected ? 'text-white font-black' : 'text-slate-400 font-semibold'
                      }`}
                    >
                      {cat.name} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Items List (Grid or Lines) */}
          <FlatList
            key={viewMode === 'grid' ? `grid-${numColumns}` : 'lines'}
            data={filteredItems}
            numColumns={numColumns}
            keyExtractor={(item, index) => `${item.id || 'item'}-${index}`}
            renderItem={viewMode === 'grid' ? renderGridCard : renderLineCard}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={5}
            removeClippedSubviews={false}
            showsVerticalScrollIndicator={true}
            style={{ flex: 1 }}
            className="flex-1"
            updateCellsBatchingPeriod={50}
            contentContainerStyle={{
              padding: viewMode === 'grid' ? 10 : 16,
              paddingBottom: isSplitView ? Math.max(insets.bottom + 24, 40) : Math.max(insets.bottom + 170, 200)
            }}
            ListEmptyComponent={
              <View className="py-16 items-center">
                {activeCategory === 'favorites' ? (
                  <View className="items-center">
                    <Star size={36} color="#F59E0B" />
                    <Text className="text-white font-bold text-sm mt-3">No Favorite Items Starred</Text>
                    <Text className="text-slate-400 text-xs mt-1 text-center px-6">
                      Star your most popular favorite items in Menu Management for rapid 1-touch ordering!
                    </Text>
                  </View>
                ) : (
                  <View className="items-center">
                    <ShoppingBag size={36} color="#475569" />
                    <Text className="text-slate-400 text-xs mt-3">No menu items found in this section</Text>
                  </View>
                )}
              </View>
            }
          />
        </View>

        {/* Right Split Panel for POS */}
        {isSplitView && renderSplitCartPanel()}
      </View>

      {/* Variant Selection Modal */}
        {selectedItemForVariants && (
          <Modal visible={true} transparent animationType="slide">
            <View className="flex-1 justify-center items-center bg-black/75 p-4">
              <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
                <View className="flex-row justify-between items-center pb-3 mb-3 border-b border-slate-800">
                  <View className="flex-1 mr-2">
                    <Text className="text-white font-black text-lg">{selectedItemForVariants.name}</Text>
                    <Text className="text-slate-400 text-xs">Select portion size & quantity:</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedItemForVariants(null)} className="p-1.5 bg-slate-800 rounded-full">
                    <X size={18} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                <View className="mb-4">
                  {(() => {
                    const avail = getAvailableStock(selectedItemForVariants);
                    return selectedItemForVariants.variants?.map(v => {
                      const deduction = typeof v.portionDeduction === 'number' ? v.portionDeduction : 1;
                      const canFulfill = selectedItemForVariants.isAvailable !== false && (!selectedItemForVariants.trackInventory || (avail >= deduction));
                      const variantItemId = `${selectedItemForVariants.id}_${v.name}`;
                      const inCart = cartItems.find(i => i.itemId === variantItemId || (i.itemId === selectedItemForVariants.id && (i.variantId === v.id || i.variantName === v.name)));
                      const vQty = inCart ? inCart.qty : 0;

                      return (
                        <View
                          key={v.id}
                          className={`flex-row justify-between items-center p-3 rounded-2xl border mb-2.5 ${
                            vQty > 0
                              ? 'bg-purple-950/20 border-purple-500/40'
                              : canFulfill
                              ? 'bg-slate-800/80 border-slate-700'
                              : 'bg-slate-900 border-slate-800 opacity-40'
                          }`}
                        >
                          <View className="flex-1 mr-2">
                            <Text className="text-white font-bold text-sm">{v.name}</Text>
                            <Text className="text-indigo-400 font-bold text-xs mt-0.5">₹{v.price}</Text>
                            {selectedItemForVariants.trackInventory && (
                              <Text className="text-slate-400 text-[10px] mt-0.5">
                                Deducts: {deduction} {selectedItemForVariants.stockUnit || 'kg'}
                              </Text>
                            )}
                          </View>

                          {vQty > 0 ? (
                            <View className="flex-row items-center bg-slate-900 rounded-xl p-1 border border-purple-500/40">
                              <TouchableOpacity
                                className="w-8 h-8 rounded-lg bg-slate-800 items-center justify-center active:opacity-80"
                                onPress={() => {
                                  if (!checkCanEditCart()) return;
                                  if (vQty > 1) {
                                    updateQuantity(tableNo, variantItemId, vQty - 1);
                                  } else {
                                    removeItem(tableNo, variantItemId);
                                  }
                                }}
                              >
                                <Text className="text-white font-bold text-base">-</Text>
                              </TouchableOpacity>
                              <Text className="w-8 text-center text-white font-black text-sm">{vQty}</Text>
                              <TouchableOpacity
                                className="w-8 h-8 rounded-lg bg-[#5D3FD3] items-center justify-center active:opacity-80"
                                disabled={!canFulfill}
                                onPress={() => {
                                  if (!checkCanEditCart()) return;
                                  if (!canFulfill) {
                                    toast.warning('No additional stock available for this variant.', 'Out of Stock');
                                    return;
                                  }
                                  updateQuantity(tableNo, variantItemId, vQty + 1);
                                }}
                              >
                                <Text className="text-white font-bold text-base">+</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <TouchableOpacity
                              disabled={!canFulfill}
                              onPress={() => {
                                if (!checkCanEditCart()) return;
                                addItem(tableNo, {
                                  itemId: variantItemId,
                                  baseItemId: selectedItemForVariants.id,
                                  itemName: selectedItemForVariants.name,
                                  price: v.price,
                                  qty: 1,
                                  variantName: v.name,
                                  portionDeduction: deduction,
                                });
                              }}
                              className={`px-3.5 py-2 rounded-xl ${
                                canFulfill ? 'bg-[#5D3FD3]' : 'bg-slate-800'
                              }`}
                            >
                              <Text className={`font-bold text-xs ${canFulfill ? 'text-white' : 'text-slate-400'}`}>
                                {canFulfill ? '+ Add' : 'Out of Stock'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    });
                  })()}
                </View>

                <Button title="Done" onPress={() => setSelectedItemForVariants(null)} />
              </View>
            </View>
          </Modal>
        )}
      
        {/* Mobile Floating Bottom Cart Bar (Fixed clean layout) */}
      {!isSplitView && cartItemCount > 0 && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-[#0F172A] border-t border-slate-800 px-4 pt-3 shadow-2xl"
          style={{ paddingBottom: Math.max(insets.bottom + 8, 20) }}
        >
          {isBillPrinted && (
            <View className={`mb-2 py-1 px-2.5 rounded-xl border flex-row items-center ${
              isManagerOrAdmin ? 'bg-amber-500/15 border-amber-500/30' : 'bg-rose-500/15 border-rose-500/30'
            }`}>
              {isManagerOrAdmin ? (
                <ShieldCheck size={12} color="#F59E0B" />
              ) : (
                <Lock size={12} color="#F43F5E" />
              )}
              <Text className={`text-[10px] font-bold ml-1.5 flex-1 ${isManagerOrAdmin ? 'text-amber-300' : 'text-rose-300'}`} numberOfLines={1}>
                {isManagerOrAdmin ? `Bill #${activePrintedBillNo || ''} Printed • Manager Edit Active` : `Bill #${activePrintedBillNo || ''} Printed • Locked to Admin/Manager`}
              </Text>
            </View>
          )}

          {/* Top Info Strip: Item count, order type badge & Total - clean non-colliding layout */}
          <View className="flex-row items-center justify-between mb-2.5">
            <View className="flex-row items-center gap-1.5 flex-1 mr-2">
              <View className="bg-indigo-500/20 px-2 py-0.5 rounded-md border border-indigo-500/30">
                <Text className="text-indigo-300 text-xs font-black" numberOfLines={1}>
                  {tableNo ? `Table ${tableNo}` : (orderType === 'PICKUP' ? 'Pick Up' : (orderType === 'COUNTER' ? 'Counter' : 'Takeaway'))}
                </Text>
              </View>
              <Text className="text-slate-300 text-xs font-semibold" numberOfLines={1}>
                • {cartItemCount} item{cartItemCount > 1 ? 's' : ''} in cart
              </Text>
            </View>

            <View className="flex-row items-baseline gap-1 bg-slate-800/90 px-2.5 py-1 rounded-xl border border-slate-700/60">
              <Text className="text-slate-400 text-[10px] uppercase font-bold">Total:</Text>
              <Text className="text-emerald-400 font-black text-lg">₹{cartTotal.toFixed(2)}</Text>
            </View>
          </View>

          {/* Action Buttons Row: Equal width side-by-side or full width */}
          <View className="flex-row gap-2">
            {isDualPrinterMode && unsentItems.length > 0 ? (
              <View className="flex-1 flex-row gap-2">
                <TouchableOpacity
                  onPress={handleSendToKitchen}
                  disabled={isSendingKOT}
                  className="flex-1 bg-amber-500/20 border border-amber-500/40 py-3 rounded-2xl flex-row items-center justify-center active:opacity-80"
                >
                  {isSendingKOT ? (
                    <ActivityIndicator size="small" color="#F59E0B" />
                  ) : (
                    <View className="flex-row items-center">
                      <Send size={15} color="#FBBF24" />
                      <Text className="text-amber-300 font-black text-xs ml-1.5" numberOfLines={1}>
                        Send KOT ({unsentItems.reduce((s, i) => s + i.qty, 0)})
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setMobileCartOpen(true)}
                  className="flex-1 bg-[#5D3FD3] py-3 rounded-2xl flex-row items-center justify-center active:opacity-80 shadow-md shadow-purple-500/30"
                >
                  <ShoppingBag size={15} color="white" />
                  <Text className="text-white font-black text-xs ml-1.5" numberOfLines={1}>
                    {paymentsEnabled ? "View Cart & Pay →" : "View & Send KOT →"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setMobileCartOpen(true)}
                className="flex-1 bg-[#5D3FD3] py-3.5 rounded-2xl flex-row items-center justify-center active:opacity-80 shadow-md shadow-purple-500/30"
              >
                <ShoppingBag size={16} color="white" />
                <Text className="text-white font-black text-sm ml-2">
                  View Cart & Pay (₹{cartTotal.toFixed(2)}) →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Mobile Cart Slide-over Panel (Matches Desktop Right Panel on Phone) */}
      {!isSplitView && isMobileCartOpen && (
        <Modal
          visible={isMobileCartOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setMobileCartOpen(false)}
        >
          <View className="flex-1 bg-black/75 justify-end sm:justify-center sm:items-center">
            {/* Backdrop tap to dismiss */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setMobileCartOpen(false)}
              className="flex-1 w-full"
            />

            <View
              className="bg-[#0F172A] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl flex-col max-h-[90%] sm:max-h-[85%]"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              {/* Top Drag Handle Indicator */}
              <View className="items-center pt-2.5 pb-1">
                <View className="w-12 h-1.5 bg-slate-700/80 rounded-full" />
              </View>

              {/* Panel Header */}
              <View className="flex-row items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/40">
                <View className="flex-row items-center flex-1 mr-2">
                  <View className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 items-center justify-center mr-2.5">
                    <ShoppingBag size={16} color="#A855F7" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-black text-base" numberOfLines={1}>
                      {tableNo === 0
                        ? (orderType === 'PICKUP' ? 'Pick Up Cart' : (orderType === 'COUNTER' ? 'Quick Sale Cart' : 'Takeaway Cart'))
                        : `Table ${tableNo} Cart`}
                    </Text>
                    <Text className="text-slate-400 text-xs">
                      {cartItemCount} item{cartItemCount === 1 ? '' : 's'} selected
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-2">
                  {cartItems.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        if (!checkCanEditCart()) return;
                        clearCart(tableNo);
                      }}
                      className="px-2.5 py-1.5 bg-rose-500/15 border border-rose-500/30 rounded-xl active:opacity-80"
                    >
                      <Text className="text-rose-300 text-xs font-bold">Clear</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => setMobileCartOpen(false)}
                    className="p-1.5 bg-slate-800 border border-slate-700 rounded-full ml-1 active:opacity-80"
                  >
                    <X size={18} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Printed Bill Alert Banner */}
              {isBillPrinted && (
                <View className={`mx-4 mt-3 p-2.5 rounded-xl border flex-row items-center ${
                  isManagerOrAdmin ? 'bg-amber-500/15 border-amber-500/30' : 'bg-rose-500/15 border-rose-500/30'
                }`}>
                  {isManagerOrAdmin ? <ShieldCheck size={16} color="#F59E0B" /> : <Lock size={16} color="#F43F5E" />}
                  <View className="ml-2 flex-1">
                    <Text className={`text-xs font-black ${isManagerOrAdmin ? 'text-amber-300' : 'text-rose-300'}`}>
                      {isManagerOrAdmin ? `🧾 Bill #${activePrintedBillNo || ''} Printed (Manager Active)` : `🔒 Bill #${activePrintedBillNo || ''} Printed • Locked`}
                    </Text>
                    <Text className="text-slate-400 text-[10px] mt-0.5">
                      {isManagerOrAdmin ? 'Authorized to edit this printed bill.' : 'Locked to Admin/Manager.'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Cart Items ScrollView */}
              <ScrollView className="flex-1 px-4 my-2" showsVerticalScrollIndicator={true}>
                {cartItems.length === 0 ? (
                  <View className="py-14 items-center justify-center">
                    <View className="w-16 h-16 rounded-full bg-slate-800/80 items-center justify-center mb-3">
                      <ShoppingBag size={28} color="#64748B" />
                    </View>
                    <Text className="text-white font-bold text-sm">Your cart is empty</Text>
                    <Text className="text-slate-400 text-xs mt-1 text-center max-w-[240px]">
                      Tap items on the menu to add them to this order.
                    </Text>
                  </View>
                ) : (
                  cartItems.map((item, index) => (
                    <View
                      key={`${item.itemId}_${item.variantId || item.variantName || index}`}
                      className="flex-row items-center justify-between py-3 border-b border-slate-800/60"
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-white text-sm font-bold leading-snug" numberOfLines={1}>
                          {item.itemName}
                        </Text>
                        <View className="flex-row items-center gap-1.5 mt-0.5">
                          {item.variantName && (
                            <View className="bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30">
                              <Text className="text-purple-300 text-[10px] font-bold">{item.variantName}</Text>
                            </View>
                          )}
                          <Text className="text-slate-400 text-xs">₹{item.price} each</Text>
                          <Text className="text-emerald-400 text-xs font-bold">• ₹{(item.price * item.qty).toFixed(2)}</Text>
                        </View>
                      </View>

                      {/* Stepper */}
                      <View className="flex-row items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
                        <TouchableOpacity
                          className="w-7 h-7 rounded-lg bg-slate-700 items-center justify-center active:opacity-80"
                          onPress={() => {
                            if (!checkCanEditCart()) return;
                            if (item.qty > 1) updateQuantity(tableNo, item.itemId, item.qty - 1, item.variantId || item.variantName);
                            else removeItem(tableNo, item.itemId, item.variantId || item.variantName);
                          }}
                        >
                          <Text className="text-white font-bold text-sm">-</Text>
                        </TouchableOpacity>
                        <Text className="w-7 text-center text-white font-black text-xs">{item.qty}</Text>
                        <TouchableOpacity
                          className="w-7 h-7 rounded-lg bg-[#5D3FD3] items-center justify-center active:opacity-80 shadow-sm shadow-purple-500/30"
                          onPress={() => handleIncrementCartItem(item)}
                        >
                          <Text className="text-white font-bold text-sm">+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              {/* Panel Footer */}
              <View className="px-5 pt-3.5 border-t border-slate-800 bg-slate-950/70">
                <View className="flex-row items-baseline justify-between mb-3">
                  <View>
                    <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">Total Payable</Text>
                    <Text className="text-slate-500 text-[11px]">{cartItemCount} item{cartItemCount === 1 ? '' : 's'}</Text>
                  </View>
                  <Text className="text-emerald-400 font-black text-2xl">₹{cartTotal.toFixed(2)}</Text>
                </View>

                {/* Buttons */}
                <View className="gap-2">
                  {isDualPrinterMode && unsentItems.length > 0 && (
                    <TouchableOpacity
                      onPress={handleSendToKitchen}
                      disabled={isSendingKOT}
                      className="w-full bg-amber-500/20 border border-amber-500/40 py-3 rounded-2xl flex-row items-center justify-center active:opacity-80"
                    >
                      {isSendingKOT ? (
                        <ActivityIndicator size="small" color="#F59E0B" />
                      ) : (
                        <View className="flex-row items-center">
                          <Send size={16} color="#FBBF24" />
                          <Text className="text-amber-300 font-black text-xs sm:text-sm ml-2">
                            Send KOT to Kitchen ({unsentItems.reduce((s, i) => s + i.qty, 0)} items)
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      setMobileCartOpen(false);
                      navigation.navigate(Routes.CART, { tableNo, orderType });
                    }}
                    disabled={cartItems.length === 0}
                    className={`w-full py-3.5 rounded-2xl flex-row items-center justify-center shadow-lg active:opacity-90 ${
                      cartItems.length > 0
                        ? 'bg-[#5D3FD3] shadow-purple-500/30'
                        : 'bg-slate-800 border border-slate-700 opacity-50'
                    }`}
                  >
                    <CreditCard size={18} color="white" />
                    <Text className="text-white font-black text-sm sm:text-base ml-2">
                      {paymentsEnabled ? `Proceed to Payment (₹${cartTotal.toFixed(2)}) →` : "Proceed & Send KOT →"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setMobileCartOpen(false)}
                    className="py-2 items-center justify-center"
                  >
                    <Text className="text-slate-400 font-bold text-xs">← Continue Adding Items</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Branch Selection Modal for Quick Sale Direct Mode */}
      {isDirect && (
        <Modal visible={isBranchModalOpen} transparent animationType="fade">
          <View className="flex-1 bg-black/70 items-center justify-center p-5">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
                <View className="flex-row items-center">
                  <MapPin size={18} color="#A855F7" />
                  <Text className="text-white font-black text-lg ml-2">Select Active Branch</Text>
                </View>
                <TouchableOpacity onPress={() => setBranchModalOpen(false)} className="p-1 rounded-full bg-slate-800">
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView className="my-3 max-h-72">
                {locations.map(loc => {
                  const isSelected = activeLocationId === loc.id;
                  const isDisabled = loc.status === 'DISABLED';
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      disabled={isDisabled}
                      onPress={() => handleSelectBranch(loc)}
                      className={'p-3.5 mb-2 rounded-2xl border flex-row items-center justify-between ' + (
                        isSelected
                          ? 'bg-purple-950/40 border-[#5D3FD3]'
                          : isDisabled
                          ? 'bg-slate-950/40 border-slate-850 opacity-40'
                          : 'bg-slate-800/80 border-slate-700/70'
                      )}
                    >
                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center">
                          <Text className={'font-bold text-sm ' + (isSelected ? 'text-purple-300' : 'text-white')}>
                            {loc.name}
                          </Text>
                          {isDisabled && (
                            <View className="ml-2 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30">
                              <Text className="text-rose-300 text-[9px] font-bold">DISABLED</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>{loc.address}</Text>
                      </View>
                      {isSelected && <CheckCircle2 size={18} color="#A855F7" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
};
