import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Modal, ScrollView, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ArrowLeft, Search, ShoppingBag, Send, CreditCard, ChevronRight, Star, Sparkles } from 'lucide-react-native';
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

export const MenuScreen = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const tableNo = route.params?.tableNo ?? 0;
  const orderType = route.params?.orderType || (tableNo === 0 ? 'PICKUP' : 'DINE_IN');

  const { categories, items, subscribeToMenu } = useMenuStore();
  const { tenant, activeLocationId } = useTenantStore();
  const { carts, addItem, removeItem, updateQuantity, markAsSent, clearCart } = useCartStore();
  const { settings } = usePrinterStore();
  const { user } = useAuthStore();
  const { isSplitView, isLargePOS } = useResponsiveLayout();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemForVariants, setSelectedItemForVariants] = useState<MenuItem | null>(null);
  const [isSendingKOT, setIsSendingKOT] = useState(false);

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
      Alert.alert('KOT Sent', `KOT #${kotNo} dispatched to kitchen successfully!`);
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

  const renderItemCard = ({ item }: { item: MenuItem }) => {
    const hasVariants = item.variants && item.variants.length > 0;
    const cartItem = cartItems.find(i => i.itemId === item.id);
    const qty = cartItem?.qty || 0;

    return (
      <View className="bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-3 flex-row items-center justify-between shadow-lg">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center">
            {item.isFavorite && (
              <View className="mr-1.5 bg-amber-500/20 px-1.5 py-0.5 rounded flex-row items-center">
                <Star size={10} color="#F59E0B" fill="#F59E0B" />
              </View>
            )}
            <Text className="text-white font-bold text-base flex-1" numberOfLines={1}>
              {item.name}
            </Text>
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
            className="bg-[#5D3FD3] px-3.5 py-2 rounded-xl"
          >
            <Text className="text-white font-bold text-xs">+ Options</Text>
          </TouchableOpacity>
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
              onPress={() => updateQuantity(tableNo, item.id, qty + 1)}
            >
              <Text className="text-white font-bold text-sm">+</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => addItem(tableNo, { itemId: item.id, itemName: item.name, price: item.price, qty: 1 })}
            className="bg-[#5D3FD3] px-4 py-2 rounded-xl"
          >
            <Text className="text-white font-bold text-xs">+ Add</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Persistent Right Panel for Tablets & POS
  const renderSplitCartPanel = () => (
    <View className="w-80 bg-slate-900 border-l border-slate-800 p-4 flex-col justify-between">
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
                    onPress={() => updateQuantity(tableNo, item.itemId, item.qty + 1)}
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
              title={`KOT (${unsentItems.reduce((s, i) => s + i.qty, 0)})`}
              variant="secondary"
              onPress={handleSendToKitchen}
              isLoading={isSendingKOT}
              className="flex-1"
            />
          )}
          <Button
            title="Checkout & Pay"
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
                {selectedItemForVariants.variants?.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => {
                      addItem(tableNo, {
                        itemId: `${selectedItemForVariants.id}_${v.name}`,
                        itemName: `${selectedItemForVariants.name} (${v.name})`,
                        price: v.price,
                        qty: 1,
                        variantName: v.name,
                      });
                      setSelectedItemForVariants(null);
                    }}
                    className="flex-row justify-between items-center bg-slate-800/80 p-3 rounded-xl border border-slate-700"
                  >
                    <Text className="text-white font-semibold text-xs">{v.name}</Text>
                    <Text className="text-indigo-400 font-bold text-xs">₹{v.price}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Button title="Cancel" variant="secondary" onPress={() => setSelectedItemForVariants(null)} />
            </View>
          </View>
        </Modal>
      )}
    
      {/* Mobile Floating Bottom Cart Bar (Adaptive for 3-button & gesture nav) */}
      {!isSplitView && cartItemCount > 0 && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-[#111827]/95 border-t border-slate-800 px-4 pt-3 shadow-2xl"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-slate-400 text-[11px] font-bold">
                {cartItemCount} item{cartItemCount > 1 ? 's' : ''} • Table {tableNo}
              </Text>
              <Text className="text-white font-black text-lg">₹{cartTotal.toFixed(2)}</Text>
            </View>
            <View className="flex-row gap-2">
              {unsentItems.length > 0 && (
                <Button
                  title={`KOT (${unsentItems.reduce((s, i) => s + i.qty, 0)})`}
                  variant="secondary"
                  onPress={handleSendToKitchen}
                  isLoading={isSendingKOT}
                  size="sm"
                />
              )}
              <Button
                title="View Cart & Pay →"
                onPress={() => navigation.navigate(Routes.CART, { tableNo, orderType })}
                size="sm"
              />
            </View>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
};
