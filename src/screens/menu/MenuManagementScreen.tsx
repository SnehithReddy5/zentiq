import { toast } from '../../utils/toast';
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, Alert, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Trash2, Pencil, Search, FileSpreadsheet, Star, Sparkles, X, Check, Package, Scale, Layers } from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useMenuStore } from '../../store/menu.store';
import { useTenantStore } from '../../store/tenant.store';
import { DBServices } from '../../services/firebase/db';
import { MenuExcelImportModal } from './MenuExcelImportModal';
import { MenuItem, MenuItemVariant } from '../../types/menu.types';

export const MenuManagementScreen = () => {
  const insets = useSafeAreaInsets();
  const { categories, items, subscribeToMenu } = useMenuStore();
  const { tenant, activeLocationId } = useTenantStore();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
  const [isManageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [isItemModalOpen, setItemModalOpen] = useState(false);
  const [isExcelModalOpen, setExcelModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Category Add / Edit State
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');

  // Item Add / Edit State
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemIsFavorite, setItemIsFavorite] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<{ id?: string; name: string; price: string; portionDeduction?: string }[]>([]);

  // Inventory Management State
  const [itemTrackInventory, setItemTrackInventory] = useState(false);
  const [itemStockQuantity, setItemStockQuantity] = useState('10');
  const [itemStockUnit, setItemStockUnit] = useState<'kg' | 'g' | 'pcs' | 'portions' | 'ltr' | 'ml'>('kg');
  const [itemLowStockThreshold, setItemLowStockThreshold] = useState('2');
  const [isInventoryModalVisible, setIsInventoryModalVisible] = useState(false);

  // Quick Restock State
  const [restockTargetItem, setRestockTargetItem] = useState<MenuItem | null>(null);
  const [restockAmount, setRestockAmount] = useState('');
  const [isRestocking, setIsRestocking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'item' | 'category'; id: string; name: string; extraWarning?: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToMenu();
    return () => unsub();
  }, [tenant?.id, activeLocationId]);

  const favoriteItems = items.filter(i => i.isFavorite);
  const favoriteCount = favoriteItems.length;

  // Toggle favorite on an item directly (with max 10 enforcement)
  const handleToggleFavorite = async (item: MenuItem) => {
    try {
      if (item.isFavorite) {
        await DBServices.updateMenuItem(
          item.id,
          { isFavorite: false },
          tenant?.id,
          activeLocationId || undefined
        );
      } else {
        if (favoriteCount >= 10) {
          toast.warning('Only a maximum of 10 favorite items can be selected at once. Please unstar an existing favorite item first before adding a new one.', 'Favorite Limit Reached');
          return;
        }
        await DBServices.updateMenuItem(
          item.id,
          { isFavorite: true },
          tenant?.id,
          activeLocationId || undefined
        );
      }
    } catch (e: any) {
      toast.error(e.message, 'Category Error');
    }
  };

  // Open Add Category Modal
  const openAddCategoryModal = () => {
    setEditingCategoryId(null);
    setCatName('');
    setCategoryModalOpen(true);
  };

  // Open Add Item Modal
  const openAddItemModal = () => {
    if (categories.length === 0) {
      Alert.alert(
        'Create Category First',
        'You need to create at least one category (e.g. Starters, Mains, Beverages) before adding menu items.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: '+ Create Category', onPress: () => openAddCategoryModal() }
        ]
      );
      return;
    }
    setEditingItemId(null);
    setItemName('');
    setItemPrice('');
    const defaultCat = (activeCategory !== 'all' && activeCategory !== 'favorites' && categories.some(c => c.id === activeCategory))
      ? activeCategory
      : (categories[0]?.id || '');
    setItemCategoryId(defaultCat);
    setItemIsFavorite(false);
    setHasVariants(false);
    setVariants([]);
    setItemTrackInventory(false);
    setItemStockQuantity('10');
    setItemStockUnit('kg');
    setItemLowStockThreshold('2');
    setItemModalOpen(true);
  };

  // Open Edit Item Modal
  const openEditItemModal = (item: MenuItem) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemPrice(item.price.toString());
    setItemCategoryId(item.categoryId);
    setItemIsFavorite(!!item.isFavorite);
    setItemTrackInventory(!!item.trackInventory);
    setItemStockQuantity(item.stockQuantity !== undefined ? item.stockQuantity.toString() : '10');
    setItemStockUnit(item.stockUnit || 'kg');
    setItemLowStockThreshold(item.lowStockThreshold !== undefined ? item.lowStockThreshold.toString() : '2');
    if (item.variants && item.variants.length > 0) {
      setHasVariants(true);
      setVariants(item.variants.map(v => ({
        id: v.id,
        name: v.name,
        price: v.price.toString(),
        portionDeduction: v.portionDeduction !== undefined ? v.portionDeduction.toString() : '1'
      })));
    } else {
      setHasVariants(false);
      setVariants([]);
    }
    setItemModalOpen(true);
  };

  // Quick Restock Handler (e.g. morning chicken 10 kg)
  const handleConfirmRestock = async () => {
    if (!restockTargetItem) return;
    const amount = parseFloat(restockAmount);
    if (isNaN(amount) || amount < 0) {
      toast.warning('Please enter a valid stock quantity.', 'Invalid Amount');
      return;
    }

    setIsRestocking(true);
    try {
      await DBServices.quickRestockItem(
        restockTargetItem.id,
        amount,
        tenant?.id,
        activeLocationId || undefined
      );
      toast.success(`${restockTargetItem.name} stock updated to ${amount} ${restockTargetItem.stockUnit || 'units'}!`, 'Restocked');
      setRestockTargetItem(null);
      setRestockAmount('');
    } catch (err: any) {
      toast.error(err.message, 'Restock Error');
    } finally {
      setIsRestocking(false);
    }
  };


  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await DBServices.deleteMenuItem(itemToDelete.id, tenant?.id, activeLocationId || undefined);
      toast.success(`"${itemToDelete.name}" deleted from menu.`, 'Item Deleted');
      setItemToDelete(null);
    } catch (err: any) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    try {
      await DBServices.deleteMenuCategory(categoryToDelete.id, tenant?.id, activeLocationId || undefined);
      toast.success(`Category "${categoryToDelete.name}" and its items deleted.`, 'Category Deleted');
      setCategoryToDelete(null);
      setCategoryModalOpen(false);
      setActiveCategory('all');
    } catch (err: any) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setIsDeleting(false);
    }
  };

  // Save Item (Create or Update)
  const handleSaveItem = async () => {
    if (!itemName.trim()) {
      toast.warning('Item name is required.', 'Required');
      return;
    }

    if (!itemCategoryId) {
      if (categories.length === 0) {
        toast.warning('Please create a category first.', 'Category Needed');
        return;
      }
      toast.warning('Please select a category for this item.', 'Required');
      return;
    }

    // Check favorite limit if turning on favorite
    if (itemIsFavorite) {
      const isAlreadyFav = editingItemId ? items.find(i => i.id === editingItemId)?.isFavorite : false;
      if (!isAlreadyFav && favoriteCount >= 10) {
        toast.warning('Only a maximum of 10 favorite items can be selected at once. Please unstar another item first.', 'Favorite Limit Reached');
        return;
      }
    }

    let parsedPrice = parseFloat(itemPrice) || 0;
    let cleanVariants: MenuItemVariant[] | undefined = undefined;

    if (hasVariants) {
      const validVariants = variants.filter(v => v.name.trim().length > 0);
      if (validVariants.length === 0) {
        toast.warning('Please add at least one named variant.', 'Variants Required');
        return;
      }
      cleanVariants = validVariants.map((v, idx) => ({
        id: v.id || `var_${Date.now()}_${idx}`,
        name: v.name.trim(),
        price: parseFloat(v.price) || 0,
        portionDeduction: parseFloat(v.portionDeduction || '1') || 1,
      }));
      parsedPrice = cleanVariants[0].price;
    }

    try {
      const payload: any = {
        name: itemName.trim(),
        price: parsedPrice,
        categoryId: itemCategoryId,
        isFavorite: itemIsFavorite,
        trackInventory: itemTrackInventory,
      };

      if (itemTrackInventory) {
        payload.stockQuantity = parseFloat(itemStockQuantity) || 0;
        payload.stockUnit = itemStockUnit;
        payload.lowStockThreshold = parseFloat(itemLowStockThreshold) || 2;
      }

      if (cleanVariants && cleanVariants.length > 0) {
        payload.variants = cleanVariants;
      }

      if (editingItemId) {
        await DBServices.updateMenuItem(
          editingItemId,
          payload,
          tenant?.id,
          activeLocationId || undefined
        );
        toast.success('Item updated successfully!');
      } else {
        await DBServices.addMenuItem(
          {
            ...payload,
            isAvailable: true,
          },
          tenant?.id,
          activeLocationId || undefined
        );
        toast.success('Item added to menu!');
      }

      setItemModalOpen(false);
    } catch (e: any) {
      console.error('Error saving menu item:', e);
      toast.error(e.message || 'Could not save menu item.', 'Save Failed');
    }
  };

  // Save Category (Create or Update)
  
  const confirmDeleteCategory = (cat: { id: string; name: string }) => {
    setCategoryToDelete({ id: cat.id, name: cat.name });
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) return;
    try {
      if (editingCategoryId) {
        await DBServices.updateMenuCategory(editingCategoryId, catName.trim(), tenant?.id, activeLocationId || undefined);
      } else {
        await DBServices.addMenuCategory(catName.trim(), tenant?.id, activeLocationId || undefined);
      }
      setCatName('');
      setEditingCategoryId(null);
      setCategoryModalOpen(false);
    } catch (e: any) {
      toast.error(e.message, 'Item Save Error');
    }
  };

  const filteredItems = items
    .filter(i => {
      if (activeCategory === 'favorites') return i.isFavorite === true;
      if (activeCategory === 'all') return true;
      return i.categoryId === activeCategory;
    })
    .filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <SafeAreaView className="flex-1 bg-[#090D1A]">
      <Header
        title="Menu Management"
        subtitle={`${items.length} Items • ${categories.length} Categories • ${favoriteCount}/10 Favorites`}
        rightElement={
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={() => setExcelModalOpen(true)}
              className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center"
            >
              <FileSpreadsheet size={15} color="white" />
              <Text className="text-white font-bold text-xs ml-1">Excel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openAddItemModal}
              className="bg-[#5D3FD3] px-3 py-1.5 rounded-xl flex-row items-center"
            >
              <Plus size={15} color="white" />
              <Text className="text-white font-bold text-xs ml-1">Add Item</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Search Bar */}
      <View className="px-4 py-2.5 bg-[#090D1A]">
        <View className="flex-row items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
          <Search size={16} color="#64748B" />
          <TextInput
            placeholder="Search items to edit..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 ml-2 text-xs text-white"
          />
        </View>
      </View>

      {/* Sub-menu Category Bar with Favorites */}
      <View className="py-2 bg-[#0A0F1D] border-b border-slate-800">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4">
          <TouchableOpacity
            onPress={() => setActiveCategory('favorites')}
            className={`mr-2 px-3 py-1.5 rounded-full flex-row items-center border ${
              activeCategory === 'favorites'
                ? 'bg-amber-500/20 border-amber-500'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <Star size={12} color="#F59E0B" fill={activeCategory === 'favorites' ? '#F59E0B' : 'transparent'} />
            <Text className={`text-xs ml-1 font-bold ${activeCategory === 'favorites' ? 'text-amber-400' : 'text-slate-400'}`}>
              Favorites ({favoriteCount}/10)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveCategory('all')}
            className={`mr-2 px-3.5 py-1.5 rounded-full border ${
              activeCategory === 'all'
                ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <Text className={`text-xs font-semibold ${activeCategory === 'all' ? 'text-white' : 'text-slate-400'}`}>
              All ({items.length})
            </Text>
          </TouchableOpacity>

          {categories.map(cat => {
            const count = items.filter(i => i.categoryId === cat.id).length;
            const isActive = activeCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setActiveCategory(cat.id)}
                onLongPress={() => confirmDeleteCategory(cat)}
                className={`mr-2 px-3 py-1.5 rounded-full border flex-row items-center ${
                  isActive
                    ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <Text className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-slate-400'}`}>
                  {cat.name} ({count})
                </Text>

                {isActive && (
                  <View className="flex-row items-center ml-2 pl-2 border-l border-white/20 gap-1.5">
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        setEditingCategoryId(cat.id);
                        setCatName(cat.name);
                        setCategoryModalOpen(true);
                      }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Pencil size={11} color="white" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        confirmDeleteCategory(cat);
                      }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Trash2 size={11} color="#FDA4AF" />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            onPress={() => {
              setEditingCategoryId(null);
              setCatName('');
              setCategoryModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 flex-row items-center mr-2 active:bg-slate-700"
          >
            <Plus size={13} color="#818CF8" />
            <Text className="text-indigo-300 text-xs font-bold ml-1">+ Category</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setManageCategoriesOpen(true)}
            className="px-3 py-1.5 rounded-full bg-purple-900/30 border border-purple-500/40 flex-row items-center mr-4 active:bg-purple-900/50"
          >
            <Layers size={13} color="#C084FC" />
            <Text className="text-purple-300 text-xs font-bold ml-1">Manage All Categories</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Items List */}
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 80, 100) }}
        renderItem={({ item }) => (
          <View className="bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-2.5 flex-row items-center justify-between shadow-lg">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center">
                <TouchableOpacity onPress={() => handleToggleFavorite(item)} className="mr-2">
                  <Star
                    size={18}
                    color={item.isFavorite ? '#F59E0B' : '#475569'}
                    fill={item.isFavorite ? '#F59E0B' : 'transparent'}
                  />
                </TouchableOpacity>
                <Text className="text-white font-bold text-base flex-1" numberOfLines={1}>
                  {item.name}
                </Text>
              </View>

              {item.variants && item.variants.length > 0 ? (
                <Text className="text-indigo-400 text-xs mt-1">
                  {item.variants.length} Variants: {item.variants.map(v => `${v.name} (₹${v.price})`).join(', ')}
                </Text>
              ) : (
                <Text className="text-slate-400 text-xs mt-1">Price: ₹{item.price}</Text>
              )}
            </View>

            {/* Action Buttons: Edit and Delete */}
            <View className="flex-row items-center gap-1.5">
              <TouchableOpacity
                onPress={() => openEditItemModal(item)}
                className="p-2 rounded-xl bg-slate-800 border border-slate-700"
              >
                <Pencil size={15} color="#818CF8" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setItemToDelete(item)}
                className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 active:bg-rose-500/30"
              >
                <Trash2 size={15} color="#F43F5E" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="py-16 items-center">
            <Text className="text-slate-400 text-xs">No items match your filter.</Text>
          </View>
        }
      />

      {/* Add / Edit Item Modal */}
      {isItemModalOpen && (
        <Modal visible={true} transparent animationType="slide">
          <View className="flex-1 justify-center items-center bg-black/75 p-4" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md max-h-[85%] relative overflow-hidden">
                {/* DEDICATED INVENTORY CONFIGURATION DIALOG / MODAL */}
                {isInventoryModalVisible && (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0B1120', zIndex: 100, padding: 20, justifyContent: 'center' }}>
                    <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-slate-800">
                      <View className="flex-row items-center">
                        <Package size={20} color="#818CF8" />
                        <Text className="text-white font-black text-base ml-2">Configure Live Inventory</Text>
                      </View>
                      <TouchableOpacity onPress={() => setIsInventoryModalVisible(false)} className="p-1 bg-slate-800 rounded-full">
                        <X size={18} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>

                    <Text className="text-slate-300 font-bold text-xs mb-1">Current Stock Quantity *</Text>
                    <TextInput
                      placeholder="e.g. 10"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                      value={itemStockQuantity}
                      onChangeText={setItemStockQuantity}
                      className="bg-slate-950 border border-slate-700 text-white text-base p-3 rounded-2xl mb-3 font-bold"
                    />

                    <Text className="text-slate-300 font-bold text-xs mb-1.5">Measurement Unit *</Text>
                    <View className="flex-row flex-wrap gap-2 mb-3">
                      {(['kg', 'g', 'pcs', 'portions', 'ltr', 'ml'] as const).map(unit => (
                        <TouchableOpacity
                          key={unit}
                          onPress={() => setItemStockUnit(unit)}
                          className={`px-3 py-1.5 rounded-xl border ${itemStockUnit === unit ? 'bg-[#5D3FD3] border-[#5D3FD3]' : 'bg-slate-800 border-slate-700'}`}
                        >
                          <Text className={`text-xs font-bold ${itemStockUnit === unit ? 'text-white' : 'text-slate-400'}`}>
                            {unit}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text className="text-slate-300 font-bold text-xs mb-1">Low Stock Warning Threshold *</Text>
                    <TextInput
                      placeholder="e.g. 2"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                      value={itemLowStockThreshold}
                      onChangeText={setItemLowStockThreshold}
                      className="bg-slate-950 border border-slate-700 text-white text-base p-3 rounded-2xl mb-4 font-bold"
                    />

                    <View className="bg-indigo-500/10 border border-indigo-500/30 p-3 rounded-2xl mb-4">
                      <Text className="text-indigo-300 text-xs">
                        When available stock drops below {itemLowStockThreshold || 0} {itemStockUnit}, POS and Menu screens will highlight this item with a low stock badge.
                      </Text>
                    </View>

                    <View className="flex-row gap-2">
                      <Button
                        title="Cancel"
                        variant="secondary"
                        onPress={() => setIsInventoryModalVisible(false)}
                        className="flex-1"
                      />
                      <Button
                        title="Save & Enable Stock"
                        onPress={() => {
                          setItemTrackInventory(true);
                          setIsInventoryModalVisible(false);
                        }}
                        className="flex-1"
                      />
                    </View>
                  </View>
                )}
              <View className="flex-row justify-between items-center mb-4 border-b border-slate-800 pb-2">
                <Text className="text-white font-black text-lg">
                  {editingItemId ? 'Edit Menu Item' : 'Add Menu Item'}
                </Text>
                <TouchableOpacity onPress={() => setItemModalOpen(false)}>
                  <X size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Input
                  label="Item Name *"
                  placeholder="e.g. Chicken Biryani"
                  value={itemName}
                  onChangeText={setItemName}
                />

                <View className="mb-3">
                  <Text className="text-slate-300 font-bold text-xs mb-1.5">Category *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                    {categories.length === 0 ? (
                    <TouchableOpacity
                      onPress={() => {
                        setItemModalOpen(false);
                        openAddCategoryModal();
                      }}
                      className="bg-purple-600/30 border border-purple-500/50 px-3 py-2 rounded-xl flex-row items-center"
                    >
                      <Plus size={14} color="#C084FC" />
                      <Text className="text-purple-300 text-xs font-bold ml-1.5">+ Add Category First</Text>
                    </TouchableOpacity>
                  ) : (
                    categories.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setItemCategoryId(c.id)}
                        className={`mr-2 px-3 py-1.5 rounded-xl border ${
                          itemCategoryId === c.id
                            ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                            : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <Text className="text-white text-xs font-semibold">{c.name}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                  </ScrollView>
                </View>

                {/* Favorite Toggle */}
                <TouchableOpacity
                  onPress={() => setItemIsFavorite(!itemIsFavorite)}
                  className="flex-row items-center justify-between bg-slate-800/80 border border-slate-700 p-3 rounded-xl mb-3"
                >
                  <View className="flex-row items-center">
                    <Star size={16} color="#F59E0B" fill={itemIsFavorite ? '#F59E0B' : 'transparent'} />
                    <Text className="text-white font-bold text-xs ml-2">Mark as Favorite Item</Text>
                  </View>
                  <Text className={`text-xs font-bold ${itemIsFavorite ? 'text-amber-400' : 'text-slate-500'}`}>
                    {itemIsFavorite ? '★ Starred' : 'Off'}
                  </Text>
                </TouchableOpacity>

                                {/* Live Inventory Tracking Trigger & Status */}
                {itemTrackInventory ? (
                  <View className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl mb-3">
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center flex-1 mr-2">
                        <Package size={18} color="#10B981" />
                        <View className="ml-2.5">
                          <Text className="text-white font-bold text-xs">Live Stock Inventory: Active</Text>
                          <Text className="text-emerald-400 font-bold text-[11px] mt-0.5">
                            Stock: {itemStockQuantity || 0} {itemStockUnit} (Alert &lt;= {itemLowStockThreshold})
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row gap-1.5 items-center">
                        <TouchableOpacity
                          onPress={() => setIsInventoryModalVisible(true)}
                          className="bg-indigo-600 px-3 py-1.5 rounded-xl shadow-sm"
                        >
                          <Text className="text-white font-bold text-xs">Configure</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setItemTrackInventory(false)}
                          className="bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-xl"
                        >
                          <Text className="text-slate-400 text-xs font-bold">Turn Off</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Inline Stock Parameters */}
                    <View className="pt-2 border-t border-emerald-500/20">
                      <View className="flex-row gap-2 mb-2">
                        <View className="flex-1">
                          <Text className="text-slate-400 text-[10px] font-bold mb-1">Available Qty</Text>
                          <TextInput
                            placeholder="10"
                            placeholderTextColor="#64748B"
                            keyboardType="numeric"
                            value={itemStockQuantity}
                            onChangeText={setItemStockQuantity}
                            className="bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-xl font-bold"
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-slate-400 text-[10px] font-bold mb-1">Low Stock Alert &lt;=</Text>
                          <TextInput
                            placeholder="2"
                            placeholderTextColor="#64748B"
                            keyboardType="numeric"
                            value={itemLowStockThreshold}
                            onChangeText={setItemLowStockThreshold}
                            className="bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-xl font-bold"
                          />
                        </View>
                      </View>
                      <View className="flex-row flex-wrap gap-1 mt-1">
                        {(['kg', 'g', 'pcs', 'portions', 'ltr', 'ml'] as const).map(unit => (
                          <TouchableOpacity
                            key={unit}
                            onPress={() => setItemStockUnit(unit)}
                            className={`px-2 py-0.5 rounded-lg border ${itemStockUnit === unit ? 'bg-emerald-600 border-emerald-500' : 'bg-slate-800 border-slate-700'}`}
                          >
                            <Text className={`text-[10px] font-bold ${itemStockUnit === unit ? 'text-white' : 'text-slate-400'}`}>
                              {unit}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      setItemTrackInventory(true);
                      setIsInventoryModalVisible(true);
                    }}
                    className="flex-row items-center justify-between bg-slate-800/80 border border-slate-700 p-3.5 rounded-2xl mb-3 active:opacity-80"
                  >
                    <View className="flex-row items-center">
                      <Package size={16} color="#818CF8" />
                      <Text className="text-white font-bold text-xs ml-2">Track Live Stock Inventory</Text>
                    </View>
                    <View className="bg-[#5D3FD3] px-3 py-1 rounded-xl">
                      <Text className="text-white text-xs font-bold">+ Enable Stock</Text>
                    </View>
                  </TouchableOpacity>
                )}

                  {/* Has Variants Toggle */}
                <TouchableOpacity
                  onPress={() => setHasVariants(!hasVariants)}
                  className="flex-row items-center justify-between bg-slate-800/80 border border-slate-700 p-3 rounded-xl mb-3"
                >
                  <Text className="text-white font-bold text-xs">Multiple Sizes / Variants (Half, Full)?</Text>
                  <Text className={`text-xs font-bold ${hasVariants ? 'text-indigo-400' : 'text-slate-500'}`}>
                    {hasVariants ? 'YES' : 'NO'}
                  </Text>
                </TouchableOpacity>

                {hasVariants ? (
                  <View className="bg-slate-800/50 p-3 rounded-2xl mb-3 border border-slate-750">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-slate-300 font-bold text-xs">Variants & Prices</Text>
                      <TouchableOpacity
                        onPress={() => setVariants([...variants, { name: '', price: '', portionDeduction: '1' }])}
                        className="bg-[#5D3FD3] px-2 py-1 rounded"
                      >
                        <Text className="text-white text-[11px] font-bold">+ Variant</Text>
                      </TouchableOpacity>
                    </View>

                    {variants.map((v, i) => (
                      <View key={i} className="flex-row items-center gap-2 mb-2">
                        <TextInput
                          placeholder="e.g. Full / Half"
                          placeholderTextColor="#64748B"
                          value={v.name}
                          onChangeText={txt => {
                            const newVars = [...variants];
                            newVars[i].name = txt;
                            setVariants(newVars);
                          }}
                          className="flex-1 bg-slate-900 border border-slate-700 text-white text-xs p-2 rounded-xl"
                        />
                        <TextInput
                          placeholder="Price"
                          placeholderTextColor="#64748B"
                          keyboardType="numeric"
                          value={v.price}
                          onChangeText={txt => {
                            const newVars = [...variants];
                            newVars[i].price = txt;
                            setVariants(newVars);
                          }}
                          className="w-16 bg-slate-900 border border-slate-700 text-white text-xs p-2 rounded-xl"
                        />
                        {itemTrackInventory && (
                          <TextInput
                            placeholder={`Deducts (${itemStockUnit})`}
                            placeholderTextColor="#64748B"
                            keyboardType="numeric"
                            value={v.portionDeduction !== undefined ? String(v.portionDeduction) : ''}
                            onChangeText={txt => {
                              const newVars = [...variants];
                              newVars[i].portionDeduction = txt;
                              setVariants(newVars);
                            }}
                            className="w-24 bg-slate-900 border border-indigo-500/50 text-indigo-300 text-xs p-2 rounded-xl"
                          />
                        )}
                        <TouchableOpacity
                          onPress={() => setVariants(variants.filter((_, idx) => idx !== i))}
                          className="p-2 bg-rose-500/10 rounded-lg"
                        >
                          <Trash2 size={14} color="#F43F5E" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Input
                    label="Price (₹) *"
                    placeholder="e.g. 199"
                    keyboardType="numeric"
                    value={itemPrice}
                    onChangeText={setItemPrice}
                  />
                )}

                <View className="flex-row gap-2 mt-4">
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setItemModalOpen(false)}
                    className="flex-1"
                  />
                  <Button
                    title={editingItemId ? 'Update Item' : 'Save Item'}
                    onPress={handleSaveItem}
                    className="flex-1"
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Quick Restock Modal (e.g. Morning Chicken 10 kg) */}
      {restockTargetItem && (
        <Modal visible={true} transparent animationType="fade">
          <View className="flex-1 justify-center items-center bg-black/75 p-4">
            <View className="bg-slate-900 border border-indigo-500/40 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
              <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <View className="flex-row items-center">
                  <Package size={18} color="#818CF8" />
                  <Text className="text-white font-black text-base ml-2">Quick Restock</Text>
                </View>
                <TouchableOpacity onPress={() => setRestockTargetItem(null)}>
                  <Text className="text-slate-400 text-xs font-bold">Cancel</Text>
                </TouchableOpacity>
              </View>

              <Text className="text-slate-300 text-xs mb-1">
                Item: <Text className="text-white font-bold">{restockTargetItem.name}</Text>
              </Text>
              <Text className="text-slate-400 text-[11px] mb-3">
                Current Stock: <Text className="text-amber-400 font-bold">{restockTargetItem.stockQuantity || 0} {restockTargetItem.stockUnit || 'kg'}</Text>
              </Text>

              <Text className="text-slate-200 font-bold text-xs mb-1.5">
                Set Available Stock ({restockTargetItem.stockUnit || 'kg'}):
              </Text>
              <TextInput
                placeholder="e.g. 10"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                autoFocus
                value={restockAmount}
                onChangeText={setRestockAmount}
                className="bg-slate-950 border border-slate-700 text-white text-base p-3 rounded-2xl mb-4 font-bold"
              />

              <View className="flex-row gap-2">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setRestockTargetItem(null)}
                  className="flex-1"
                />
                <Button
                  title="Update Stock"
                  onPress={handleConfirmRestock}
                  isLoading={isRestocking}
                  className="flex-1"
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Add / Edit Category Modal */}
      {isCategoryModalOpen && (
        <Modal visible={true} transparent animationType="fade">
          <View className="flex-1 justify-center items-center bg-black/75 p-4" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm">
              <Text className="text-white font-black text-lg mb-3">
                {editingCategoryId ? 'Edit Category' : 'Add Category'}
              </Text>
              <Input
                label="Category Name *"
                placeholder="e.g. Biryani, Starters, Desserts"
                value={catName}
                onChangeText={setCatName}
              />
              {editingCategoryId && (
                <TouchableOpacity
                  onPress={() => {
                    const idToDelete = editingCategoryId;
                    const nameToDelete = catName;
                    setCategoryModalOpen(false);
                    setCategoryToDelete({ id: idToDelete, name: nameToDelete });
                  }}
                  className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex-row items-center justify-center mt-3 active:bg-rose-500/25"
                >
                  <Trash2 size={16} color="#F43F5E" />
                  <Text className="text-rose-400 font-bold text-xs ml-2">Delete This Category</Text>
                </TouchableOpacity>
              )}

              <View className="flex-row gap-2 mt-4">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setCategoryModalOpen(false)}
                  className="flex-1"
                />
                <Button
                  title={editingCategoryId ? 'Save' : 'Create'}
                  onPress={handleSaveCategory}
                  className="flex-1"
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      
      {/* Delete Item Confirmation Modal (Windows & Mobile universal) */}
      {itemToDelete && (
        <Modal transparent animationType="fade" visible={true} onRequestClose={() => setItemToDelete(null)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 p-6 rounded-3xl w-full max-w-sm">
              <View className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 items-center justify-center mb-4 self-center">
                <Trash2 size={24} color="#F43F5E" />
              </View>
              <Text className="text-white font-black text-lg text-center mb-1">Delete Menu Item?</Text>
              <Text className="text-slate-400 text-xs text-center mb-6 leading-relaxed">
                Are you sure you want to permanently delete <Text className="text-white font-bold">"{itemToDelete.name}"</Text> from the menu? This action cannot be undone.
              </Text>
              <View className="flex-row gap-2">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setItemToDelete(null)}
                  className="flex-1"
                />
                <TouchableOpacity
                  onPress={handleConfirmDeleteItem}
                  disabled={isDeleting}
                  className="flex-1 py-3 bg-rose-600 rounded-2xl items-center justify-center active:bg-rose-700"
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-sm">Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Delete Category Confirmation Modal (Windows & Mobile universal) */}
      {categoryToDelete && (
        <Modal transparent animationType="fade" visible={true} onRequestClose={() => setCategoryToDelete(null)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 p-6 rounded-3xl w-full max-w-sm">
              <View className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 items-center justify-center mb-4 self-center">
                <Trash2 size={24} color="#F43F5E" />
              </View>
              <Text className="text-white font-black text-lg text-center mb-1">Delete Category?</Text>
              <Text className="text-slate-400 text-xs text-center mb-6 leading-relaxed">
                Are you sure you want to delete category <Text className="text-white font-bold">"{categoryToDelete.name}"</Text> and all menu items inside it?
              </Text>
              <View className="flex-row gap-2">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setCategoryToDelete(null)}
                  className="flex-1"
                />
                <TouchableOpacity
                  onPress={handleConfirmDeleteCategory}
                  disabled={isDeleting}
                  className="flex-1 py-3 bg-rose-600 rounded-2xl items-center justify-center active:bg-rose-700"
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-sm">Delete All</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      
      {/* Manage Categories Full List Modal */}
      {isManageCategoriesOpen && (
        <Modal transparent animationType="fade" visible={isManageCategoriesOpen} onRequestClose={() => setManageCategoriesOpen(false)}>
          <View className="flex-1 bg-black/80 items-center justify-center p-4">
            <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
              <View className="p-5 border-b border-slate-800 flex-row items-center justify-between bg-slate-950/60">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 items-center justify-center mr-3">
                    <Layers size={20} color="#C084FC" />
                  </View>
                  <View>
                    <Text className="text-white font-black text-base">Menu Categories</Text>
                    <Text className="text-slate-400 text-xs">{categories.length} total categories</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setManageCategoriesOpen(false)} className="p-2 rounded-xl bg-slate-800">
                  <X size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView className="p-4 max-h-[400px]" showsVerticalScrollIndicator={false}>
                {categories.length === 0 ? (
                  <View className="py-8 items-center justify-center">
                    <Text className="text-slate-400 text-xs">No categories created yet.</Text>
                  </View>
                ) : (
                  categories.map((cat) => {
                    const catItemsCount = items.filter((i) => i.categoryId === cat.id).length;
                    return (
                      <View
                        key={cat.id}
                        className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 mb-2.5 flex-row items-center justify-between"
                      >
                        <View className="flex-1 mr-3">
                          <Text className="text-white font-bold text-sm">{cat.name}</Text>
                          <Text className="text-slate-400 text-xs mt-0.5">
                            {catItemsCount} {catItemsCount === 1 ? 'menu item' : 'menu items'}
                          </Text>
                        </View>

                        <View className="flex-row items-center gap-2">
                          <TouchableOpacity
                            onPress={() => {
                              setManageCategoriesOpen(false);
                              setEditingCategoryId(cat.id);
                              setCatName(cat.name);
                              setCategoryModalOpen(true);
                            }}
                            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 active:bg-slate-700"
                            accessibilityLabel="Edit category"
                          >
                            <Pencil size={15} color="#818CF8" />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              setManageCategoriesOpen(false);
                              setCategoryToDelete({ id: cat.id, name: cat.name });
                            }}
                            className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 active:bg-rose-500/30"
                            accessibilityLabel="Delete category"
                          >
                            <Trash2 size={15} color="#F43F5E" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View className="p-4 border-t border-slate-800 bg-slate-950/80 flex-row gap-2">
                <Button
                  title="Close"
                  variant="secondary"
                  onPress={() => setManageCategoriesOpen(false)}
                  className="flex-1"
                />
                <Button
                  title="+ New Category"
                  onPress={() => {
                    setManageCategoriesOpen(false);
                    setEditingCategoryId(null);
                    setCatName('');
                    setCategoryModalOpen(true);
                  }}
                  className="flex-1"
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Excel Modal */}
      <MenuExcelImportModal isVisible={isExcelModalOpen} onClose={() => setExcelModalOpen(false)} />
    </SafeAreaView>
  );
};
