import { toast } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirm';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Modal, ScrollView, Alert, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Search, X, Settings, ShoppingBag, Send, CreditCard, ChevronLeft, ChevronRight, Star, Sparkles, CheckCircle2, Package, Lock, ShieldCheck, LayoutGrid, List, Menu as MenuIcon, MapPin, Receipt, Bike, TrendingUp, Sun, Moon, Minus, Plus, Trash2 } from 'lucide-react-native';
import { HamburgerMenu } from '../../components/common/HamburgerMenu';
import { ProductCard } from './components/ProductCard';
import { VariantSelectionSheet } from './components/VariantSelectionSheet';
import { ItemCustomizationSheet } from './components/ItemCustomizationSheet';
import { useThemeStore } from '../../store/theme.store';
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
import { MenuItem, MenuItemVariant, getItemInteractionType } from '../../types/menu.types';
import { SelectedCustomizationOption } from '../../types/order.types';
import { getAutoMenuItemImage } from '../../utils/foodImageResolver';

interface MenuScreenProps {
  isDirectHome?: boolean;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({ isDirectHome = false }) => {
  const insets = useSafeAreaInsets();
  let routeParams: any = {};
  try {
    const route = useRoute<any>();
    routeParams = route?.params || {};
  } catch (e) { }

  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { tenant, activeLocationId, setActiveLocationId, features, branding, locations, getActiveLocation } = useTenantStore();
  const activeLocation = getActiveLocation();
  const isClientAdmin = user?.role === 'CLIENT_ADMIN' || user?.role === 'ADMIN' || user?.role === 'TENANT_SUPER_ADMIN' || user?.role === 'admin';

  // Quick Sale direct counter mode active if requested, or if both dine-in floor and pickup are turned off
  const isDirect = isDirectHome || routeParams.isDirectHome || (features.dineInEnabled === false && features.pickupEnabled === false && (!routeParams.tableNo || routeParams.tableNo === 0));
  const tableNo = isDirect ? 0 : (routeParams.tableNo ?? 0);
  const orderType = isDirect ? 'COUNTER' : (routeParams.orderType || (tableNo === 0 ? 'PICKUP' : 'DINE_IN'));

  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isBranchModalOpen, setBranchModalOpen] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [showImages, setShowImages] = useState<boolean>(
    features.autoMenuImagesEnabled !== undefined ? Boolean(features.autoMenuImagesEnabled) : (isDirect ? true : false)
  );

  useEffect(() => {
    if (features.autoMenuImagesEnabled !== undefined) {
      setShowImages(Boolean(features.autoMenuImagesEnabled));
    }
  }, [features.autoMenuImagesEnabled]);

  const categoryScrollRef = React.useRef<any>(null);
  const categoryScrollOffset = React.useRef<number>(0);

  const { categories, items, subscribeToMenu } = useMenuStore();
  const paymentsEnabled = features.paymentsEnabled !== false;
  const { settings: printerSettings } = usePrinterStore();
  const rawWorkflowMode = printerSettings.printerWorkflowMode || 'DUAL_PRINTER';
  const isDualPrinterMode = rawWorkflowMode === 'DUAL_PRINTER' || rawWorkflowMode === 'RESTAURANT';
  const isSingleKotMode = rawWorkflowMode === 'SINGLE_KOT_ONLY' || rawWorkflowMode === 'TOKEN_ONLY';
  const { carts, setCarts, addItem, removeItem, updateQuantity, markAsSent, clearCart } = useCartStore();
  const { tables } = useTableStore();
  const { orders } = useOrderStore();
  const { settings } = usePrinterStore();
  const { isSplitView, isLargePOS } = useResponsiveLayout();
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  // Role check: Only Admin and Manager are allowed to edit items once bill has been printed
  const isManagerOrAdmin = Boolean(
    !user?.role ||
    [
      'ADMIN',
      'admin',
      'CLIENT_ADMIN',
      'TENANT_SUPER_ADMIN',
      'PLATFORM_ADMIN',
      'MANAGER',
      'manager',
      'BILLER',
      'biller',
      'CASHIER',
      'cashier',
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

  const checkCanEditCart = (): boolean => true;

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemForVariants, setSelectedItemForVariants] = useState<MenuItem | null>(null);
  const [selectedItemForCustomization, setSelectedItemForCustomization] = useState<MenuItem | null>(null);
  const [isSendingKOT, setIsSendingKOT] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'lines'>('grid');

  useEffect(() => {
    AsyncStorage.getItem('@zentiq_pos_menu_view_mode')
      .then((saved) => {
        if (saved === 'grid' || saved === 'lines') {
          setViewMode(saved);
        }
      })
      .catch(() => { });
  }, []);

  const handleSetViewMode = (mode: 'grid' | 'lines') => {
    setViewMode(mode);
    AsyncStorage.setItem('@zentiq_pos_menu_view_mode', mode).catch(() => { });
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
              sentQty: Number(it.sentQty ?? 0),
              variantId: it.variantId || null,
              variantName: it.variantName || null,
              note: it.note || '',
            };
          });
          useCartStore.getState().syncRunningOrderItems(tableNo, formatted);
          return;
        }

        if (cartItems.length === 0) {
          const currentTable = useTableStore.getState().tables.find((t: any) => Number(t.tableNo) === Number(tableNo));
          if (currentTable && currentTable.status !== 'available' && (currentTable as any).cartItems && (currentTable as any).cartItems.length > 0) {
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

  const handleClearCart = () => {
    const hasSentKitchenItems = cartItems.some(i => (i.sentQty || 0) > 0);
    const hasUnsentDraftItems = unsentItems.length > 0;

    if (tableNo !== 0 && hasSentKitchenItems) {
      if (hasUnsentDraftItems) {
        confirmDialog({
          title: 'Discard Draft Items?',
          message: `Table ${tableNo} has active orders in kitchen. Do you want to discard the ${unsentItems.reduce((s, i) => s + i.qty, 0)} unsent draft additions, or cancel the entire table order?`,
          confirmText: 'Discard Draft Additions',
          cancelText: 'Cancel Entire Order',
          destructive: true,
          onConfirm: () => {
            const confirmedOnly = cartItems
              .filter(i => (i.sentQty || 0) > 0)
              .map(i => ({ ...i, qty: i.sentQty! }));
            setCarts({ ...carts, [tableNo]: confirmedOnly });
            toast.info(`Draft additions removed for Table ${tableNo}`);
          },
          onCancel: () => {
            confirmDialog({
              title: 'Cancel Table Order?',
              message: `This will permanently cancel all kitchen items for Table ${tableNo} and free the table. Are you sure?`,
              confirmText: 'Yes, Cancel Order',
              cancelText: 'Back',
              destructive: true,
              onConfirm: () => {
                clearCart(tableNo);
                toast.info(`Table ${tableNo} order cancelled and table freed.`);
              },
            });
          },
        });
      } else {
        confirmDialog({
          title: 'Cancel Table Order?',
          message: `Table ${tableNo} has ${cartItems.length} item(s) sent to kitchen. Are you sure you want to cancel the entire order and free Table ${tableNo}?`,
          confirmText: 'Yes, Cancel Order & Free Table',
          cancelText: 'Keep Order',
          destructive: true,
          onConfirm: () => {
            clearCart(tableNo);
            toast.info(`Table ${tableNo} order cancelled and table freed.`);
          },
        });
      }
    } else {
      confirmDialog({
        title: 'Clear Cart',
        message: tableNo !== 0
          ? `Are you sure you want to clear all items from Table ${tableNo}?`
          : 'Are you sure you want to clear the cart?',
        confirmText: 'Yes, Clear',
        cancelText: 'Cancel',
        destructive: true,
        onConfirm: () => {
          clearCart(tableNo);
          toast.info(tableNo !== 0 ? `✓ Table ${tableNo} cart cleared` : '✓ Cart cleared');
        },
      });
    }
  };

  const handleSendToKitchen = () => {
    if (unsentItems.length === 0) return;
    if (!activeLocationId) {
      toast.warning('Please select an operating branch on home screen first.', 'Branch Required');
      return;
    }

    // 1. Instant Optimistic UI Response (0ms perceptible lag)
    const itemsToDispatch = [...unsentItems];
    markAsSent(tableNo);
    const totalCount = itemsToDispatch.reduce((s, i) => s + i.qty, 0);
    toast.success(`Dispatched ${totalCount} item(s) to kitchen!`, 'KOT Sent');

    // 2. Background Dispatch: Firestore sequence, sync & Thermal Print (Non-blocking)
    (async () => {
      try {
        const kotNo = await DBServices.getNextSequenceNumber(tenant?.id, activeLocationId || undefined);

        if (tableNo !== 0) {
          DBServices.updateTableStatusByNo(tableNo, 'running', tenant?.id, activeLocationId || undefined).catch(() => { });
        }

        // Persist KOT items to Firestore running order
        try {
          const { useOrderStore } = require('../../store/order.store');
          const existingRunning = useOrderStore.getState().orders.find(
            (o: any) => (o.status === 'RUNNING' || o.status === 'running') && Number(o.tableNo) === Number(tableNo)
          );
          if (existingRunning && existingRunning.id) {
            // Note: markAsSent(tableNo) has already updated all items with sentQty = qty in Firestore & orderStore.
            // Update kotNo, confirm status is RUNNING, and clear any previous printed bill since new items were dispatched.
            await DBServices.updateOrder(
              existingRunning.id,
              {
                kotNo,
                status: 'RUNNING',
                billPrinted: false,
                billNo: null,
                updatedAt: new Date(),
              },
              tenant?.id,
              existingRunning.locationId || activeLocationId || undefined
            );
            if (tableNo !== 0) {
              DBServices.updateTableBillPrinted(tableNo, false, undefined, tenant?.id, activeLocationId || undefined).catch(() => { });
            }
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
              items: cartItems.map(i => ({ ...i, sentQty: i.qty })),
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

        if (!printSuccess && printErrorMsg) {
          toast.warning(
            `KOT #${kotNo} saved, but kitchen printer is offline: ${printErrorMsg}`,
            'Printer Offline'
          );
        }
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

  const handleDecrementCartItem = (cItem: any) => {
    if (!checkCanEditCart()) return;
    if (cItem.qty > 1) {
      updateQuantity(
        tableNo,
        cItem.itemId,
        cItem.qty - 1,
        cItem.variantId || cItem.variantName,
        cItem.customizationKey
      );
    } else {
      removeItem(
        tableNo,
        cItem.itemId,
        cItem.variantId || cItem.variantName,
        cItem.customizationKey
      );
    }
  };

  const handleCardPress = useCallback((item: MenuItem) => {
    if (!checkCanEditCart()) return;
    if (item.isAvailable === false) {
      toast.warning(`"${item.name}" is marked out of stock.`, 'Out of Stock');
      return;
    }
    const interaction = getItemInteractionType(item);
    if (interaction === 'DIRECT_ADD') {
      handleAddSimpleItem(item);
    } else if (interaction === 'VARIANT_SELECTION') {
      setSelectedItemForVariants(item);
    } else if (interaction === 'CUSTOMIZABLE') {
      setSelectedItemForCustomization(item);
    }
  }, [checkCanEditCart, handleAddSimpleItem]);

  const handleDecrementCardItem = useCallback((item: MenuItem, currentQty: number) => {
    if (!checkCanEditCart()) return;
    if (currentQty > 1) {
      updateQuantity(tableNo, item.id, currentQty - 1);
    } else {
      removeItem(tableNo, item.id);
    }
  }, [checkCanEditCart, tableNo, updateQuantity, removeItem]);

  const handleVariantAddToCart = useCallback((variant: MenuItemVariant, qty: number) => {
    if (!selectedItemForVariants || !checkCanEditCart()) return;
    const variantItemId = `${selectedItemForVariants.id}_${variant.name}`;
    const deduction = typeof variant.portionDeduction === 'number' ? variant.portionDeduction : 1;
    addItem(tableNo, {
      itemId: variantItemId,
      baseItemId: selectedItemForVariants.id,
      itemName: selectedItemForVariants.name,
      price: variant.price,
      qty,
      variantId: variant.id,
      variantName: variant.name,
      portionDeduction: deduction,
    });
    toast.success(`Added ${qty}x ${selectedItemForVariants.name} (${variant.name})`, 'Added to Order');
  }, [selectedItemForVariants, checkCanEditCart, tableNo, addItem]);

  const handleCustomizationAddToCart = useCallback((
    item: MenuItem,
    qty: number,
    selectedOptions: SelectedCustomizationOption[],
    customizationKey: string,
    unitPrice: number,
    specialNote?: string
  ) => {
    if (!checkCanEditCart()) return;
    const customItemId = customizationKey ? `${item.id}_${customizationKey}` : item.id;
    addItem(tableNo, {
      itemId: customItemId,
      baseItemId: item.id,
      itemName: item.name,
      price: unitPrice,
      qty,
      selectedOptions,
      customizationKey,
      note: specialNote || '',
      portionDeduction: 1,
    });
    toast.success(`Added ${qty}x ${item.name} (Customized)`, 'Added to Order');
  }, [checkCanEditCart, tableNo, addItem]);

  const renderGridCard = useCallback(({ item }: { item: MenuItem }) => {
    const itemNameNorm = (item.name || '').trim().toLowerCase();
    const matchingCartItems = cartItems.filter(i =>
      i.itemId === item.id ||
      (i as any).baseItemId === item.id ||
      (i.itemName && i.itemName.trim().toLowerCase() === itemNameNorm)
    );
    const qty = matchingCartItems.reduce((sum, i) => sum + (i.qty || 0), 0);
    const availStock = getAvailableStock(item);
    const isExplicitlyOutOfStock = item.isAvailable === false;
    const isOutOfStock = Boolean(isExplicitlyOutOfStock || (item.trackInventory && availStock <= 0));
    const lowStockText = !isExplicitlyOutOfStock && item.trackInventory && !isOutOfStock && availStock <= (item.lowStockThreshold || 2)
      ? `Low: ${availStock.toFixed(availStock % 1 === 0 ? 0 : 2)} ${item.stockUnit || 'kg'}`
      : null;

    const colWidth = `${100 / numColumns}%`;
    const itemCat = categories.find(c => c.id === item.categoryId);

    return (
      <ProductCard
        item={item}
        cartQty={qty}
        isOutOfStock={isOutOfStock}
        lowStockText={lowStockText}
        onPress={handleCardPress}
        onIncrement={handleIncrementSimpleItem}
        onDecrement={handleDecrementCardItem}
        viewMode="grid"
        cardWidth={colWidth}
        showImage={showImages}
        categoryName={itemCat?.name}
      />
    );
  }, [cartItems, numColumns, handleCardPress, handleIncrementSimpleItem, handleDecrementCardItem, items, showImages, categories]);

  const renderLineCard = useCallback(({ item }: { item: MenuItem }) => {
    const itemNameNorm = (item.name || '').trim().toLowerCase();
    const matchingCartItems = cartItems.filter(i =>
      i.itemId === item.id ||
      (i as any).baseItemId === item.id ||
      (i.itemName && i.itemName.trim().toLowerCase() === itemNameNorm)
    );
    const qty = matchingCartItems.reduce((sum, i) => sum + (i.qty || 0), 0);
    const availStock = getAvailableStock(item);
    const isExplicitlyOutOfStock = item.isAvailable === false;
    const isOutOfStock = Boolean(isExplicitlyOutOfStock || (item.trackInventory && availStock <= 0));
    const lowStockText = !isExplicitlyOutOfStock && item.trackInventory && !isOutOfStock && availStock <= (item.lowStockThreshold || 2)
      ? `Low: ${availStock.toFixed(availStock % 1 === 0 ? 0 : 2)} ${item.stockUnit || 'kg'}`
      : null;
    const itemCat = categories.find(c => c.id === item.categoryId);

    return (
      <ProductCard
        item={item}
        cartQty={qty}
        isOutOfStock={isOutOfStock}
        lowStockText={lowStockText}
        onPress={handleCardPress}
        onIncrement={handleIncrementSimpleItem}
        onDecrement={handleDecrementCardItem}
        viewMode="lines"
        showImage={showImages}
        categoryName={itemCat?.name}
      />
    );
  }, [cartItems, handleCardPress, handleIncrementSimpleItem, handleDecrementCardItem, items, showImages, categories]);

  // Persistent Right Panel for Tablets & iPad POS (Responsive ~32% Width)
  const renderSplitCartPanel = () => (
    <View
      className={`h-full w-full border-l p-4 flex-col justify-between shadow-2xl ${
        isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'
      }`}
    >
      <View className="flex-1">
        {/* Cart Header */}
        <View
          className={`flex-row items-center justify-between pb-3 border-b ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}
        >
          <View className="flex-row items-center gap-2">
            <View className="p-1.5 rounded-lg bg-[#5D3FD3]/20">
              <ShoppingBag size={18} color="#A855F7" />
            </View>
            <View>
              <Text className={`font-black text-base sm:text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {tableNo === 0
                  ? orderType === 'PICKUP'
                    ? 'Pick Up Cart'
                    : orderType === 'COUNTER'
                    ? 'Counter Cart'
                    : 'Takeaway Cart'
                  : `Table ${tableNo} Cart`}
              </Text>
              <Text className="text-slate-400 text-xs">
                {cartItemCount} item{cartItemCount === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          {cartItems.length > 0 && (
            <TouchableOpacity
              onPress={handleClearCart}
              className="px-3 py-1.5 bg-rose-500/15 border border-rose-500/30 rounded-xl active:opacity-75"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text className="text-rose-400 text-xs font-bold">Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {isBillPrinted && (
          <View className="mt-2.5 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex-row items-center">
            <ShieldCheck size={16} color="#F59E0B" />
            <View className="ml-2 flex-1">
              <Text className="text-xs font-black text-amber-300">
                🧾 Bill #{activePrintedBillNo || ''} Printed • Editing Active
              </Text>
              <Text className="text-slate-400 text-[10px] mt-0.5">
                Adding or removing items automatically updates the running order for re-billing.
              </Text>
            </View>
          </View>
        )}

        {/* Cart Items List */}
        <ScrollView className="flex-1 my-3" showsVerticalScrollIndicator={true}>
          {cartItems.length === 0 ? (
            <View className="py-16 items-center justify-center">
              <View
                className={`w-14 h-14 rounded-full items-center justify-center mb-2.5 ${
                  isDark ? 'bg-slate-800/80' : 'bg-slate-100'
                }`}
              >
                <ShoppingBag size={26} color={isDark ? '#64748B' : '#94A3B8'} />
              </View>
              <Text className={`font-bold text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Cart is empty
              </Text>
              <Text className="text-slate-500 text-xs mt-1 text-center max-w-[200px]">
                Tap products on the menu to add them to this order
              </Text>
            </View>
          ) : (
            cartItems.map((item, index) => {
              const itemTotal = item.price * item.qty;
              return (
                <View
                  key={`${item.itemId}_${item.variantId || item.variantName || ''}_${item.customizationKey || ''}_${index}`}
                  className={`py-3 border-b ${
                    isDark ? 'border-slate-800/60' : 'border-slate-200'
                  }`}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-2">
                      <Text
                        className={`text-sm font-bold leading-snug ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                        numberOfLines={2}
                      >
                        {item.itemName}
                      </Text>

                      {/* Variant Badge */}
                      {item.variantName && (
                        <View className="self-start bg-indigo-500/20 px-2 py-0.5 rounded-md border border-indigo-500/30 mt-1">
                          <Text className="text-indigo-400 text-[11px] font-bold">
                            {item.variantName}
                          </Text>
                        </View>
                      )}

                      {/* Customization Options Badges */}
                      {item.selectedOptions && item.selectedOptions.length > 0 && (
                        <View className="flex-row flex-wrap gap-1 mt-1">
                          {item.selectedOptions.map((opt, oIdx) => (
                            <View
                              key={oIdx}
                              className={`px-1.5 py-0.5 rounded border ${
                                isDark
                                  ? 'bg-purple-950/60 border-purple-500/30'
                                  : 'bg-purple-50 border-purple-200'
                              }`}
                            >
                              <Text
                                className={`text-[10px] font-semibold ${
                                  isDark ? 'text-purple-300' : 'text-purple-700'
                                }`}
                              >
                                +{opt.optionName}
                                {opt.price > 0 ? ` (₹${opt.price})` : ''}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {item.note ? (
                        <Text className="text-amber-400 text-[11px] italic mt-1">
                          Note: {item.note}
                        </Text>
                      ) : null}

                      <Text className="text-slate-400 text-xs mt-1">
                        ₹{item.price} × {item.qty} ={' '}
                        <Text className={`font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          ₹{itemTotal.toFixed(2)}
                        </Text>
                      </Text>
                    </View>

                    {/* Smooth Capsule Quantity Stepper */}
                    <View
                      className={`flex-row items-center rounded-full px-1 py-0.5 border shadow-sm ${
                        isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                      }`}
                    >
                      <TouchableOpacity
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full items-center justify-center active:opacity-75 ${
                          isDark ? 'bg-slate-800' : 'bg-slate-100'
                        }`}
                        onPress={() => {
                          if (!checkCanEditCart()) return;
                          if (item.qty > 1) {
                            updateQuantity(
                              tableNo,
                              item.itemId,
                              item.qty - 1,
                              item.variantId || item.variantName,
                              item.customizationKey
                            );
                          } else {
                            removeItem(
                              tableNo,
                              item.itemId,
                              item.variantId || item.variantName,
                              item.customizationKey
                            );
                          }
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Minus size={12} color={isDark ? '#CBD5E1' : '#475569'} strokeWidth={2.5} />
                      </TouchableOpacity>

                      <Text
                        className={`w-6 sm:w-7 text-center font-black text-xs sm:text-sm ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {item.qty}
                      </Text>

                      <TouchableOpacity
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-sm shadow-purple-500/30"
                        onPress={() => handleIncrementCartItem(item)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Plus size={12} color="white" strokeWidth={2.5} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* Cart Footer */}
      <View
        className={`pt-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <View className="flex-row justify-between items-baseline mb-3">
          <View>
            <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">Order Total</Text>
            <Text className="text-slate-500 text-[11px]">{cartItemCount} item{cartItemCount === 1 ? '' : 's'}</Text>
          </View>
          <Text className={`font-black text-2xl ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
            ₹{cartTotal.toFixed(2)}
          </Text>
        </View>

        <View className="flex-row gap-2">
          {isDualPrinterMode && unsentItems.length > 0 && (
            <Button
              title={`Send KOT (${unsentItems.reduce((s, i) => s + i.qty, 0)})`}
              variant="secondary"
              onPress={handleSendToKitchen}
              isLoading={isSendingKOT}
              className="flex-1"
            />
          )}
          <Button
            title={paymentsEnabled ? (isSingleKotMode ? "Checkout & Token" : "Checkout & Pay") : (isSingleKotMode ? "Generate Token" : "View & Send KOT")}
            onPress={() => navigation.navigate(Routes.CART, { tableNo, orderType })}
            disabled={cartItems.length === 0}
            className="flex-1"
          />
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-[#090D1A]' : 'bg-slate-50'}`}>
      <HamburgerMenu isVisible={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Header */}
      <View
        className={`flex-row items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b ${
          isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <View className="flex-row items-center flex-1 min-w-0 mr-2">
          {isDirect ? (
            <TouchableOpacity
              onPress={() => setSidebarOpen(true)}
              className={`p-2 rounded-xl border mr-2.5 active:opacity-80 shrink-0 ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
              }`}
              accessibilityLabel="Open Navigation Menu"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MenuIcon size={18} color={isDark ? '#CBD5E1' : '#475569'} />
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
              className={`p-2 rounded-xl border mr-2.5 active:opacity-80 shrink-0 ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
              }`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={18} color={isDark ? '#CBD5E1' : '#475569'} />
            </TouchableOpacity>
          )}

          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-1.5 flex-nowrap">
              <Text
                className={`font-black text-sm sm:text-base shrink ${isDark ? 'text-white' : 'text-slate-900'}`}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {isDirect
                  ? (branding?.displayName || branding?.businessName || tenant?.businessName || 'Zentiq POS')
                  : (tableNo === 0 ? (orderType === 'PICKUP' ? 'Pick Up Order' : (orderType === 'COUNTER' ? 'Quick Counter' : 'Takeaway Order')) : `Table ${tableNo}`)}
              </Text>
              {isDirect && (
                <View className="bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-full flex-row items-center shrink-0">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
                  <Text className="text-emerald-400 text-[9px] font-bold">Quick Sale</Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center gap-1 mt-0.5">
              {isDirect && isClientAdmin ? (
                <TouchableOpacity
                  onPress={() => setBranchModalOpen(true)}
                  className="flex-row items-center shrink"
                >
                  <MapPin size={10} color="#A855F7" />
                  <Text className="text-purple-400 text-[11px] sm:text-xs font-semibold ml-1 shrink" numberOfLines={1}>
                    {activeLocation?.name || 'Select branch'} ▾
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text className="text-slate-400 text-[11px] sm:text-xs shrink" numberOfLines={1}>
                  {isDirect
                    ? `${activeLocation?.name || 'Main Branch'}`
                    : 'Tap items to add'}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Quick Orders History shortcut for Quick Sale Mode (Desktop / Large POS) */}
          {isDirect && (
            <TouchableOpacity
              onPress={() => navigation.navigate(Routes.ORDERS)}
              className={`hidden md:flex flex-row items-center border px-3 py-1.5 rounded-xl active:opacity-80 ${
                isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <Receipt size={14} color={isDark ? '#CBD5E1' : '#475569'} />
              <Text className={`text-xs font-bold ml-1.5 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                Bill History
              </Text>
            </TouchableOpacity>
          )}

          {/* Cart Button in Header: Opens Dedicated Cart Modal to See Items! */}
          {!isSplitView && (
            <TouchableOpacity
              onPress={() => setIsCartModalOpen(true)}
              className={`px-2.5 py-1.5 rounded-xl flex-row items-center border shadow-sm active:opacity-80 ${
                cartItemCount > 0
                  ? 'bg-[#5D3FD3] border-purple-400 shadow-purple-500/30'
                  : isDark
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-slate-100 border-slate-300'
              }`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="View Cart"
            >
              <ShoppingBag size={15} color={cartItemCount > 0 ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B')} />
              <Text
                className={`font-black text-xs ml-1 ${
                  cartItemCount > 0 ? 'text-white' : (isDark ? 'text-slate-300' : 'text-slate-700')
                }`}
              >
                {cartItemCount > 0 ? `${cartItemCount}` : 'Cart'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Body: iPad Golden Ratio (Left ~68%, Right ~32%) */}
      <View className="flex-1 flex-row">
        {/* Left Section (Menu & Categories ~68% on landscape POS) */}
        <View style={{ flex: isSplitView ? 68 : 100 }}>
          {/* Search Bar & View Mode Toggle (Grid vs Lines) + Food Photos Toggle */}
          <View
            className={`px-4 py-2.5 flex-row items-center gap-2 ${
              isDark ? 'bg-[#090D1A]' : 'bg-slate-50'
            }`}
          >
            <View
              className={`flex-1 flex-row items-center border rounded-xl px-3 py-1.5 ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'
              }`}
            >
              <Search size={16} color={isDark ? '#64748B' : '#94A3B8'} />
              <TextInput
                placeholder="Search menu items..."
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={searchQuery}
                onChangeText={setSearchQuery}
                className={`flex-1 ml-2 text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}
              />
            </View>

            {/* Food Photos Toggle Button (Quick Sale & Menu Touchscreens) */}
            <TouchableOpacity
              onPress={() => setShowImages(!showImages)}
              className={`flex-row items-center border rounded-xl px-2.5 py-1.5 gap-1.5 active:opacity-80 ${
                showImages
                  ? 'bg-pink-600/20 border-pink-500/40 shadow-xs'
                  : isDark
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-300'
              }`}
              accessibilityLabel="Toggle Food Photos"
            >
              <Sparkles size={13} color={showImages ? '#EC4899' : (isDark ? '#94A3B8' : '#64748B')} />
              <Text
                className={`text-[11px] font-bold ${
                  showImages ? 'text-pink-400 font-black' : (isDark ? 'text-slate-400' : 'text-slate-600')
                }`}
              >
                {showImages ? 'Photos ON' : 'Photos'}
              </Text>
            </TouchableOpacity>

            {/* View Mode Toggle */}
            <View
              className={`flex-row items-center border rounded-xl p-0.5 ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'
              }`}
            >
              <TouchableOpacity
                onPress={() => handleSetViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-lg flex-row items-center gap-1.5 ${
                  viewMode === 'grid' ? 'bg-[#5D3FD3]' : 'bg-transparent'
                }`}
                accessibilityLabel="Grid View"
              >
                <LayoutGrid size={13} color={viewMode === 'grid' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B')} />
                <Text
                  className={`text-[11px] font-bold ${
                    viewMode === 'grid' ? 'text-white' : (isDark ? 'text-slate-400' : 'text-slate-600')
                  }`}
                >
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
                <List size={13} color={viewMode === 'lines' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B')} />
                <Text
                  className={`text-[11px] font-bold ${
                    viewMode === 'lines' ? 'text-white' : (isDark ? 'text-slate-400' : 'text-slate-600')
                  }`}
                >
                  Lines
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sub-menu Horizontal Category Bar with Favorites */}
          <View
            className={`py-2 px-1 sm:px-2 border-b shadow-sm flex-row items-center ${
              isDark ? 'bg-[#0B101E] border-slate-800/80' : 'bg-white border-slate-200'
            }`}
          >
            {/* Scroll Left Button (Mouse / Touchpad / Desktop Quick Navigation) */}
            <TouchableOpacity
              onPress={() => {
                categoryScrollOffset.current = Math.max(0, categoryScrollOffset.current - 240);
                categoryScrollRef.current?.scrollTo({ x: categoryScrollOffset.current, animated: true });
              }}
              className={`p-1.5 sm:p-2 rounded-full mr-1 items-center justify-center border shadow-xs ${
                isDark
                  ? 'bg-slate-900 border-slate-800 active:bg-slate-800'
                  : 'bg-slate-100 border-slate-200 active:bg-slate-200'
              }`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Scroll categories left"
            >
              <ChevronLeft size={16} color={isDark ? '#CBD5E1' : '#475569'} strokeWidth={2.5} />
            </TouchableOpacity>

            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                categoryScrollOffset.current = e.nativeEvent.contentOffset.x;
              }}
              scrollEventThrottle={16}
              contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}
              {...({
                onWheel: (e: any) => {
                  const delta = e?.nativeEvent?.deltaY || e?.deltaY;
                  if (delta && categoryScrollRef.current) {
                    categoryScrollOffset.current = Math.max(0, categoryScrollOffset.current + delta);
                    categoryScrollRef.current.scrollTo({ x: categoryScrollOffset.current, animated: false });
                  }
                }
              } as any)}
            >
              {/* Starred Favorites Tab */}
              <TouchableOpacity
                style={{ flexShrink: 0 }}
                onPress={() => setActiveCategory('favorites')}
                className={`mr-2 px-3.5 py-1.5 rounded-full flex-row items-center border shadow-sm ${
                  activeCategory === 'favorites'
                    ? 'bg-amber-500/25 border-amber-400 shadow-amber-500/20'
                    : isDark
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-slate-100 border-slate-200'
                }`}
              >
                <Star
                  size={13}
                  color={activeCategory === 'favorites' ? '#FBBF24' : (isDark ? '#94A3B8' : '#64748B')}
                  fill={activeCategory === 'favorites' ? '#FBBF24' : 'transparent'}
                />
                <Text
                  className={`text-xs ml-1.5 font-black ${
                    activeCategory === 'favorites'
                      ? 'text-amber-400'
                      : isDark
                      ? 'text-slate-400'
                      : 'text-slate-600'
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
                    : isDark
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-slate-100 border-slate-200'
                }`}
              >
                <Text
                  className={`text-xs font-black ${
                    activeCategory === 'all'
                      ? 'text-white'
                      : isDark
                      ? 'text-slate-400'
                      : 'text-slate-600'
                  }`}
                >
                  All ({items.length})
                </Text>
              </TouchableOpacity>

              {/* Category Tabs */}
              {categories.map((cat) => {
                const count = items.filter((i) => i.categoryId === cat.id).length;
                const isSelected = activeCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={{ flexShrink: 0 }}
                    onPress={() => setActiveCategory(cat.id)}
                    className={`mr-2 px-3.5 py-1.5 rounded-full border shadow-sm ${
                      isSelected
                        ? 'bg-[#5D3FD3] border-purple-400 shadow-purple-500/30'
                        : isDark
                        ? 'bg-slate-900 border-slate-800'
                        : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        isSelected
                          ? 'text-white font-black'
                          : isDark
                          ? 'text-slate-400 font-semibold'
                          : 'text-slate-600 font-semibold'
                      }`}
                    >
                      {cat.name} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Scroll Right Button (Mouse / Touchpad / Desktop Quick Navigation) */}
            <TouchableOpacity
              onPress={() => {
                categoryScrollOffset.current += 240;
                categoryScrollRef.current?.scrollTo({ x: categoryScrollOffset.current, animated: true });
              }}
              className={`p-1.5 sm:p-2 rounded-full ml-1 items-center justify-center border shadow-xs ${
                isDark
                  ? 'bg-slate-900 border-slate-800 active:bg-slate-800'
                  : 'bg-slate-100 border-slate-200 active:bg-slate-200'
              }`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Scroll categories right"
            >
              <ChevronRight size={16} color={isDark ? '#CBD5E1' : '#475569'} strokeWidth={2.5} />
            </TouchableOpacity>
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
              padding: viewMode === 'grid' ? 8 : 16,
              paddingBottom: isSplitView ? Math.max(insets.bottom + 24, 40) : Math.max(insets.bottom + 170, 200),
            }}
            ListEmptyComponent={
              <View className="py-16 items-center">
                {activeCategory === 'favorites' ? (
                  <View className="items-center">
                    <Star size={36} color="#F59E0B" />
                    <Text className={`font-bold text-sm mt-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      No Favorite Items Starred
                    </Text>
                    <Text className="text-slate-400 text-xs mt-1 text-center px-6">
                      Star your most popular favorite items in Menu Management for rapid 1-touch ordering!
                    </Text>
                  </View>
                ) : (
                  <View className="items-center">
                    <ShoppingBag size={36} color={isDark ? '#475569' : '#94A3B8'} />
                    <Text className="text-slate-400 text-xs mt-3">No menu items found in this section</Text>
                  </View>
                )}
              </View>
            }
          />
        </View>

        {/* Right Section (Approx 32% Persistent Cart on iPad POS) */}
        {isSplitView && (
          <View style={{ flex: 32, minWidth: 320, maxWidth: 440 }}>
            {renderSplitCartPanel()}
          </View>
        )}
      </View>

      {/* Portions / Variant Selection Sheet */}
      <VariantSelectionSheet
        isVisible={Boolean(selectedItemForVariants)}
        item={selectedItemForVariants}
        onClose={() => setSelectedItemForVariants(null)}
        onAddToCart={handleVariantAddToCart}
        getAvailableStock={getAvailableStock}
      />

      {/* Item Customization Sheet (Mandatory & Optional Add-ons, Dynamic Price) */}
      <ItemCustomizationSheet
        isVisible={Boolean(selectedItemForCustomization)}
        item={selectedItemForCustomization}
        onClose={() => setSelectedItemForCustomization(null)}
        onAddToCart={handleCustomizationAddToCart}
        getAvailableStock={getAvailableStock}
      />



      {/* Mobile Floating Bottom Cart Bar (Direct Navigation to Dedicated Cart) */}
      {!isSplitView && cartItemCount > 0 && (
        <View
          className={`absolute bottom-0 left-0 right-0 border-t px-4 pt-3 shadow-2xl ${
            isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'
          }`}
          style={{ paddingBottom: Math.max(insets.bottom + 8, 20) }}
        >
          {isBillPrinted && (
            <View className="mb-2 py-1 px-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex-row items-center">
              <ShieldCheck size={12} color="#F59E0B" />
              <Text className="text-[10px] font-bold ml-1.5 flex-1 text-amber-300" numberOfLines={1}>
                Bill #{activePrintedBillNo || ''} Printed • Changes will update bill
              </Text>
            </View>
          )}

          {/* Top Info Strip: Item count, order type badge & Total */}
          <View className="flex-row items-center justify-between mb-2.5">
            <View className="flex-row items-center gap-1.5 flex-1 mr-2">
              <View className="bg-purple-500/20 px-2 py-0.5 rounded-md border border-purple-500/30">
                <Text className="text-purple-400 text-xs font-black" numberOfLines={1}>
                  {tableNo ? `Table ${tableNo}` : (orderType === 'PICKUP' ? 'Pick Up' : (orderType === 'COUNTER' ? 'Counter' : 'Takeaway'))}
                </Text>
              </View>
              <Text
                className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
                numberOfLines={1}
              >
                • {cartItemCount} item{cartItemCount > 1 ? 's' : ''} in cart
              </Text>
            </View>

            <View
              className={`flex-row items-baseline gap-1 px-2.5 py-1 rounded-xl border ${
                isDark ? 'bg-slate-800/90 border-slate-700/60' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <Text className="text-slate-400 text-[10px] uppercase font-bold">Total:</Text>
              <Text className={`font-black text-lg ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                ₹{cartTotal.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Action Buttons Row */}
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
                      <Text className="text-amber-400 font-black text-xs ml-1.5" numberOfLines={1}>
                        Send KOT ({unsentItems.reduce((s, i) => s + i.qty, 0)})
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setIsCartModalOpen(true)}
                  className="flex-1 bg-[#5D3FD3] py-3 rounded-2xl flex-row items-center justify-center active:opacity-80 shadow-md shadow-purple-500/30"
                >
                  <ShoppingBag size={15} color="white" />
                  <Text className="text-white font-black text-xs ml-1.5" numberOfLines={1}>
                    View Cart ({cartItemCount})
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setIsCartModalOpen(true)}
                className="flex-1 bg-[#5D3FD3] py-3.5 rounded-2xl flex-row items-center justify-center active:opacity-80 shadow-md shadow-purple-500/30"
              >
                <ShoppingBag size={16} color="white" />
                <Text className="text-white font-black text-sm ml-2" numberOfLines={1}>
                  {`View Cart (${cartItemCount} item${cartItemCount > 1 ? 's' : ''} • ₹${cartTotal.toFixed(2)}) →`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* DEDICATED SEPARATE CART MODAL (See, Review & Edit Items) */}
      <Modal
        visible={isCartModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCartModalOpen(false)}
      >
        <View className="flex-1 justify-end sm:justify-center items-center bg-black/80" style={{ padding: isMobile ? 0 : 16 }}>
          <View
            className={`w-full max-w-xl shadow-2xl flex-col border ${
              isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'
            }`}
            style={{
              height: isMobile ? '92%' : '85%',
              maxHeight: isMobile ? '92%' : 750,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderBottomLeftRadius: isMobile ? 0 : 28,
              borderBottomRightRadius: isMobile ? 0 : 28,
              overflow: 'hidden',
            }}
          >
            {/* Cart Modal Header */}
            <View
              className={`flex-row items-center justify-between p-4 sm:p-5 border-b ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <View className="flex-row items-center gap-2.5 flex-1 mr-2">
                <View className="p-2 rounded-xl bg-[#5D3FD3]/20 border border-purple-500/30">
                  <ShoppingBag size={20} color="#A855F7" />
                </View>
                <View className="flex-1">
                  <Text className={`font-black text-base sm:text-lg ${isDark ? 'text-white' : 'text-slate-900'}`} numberOfLines={1}>
                    {tableNo === 0
                      ? isDirect
                        ? 'Quick Sale Cart'
                        : orderType === 'PICKUP'
                        ? 'Pick Up Cart'
                        : 'Takeaway Cart'
                      : `Table ${tableNo} Cart`}
                  </Text>
                  <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {cartItemCount} item{cartItemCount === 1 ? '' : 's'} in order
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-2">
                {cartItems.length > 0 && (
                  <TouchableOpacity
                    onPress={handleClearCart}
                    className="px-3 py-1.5 bg-rose-500/15 border border-rose-500/30 rounded-xl active:opacity-75"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text className="text-rose-400 text-xs font-bold">Clear All</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setIsCartModalOpen(false)}
                  className={`p-2 rounded-xl border ${
                    isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
                  }`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Close Cart"
                >
                  <X size={18} color={isDark ? '#CBD5E1' : '#475569'} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Cart Modal Items List */}
            <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={true}>
              {cartItems.length === 0 ? (
                <View className="py-20 items-center justify-center">
                  <View
                    className={`w-16 h-16 rounded-full items-center justify-center mb-3 ${
                      isDark ? 'bg-slate-800/80' : 'bg-slate-100'
                    }`}
                  >
                    <ShoppingBag size={30} color={isDark ? '#64748B' : '#94A3B8'} />
                  </View>
                  <Text className={`font-black text-base ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Your Cart is Empty
                  </Text>
                  <Text className={`text-xs mt-1 text-center max-w-[240px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Tap dishes from the menu to add them to this order.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setIsCartModalOpen(false)}
                    className="mt-5 px-5 py-2.5 bg-[#5D3FD3] rounded-xl flex-row items-center shadow-md shadow-purple-500/30"
                  >
                    <Text className="text-white font-bold text-xs">← Browse Menu</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                cartItems.map((item, index) => {
                  const itemTotal = item.price * item.qty;
                  const itemPhoto = getAutoMenuItemImage(item.itemName, undefined, (item as any).imageUrl || (item as any).image);

                  return (
                    <View
                      key={`${item.itemId}_${item.variantId || item.variantName || ''}_${item.customizationKey || ''}_${index}`}
                      className={`p-3.5 rounded-2xl mb-2.5 border ${
                        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                      }`}
                    >
                      <View className="flex-row items-start justify-between">
                        {/* Food Image Thumbnail */}
                        {showImages && itemPhoto && (
                          <View className="w-12 h-12 rounded-xl overflow-hidden mr-3 bg-slate-800 border border-slate-700/50 shrink-0">
                            <Image source={{ uri: itemPhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          </View>
                        )}

                        <View className="flex-1 mr-2 min-w-0">
                          <Text
                            className={`text-sm font-bold leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}
                            numberOfLines={2}
                          >
                            {item.itemName}
                          </Text>

                          {/* Variant Badge */}
                          {item.variantName && (
                            <View className="self-start bg-indigo-500/20 px-2 py-0.5 rounded-md border border-indigo-500/30 mt-1">
                              <Text className="text-indigo-400 text-[11px] font-bold">{item.variantName}</Text>
                            </View>
                          )}

                          {/* Customization Options Badges */}
                          {item.selectedOptions && item.selectedOptions.length > 0 && (
                            <View className="flex-row flex-wrap gap-1 mt-1">
                              {item.selectedOptions.map((opt, oIdx) => (
                                <View
                                  key={oIdx}
                                  className={`px-1.5 py-0.5 rounded border ${
                                    isDark ? 'bg-purple-950/60 border-purple-500/30' : 'bg-purple-50 border-purple-200'
                                  }`}
                                >
                                  <Text className={`text-[10px] font-semibold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                                    +{opt.optionName}
                                    {opt.price > 0 ? ` (₹${opt.price})` : ''}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {item.note ? (
                            <Text className="text-amber-400 text-[11px] italic mt-1">Note: {item.note}</Text>
                          ) : null}

                          <Text className="text-slate-400 text-xs mt-1">
                            ₹{item.price} × {item.qty} ={' '}
                            <Text className={`font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                              ₹{itemTotal.toFixed(2)}
                            </Text>
                          </Text>
                        </View>

                        {/* Interactive Quantity Stepper */}
                        <View className="items-end gap-1.5 shrink-0">
                          <View
                            className={`flex-row items-center rounded-full px-1 py-0.5 border shadow-sm ${
                              isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-100 border-slate-300'
                            }`}
                          >
                            <TouchableOpacity
                              className={`w-7 h-7 rounded-full items-center justify-center active:opacity-75 ${
                                isDark ? 'bg-slate-800' : 'bg-white'
                              }`}
                              onPress={() => handleDecrementCartItem(item)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Minus size={12} color={isDark ? '#CBD5E1' : '#475569'} strokeWidth={2.5} />
                            </TouchableOpacity>

                            <Text className={`w-6 text-center font-black text-xs sm:text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {item.qty}
                            </Text>

                            <TouchableOpacity
                              className="w-7 h-7 rounded-full bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-sm shadow-purple-500/30"
                              onPress={() => handleIncrementCartItem(item)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Plus size={12} color="white" strokeWidth={2.5} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Cart Modal Footer: Summary & Checkout Navigation */}
            {cartItems.length > 0 && (
              <View
                className={`p-4 sm:p-5 border-t ${
                  isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
                style={{ paddingBottom: Math.max(insets.bottom + 12, 16) }}
              >
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Total Amount ({cartItemCount} item{cartItemCount === 1 ? '' : 's'})
                    </Text>
                    <Text className={`font-black text-2xl ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      ₹{cartTotal.toFixed(2)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => setIsCartModalOpen(false)}
                    className={`px-3 py-2 rounded-xl border ${
                      isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      + Add More Items
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Big Proceed to Checkout Button */}
                <TouchableOpacity
                  onPress={() => {
                    setIsCartModalOpen(false);
                    navigation.navigate(Routes.CART, { tableNo, orderType });
                  }}
                  className="w-full py-3.5 bg-[#5D3FD3] rounded-2xl flex-row items-center justify-center active:opacity-90 shadow-lg shadow-purple-900/40"
                >
                  <CreditCard size={18} color="white" />
                  <Text className="text-white font-black text-sm sm:text-base ml-2">
                    {paymentsEnabled ? `Proceed to Checkout & Pay (₹${cartTotal.toFixed(2)}) →` : isSingleKotMode ? `Proceed & Generate Token →` : 'Proceed & Send KOT to Kitchen →'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

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
