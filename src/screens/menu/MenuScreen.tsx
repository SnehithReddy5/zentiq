import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Modal, ScrollView, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ArrowLeft, Search, Settings, ShoppingBag, Send, CreditCard, ChevronRight, Star, Sparkles, CheckCircle2, Package } from 'lucide-react-native';
import { useMenuStore } from '../../store/menu.store';
import { useCartStore } from '../../store/cart.store';
import { useTableStore } from '../../store/table.store';
import { usePrinterStore } from '../../store/printer.store';
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
  const tableNo = isDirectHome ? 0 : (routeParams.tableNo ?? 0);
  const orderType = isDirectHome ? 'COUNTER' : (routeParams.orderType || (tableNo === 0 ? 'PICKUP' : 'DINE_IN'));

  const { categories, items, subscribeToMenu } = useMenuStore();
  const { tenant, activeLocationId, features } = useTenantStore();
  const paymentsEnabled = features.paymentsEnabled !== false;
  const { carts, addItem, removeItem, updateQuantity, markAsSent, clearCart } = useCartStore();
  const { settings } = usePrinterStore();
  const { user } = useAuthStore();
  const { isSplitView, isLargePOS } = useResponsiveLayout();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemForVariants, setSelectedItemForVariants] = useState<MenuItem | null>(null);
  const [isSendingKOT, setIsSendingKOT] = useState(false);
  const [kotToast, setKotToast] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToMenu();
    return () => unsub();
  }, [tenant?.id, activeLocationId]);

  const cartItems = carts[tableNo] || [];

  // Differential KOT filtering: Only items with qty > sentQty
  const unsentItems = cartItems
    .map(i => ({ ...i, qty: i.qty - (i.sentQty || 0) }))
    .filter(i => i.qty > 0);

  
  // Pre-populate table cart from remote store if entering an already-running table
  useEffect(() => {
    if (tableNo !== 0 && cartItems.length === 0) {
      const currentTable = useTableStore.getState().tables.find((t: any) => t.tableNo === tableNo);
      if (currentTable && (currentTable as any).cartItems && (currentTable as any).cartItems.length > 0) {
        useCartStore.getState().syncRemoteCarts({ [tableNo]: (currentTable as any).cartItems });
      }
    }
  }, [tableNo]);

  const cartTotal = cartItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const cartItemCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  const handleSendToKitchen = async () => {
    if (unsentItems.length === 0) return;
    if (!activeLocationId) {
      Alert.alert('Branch Required', 'Please select an operating branch on the home screen before dispatching KOT.');
      return;
    }
    setIsSendingKOT(true);
    try {
      const kotNo = await DBServices.getNextSequenceNumber(tenant?.id, activeLocationId || undefined);

      if (tableNo !== 0) {
        await DBServices.updateTableStatusByNo(tableNo, 'running', tenant?.id, activeLocationId || undefined);
      }

      // Build ESC/POS KOT buffer with orderType
      const buffer = ESCPOSService.buildKOT(
        kotNo,
        tableNo,
        user?.name || 'Staff',
        unsentItems,
        undefined,
        orderType
      );

      // Attempt LAN Thermal Print
      try {
        await printerService.connect(settings.kitchenIpAddress, settings.kitchenPort);
        await printerService.print(buffer);
        await printerService.disconnect();
      } catch (printErr) {
        console.warn('Thermal print warning (simulated/offline):', printErr);
      }

      markAsSent(tableNo);
      setKotToast(`✓ KOT #${kotNo} dispatched to kitchen (1 ticket)`);
      setTimeout(() => setKotToast(null), 3000);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSendingKOT(false);
    }
  };

  const favoriteCount = items.filter(i => i.isFavorite).length;

  const filteredItems = items
    .filter(i => {
      if (activeCategory === 'favorites') return i.isFavorite === true;
      if (activeCategory === 'all') return true;
      return i.categoryId === activeCategory;
    })
    .filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Inventory Calculation & Stock Guard Helpers
  const getReservedStock = (baseItemId: string): number => {
    return cartItems
      .filter(i => (i.baseItemId === baseItemId) || (i.itemId === baseItemId))
      .reduce((total, i) => total + (i.qty * (i.portionDeduction || 1)), 0);
  };

  const getAvailableStock = (item: MenuItem): number => {
    if (!item.trackInventory) return 999999;
    const reserved = getReservedStock(item.id);
    return Math.max(0, (item.stockQuantity || 0) - reserved);
  };

  const handleAddSimpleItem = (item: MenuItem) => {
    if (item.trackInventory) {
      const avail = getAvailableStock(item);
      if (avail < 1) {
        Alert.alert(
          'Insufficient Stock',
          `Cannot sell more than available stock! Only ${avail.toFixed(2)} ${item.stockUnit || 'kg'} of "${item.name}" remaining.`
        );
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

  const handleIncrementSimpleItem = (item: MenuItem, currentQty: number) => {
    if (item.trackInventory) {
      const avail = getAvailableStock(item);
      if (avail < 1) {
        Alert.alert(
          'Insufficient Stock',
          `Cannot sell more than available stock! Only ${avail.toFixed(2)} ${item.stockUnit || 'kg'} of "${item.name}" remaining.`
        );
        return;
      }
    }
    updateQuantity(tableNo, item.id, currentQty + 1);
  };

  const handleIncrementCartItem = (cItem: any) => {
    const baseId = cItem.baseItemId || cItem.itemId;
    const masterItem = items.find(i => i.id === baseId);
    if (masterItem && masterItem.trackInventory) {
      const deduction = typeof cItem.portionDeduction === 'number' ? cItem.portionDeduction : 1;
      const avail = getAvailableStock(masterItem);
      if (avail < deduction) {
        Alert.alert(
          'Insufficient Stock',
          `Cannot add more! Only ${avail.toFixed(2)} ${masterItem.stockUnit || 'kg'} of "${masterItem.name}" remaining in stock.`
        );
        return;
      }
    }
    updateQuantity(tableNo, cItem.itemId, cItem.qty + 1);
  };

  const renderItemCard = ({ item }: { item: MenuItem }) => {
    const hasVariants = item.variants && item.variants.length > 0;
    const cartItem = cartItems.find(i => i.itemId === item.id);
    const qty = cartItem?.qty || 0;
    const availStock = getAvailableStock(item);
    const isOutOfStock = item.trackInventory && availStock <= 0;
    const isLowStock = item.trackInventory && !isOutOfStock && availStock <= (item.lowStockThreshold || 2);

    return (
      <View className={`bg-slate-900 border p-4 rounded-2xl mb-3 flex-row items-center justify-between shadow-lg ${
        isOutOfStock ? 'border-rose-900/40 opacity-75' : 'border-slate-800'
      }`}>
        <View className="flex-1 mr-3">
          <View className="flex-row items-center flex-wrap gap-1.5">
            {item.isFavorite && (
              <View className="mr-0.5 bg-amber-500/20 px-1.5 py-0.5 rounded flex-row items-center">
                <Star size={10} color="#F59E0B" fill="#F59E0B" />
              </View>
            )}
            <Text className="text-white font-bold text-base" numberOfLines={1}>
              {item.name}
            </Text>

            {/* Inventory Status Pill */}
            {item.trackInventory && (
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
                    ? `Low Stock: ${availStock.toFixed(availStock % 1 === 0 ? 0 : 2)} ${item.stockUnit || 'kg'}`
                    : `In Stock: ${availStock.toFixed(availStock % 1 === 0 ? 0 : 2)} ${item.stockUnit || 'kg'}`}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-slate-400 font-bold text-xs mt-1">₹{item.price}</Text>
          {hasVariants && (
            <Text className="text-indigo-400 text-[11px] mt-0.5 font-medium">
              {item.variants?.length} Options available
            </Text>
          )}
        </View>

        {hasVariants ? (
          <TouchableOpacity
            onPress={() => setSelectedItemForVariants(item)}
            disabled={isOutOfStock}
            className={`px-3.5 py-2 rounded-xl ${
              isOutOfStock
                ? 'bg-slate-800 border border-slate-700 opacity-60'
                : 'bg-[#5D3FD3]'
            }`}
          >
            <Text className={`font-bold text-xs ${isOutOfStock ? 'text-slate-400' : 'text-white'}`}>
              {isOutOfStock ? 'Out of Stock' : '+ Options'}
            </Text>
          </TouchableOpacity>
        ) : isOutOfStock ? (
          <View className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl">
            <Text className="text-slate-500 font-bold text-xs">Out of Stock</Text>
          </View>
        ) : qty > 0 ? (
          <View className="flex-row items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
            <TouchableOpacity
              className="w-7 h-7 rounded-lg bg-slate-700 items-center justify-center"
              onPress={() => {
                if (qty > 1) updateQuantity(tableNo, item.id, qty - 1);
                else removeItem(tableNo, item.id);
              }}
            >
              <Text className="text-white font-bold text-sm">-</Text>
            </TouchableOpacity>
            <Text className="w-7 text-center text-white font-bold text-xs">{qty}</Text>
            <TouchableOpacity
              className="w-7 h-7 rounded-lg bg-[#5D3FD3] items-center justify-center"
              onPress={() => handleIncrementSimpleItem(item, qty)}
            >
              <Text className="text-white font-bold text-sm">+</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => handleAddSimpleItem(item)}
            className="bg-[#5D3FD3] px-4 py-2 rounded-xl shadow-sm shadow-purple-500/30"
          >
            <Text className="text-white font-bold text-xs">+ Add</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Persistent Right Panel for Tablets & POS
  const renderSplitCartPanel = () => (
    <View className="w-[360px] lg:w-[410px] bg-slate-900 border-l border-slate-800 p-4 flex-col justify-between shadow-2xl">
      <View className="flex-1">
        <View className="flex-row items-center justify-between pb-3 border-b border-slate-800">
          <Text className="text-white font-black text-lg">
            {tableNo === 0 ? (orderType === 'PICKUP' ? 'Pick Up Cart' : 'Takeaway Cart') : `Table ${tableNo} Cart`}
          </Text>
          <TouchableOpacity onPress={() => clearCart(tableNo)} className="px-2 py-1 bg-rose-500/10 rounded">
            <Text className="text-rose-400 text-xs font-bold">Clear</Text>
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 my-3">
          {cartItems.length === 0 ? (
            <View className="py-12 items-center">
              <ShoppingBag size={32} color="#475569" />
              <Text className="text-slate-500 text-xs mt-2">Cart is empty</Text>
            </View>
          ) : (
            cartItems.map((item, index) => (
              <View key={index} className="flex-row items-center justify-between py-2 border-b border-slate-800/50">
                <View className="flex-1 mr-2">
                  <Text className="text-white text-xs font-semibold" numberOfLines={1}>{item.itemName}</Text>
                  <Text className="text-slate-400 text-[10px]">₹{item.price} each</Text>
                </View>
                <View className="flex-row items-center bg-slate-800 rounded p-0.5">
                  <TouchableOpacity
                    className="w-6 h-6 rounded bg-slate-700 items-center justify-center"
                    onPress={() => {
                      if (item.qty > 1) updateQuantity(tableNo, item.itemId, item.qty - 1);
                      else removeItem(tableNo, item.itemId);
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
          {unsentItems.length > 0 && (
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
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-[#111827] border-b border-slate-800">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => navigation.goBack()} className="p-1 rounded-lg bg-slate-800 mr-3">
            <ArrowLeft size={20} color="#CBD5E1" />
          </TouchableOpacity>
          <View>
            <Text className="text-white font-bold text-base">
              {tableNo === 0 ? (orderType === 'PICKUP' ? 'Pick Up Order' : 'Takeaway Order') : `Table ${tableNo} (Dine In)`}
            </Text>
            <Text className="text-slate-400 text-xs">Tap items to add to order</Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          

          {!isSplitView && cartItemCount > 0 && (
            <TouchableOpacity
              onPress={() => navigation.navigate(Routes.CART, { tableNo, orderType })}
              className="bg-[#5D3FD3] px-3.5 py-1.5 rounded-xl flex-row items-center"
            >
              <ShoppingBag size={15} color="white" />
              <Text className="text-white font-bold text-xs ml-1.5">{cartItemCount} (₹{cartTotal})</Text>
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
          {/* Search Bar */}
          <View className="px-4 py-2.5 bg-[#090D1A]">
            <View className="flex-row items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
              <Search size={16} color="#64748B" />
              <TextInput
                placeholder="Search menu items..."
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={setSearchQuery}
                className="flex-1 ml-2 text-xs text-white"
              />
            </View>
          </View>

          {/* Sub-menu Horizontal Category Bar with Favorites */}
          <View className="py-2 bg-[#0A0F1D] border-b border-slate-800">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4">
              {/* Starred Favorites Tab */}
              <TouchableOpacity
                onPress={() => setActiveCategory('favorites')}
                className={`mr-2 px-3.5 py-1.5 rounded-full flex-row items-center border ${
                  activeCategory === 'favorites'
                    ? 'bg-amber-500/20 border-amber-500'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <Star size={12} color={activeCategory === 'favorites' ? '#F59E0B' : '#94A3B8'} fill={activeCategory === 'favorites' ? '#F59E0B' : 'transparent'} />
                <Text
                  className={`text-xs ml-1.5 font-bold ${
                    activeCategory === 'favorites' ? 'text-amber-400' : 'text-slate-400'
                  }`}
                >
                  ★ Favorites ({favoriteCount})
                </Text>
              </TouchableOpacity>

              {/* All Items Tab */}
              <TouchableOpacity
                onPress={() => setActiveCategory('all')}
                className={`mr-2 px-3.5 py-1.5 rounded-full border ${
                  activeCategory === 'all'
                    ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    activeCategory === 'all' ? 'text-white' : 'text-slate-400'
                  }`}
                >
                  All ({items.length})
                </Text>
              </TouchableOpacity>

              {/* Category Tabs */}
              {categories.map(cat => {
                const count = items.filter(i => i.categoryId === cat.id).length;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setActiveCategory(cat.id)}
                    className={`mr-2 px-3.5 py-1.5 rounded-full border ${
                      activeCategory === cat.id
                        ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        activeCategory === cat.id ? 'text-white' : 'text-slate-400'
                      }`}
                    >
                      {cat.name} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Items List */}
          <FlatList
            data={filteredItems}
            keyExtractor={item => item.id}
            renderItem={renderItemCard}
            contentContainerStyle={{ padding: 16, paddingBottom: isSplitView ? Math.max(insets.bottom + 24, 40) : Math.max(insets.bottom + 90, 110) }}
            ListEmptyComponent={
              <View className="py-16 items-center">
                {activeCategory === 'favorites' ? (
                  <>
                    <Star size={36} color="#F59E0B" />
                    <Text className="text-white font-bold text-sm mt-3">No Favorite Items Starred</Text>
                    <Text className="text-slate-400 text-xs mt-1 text-center px-6">
                      Star your top 10 most popular items in Menu Management for rapid 1-touch ordering!
                    </Text>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={36} color="#475569" />
                    <Text className="text-slate-400 text-xs mt-3">No menu items found in this section</Text>
                  </>
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
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm">
              <Text className="text-white font-black text-lg mb-1">{selectedItemForVariants.name}</Text>
              <Text className="text-slate-400 text-xs mb-4">Select an option:</Text>

              <View className="space-y-2 mb-4">
                {(() => {
                  const avail = getAvailableStock(selectedItemForVariants);
                  return selectedItemForVariants.variants?.map(v => {
                    const deduction = typeof v.portionDeduction === 'number' ? v.portionDeduction : 1;
                    const canFulfill = !selectedItemForVariants.trackInventory || (avail >= deduction);

                    return (
                      <TouchableOpacity
                        key={v.id}
                        disabled={!canFulfill}
                        onPress={() => {
                          addItem(tableNo, {
                            itemId: `${selectedItemForVariants.id}_${v.name}`,
                            baseItemId: selectedItemForVariants.id,
                            itemName: `${selectedItemForVariants.name} (${v.name})`,
                            price: v.price,
                            qty: 1,
                            variantName: v.name,
                            portionDeduction: deduction,
                          });
                          setSelectedItemForVariants(null);
                        }}
                        className={`flex-row justify-between items-center p-3 rounded-xl border ${
                          canFulfill
                            ? 'bg-slate-800/80 border-slate-700 hover:border-indigo-500'
                            : 'bg-slate-900 border-slate-800 opacity-40'
                        }`}
                      >
                        <View className="flex-1 mr-2">
                          <Text className="text-white font-semibold text-xs">{v.name}</Text>
                          {selectedItemForVariants.trackInventory && (
                            <Text className="text-slate-400 text-[10px] mt-0.5">
                              Deducts: {deduction} {selectedItemForVariants.stockUnit || 'kg'}
                            </Text>
                          )}
                        </View>
                        <View className="items-end">
                          <Text className="text-indigo-400 font-bold text-xs">₹{v.price}</Text>
                          {!canFulfill && (
                            <Text className="text-rose-400 text-[10px] font-bold">Out of Stock</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </View>

              <Button title="Cancel" variant="secondary" onPress={() => setSelectedItemForVariants(null)} />
            </View>
          </View>
        </Modal>
      )}
    
      {/* Mobile Floating Bottom Cart Bar (Fixed clean layout) */}
      {!isSplitView && cartItemCount > 0 && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-[#0F172A]/98 border-t border-slate-800 px-4 pt-3 shadow-2xl backdrop-blur-md"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {/* Top Info Strip: Item count, order type badge & Total */}
          <View className="flex-row items-center justify-between mb-2.5">
            <View className="flex-row items-center gap-2">
              <View className="bg-indigo-500/20 px-2 py-0.5 rounded-md border border-indigo-500/30">
                <Text className="text-indigo-300 text-xs font-black">
                  {tableNo ? `Table ${tableNo}` : (orderType === 'PICKUP' ? 'Pick Up' : 'Takeaway')}
                </Text>
              </View>
              <Text className="text-slate-400 text-xs font-semibold">
                {cartItemCount} item{cartItemCount > 1 ? 's' : ''} in cart
              </Text>
            </View>

            <View className="flex-row items-baseline gap-1">
              <Text className="text-slate-400 text-[10px] uppercase font-bold">Total:</Text>
              <Text className="text-white font-black text-xl">₹{cartTotal.toFixed(2)}</Text>
            </View>
          </View>

          {/* Action Buttons Row: Equal width side-by-side or full width */}
          <View className="flex-row gap-2">
            {unsentItems.length > 0 ? (
              <>
                <TouchableOpacity
                  onPress={handleSendToKitchen}
                  disabled={isSendingKOT}
                  className="flex-1 bg-amber-500/20 border border-amber-500/40 py-3 rounded-2xl flex-row items-center justify-center active:opacity-80"
                >
                  {isSendingKOT ? (
                    <ActivityIndicator size="small" color="#F59E0B" />
                  ) : (
                    <>
                      <Send size={15} color="#FBBF24" />
                      <Text className="text-amber-300 font-black text-xs ml-1.5" numberOfLines={1}>
                        Send KOT ({unsentItems.reduce((s, i) => s + i.qty, 0)})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate(Routes.CART, { tableNo, orderType })}
                  className="flex-1 bg-[#5D3FD3] py-3 rounded-2xl flex-row items-center justify-center active:opacity-80 shadow-md shadow-purple-500/30"
                >
                  <ShoppingBag size={15} color="white" />
                  <Text className="text-white font-black text-xs ml-1.5" numberOfLines={1}>
                    {paymentsEnabled ? "View Cart & Pay →" : "View & Send KOT →"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => navigation.navigate(Routes.CART, { tableNo, orderType })}
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

    </SafeAreaView>
  );
};
