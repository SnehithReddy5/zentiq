import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, Alert, ScrollView, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Trash2, Pencil, Search, FileSpreadsheet, Star, Sparkles, X, Check } from 'lucide-react-native';
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
  const [isItemModalOpen, setItemModalOpen] = useState(false);
  const [isExcelModalOpen, setExcelModalOpen] = useState(false);

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
  const [variants, setVariants] = useState<{ id?: string; name: string; price: string }[]>([]);

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
          Alert.alert(
            'Favorite Limit Reached',
            'Only a maximum of 10 favorite items can be selected at once. Please unstar an existing favorite item first before adding a new one.'
          );
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
      Alert.alert('Error', e.message);
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
    setItemModalOpen(true);
  };

  // Open Edit Item Modal
  const openEditItemModal = (item: MenuItem) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemPrice(item.price.toString());
    setItemCategoryId(item.categoryId);
    setItemIsFavorite(!!item.isFavorite);
    if (item.variants && item.variants.length > 0) {
      setHasVariants(true);
      setVariants(item.variants.map(v => ({ id: v.id, name: v.name, price: v.price.toString() })));
    } else {
      setHasVariants(false);
      setVariants([]);
    }
    setItemModalOpen(true);
  };

  // Save Item (Create or Update)
  const handleSaveItem = async () => {
    if (!itemName.trim()) {
      Alert.alert('Required', 'Item name is required.');
      return;
    }

    if (!itemCategoryId) {
      if (categories.length === 0) {
        Alert.alert('Category Needed', 'Please create a menu category first before adding items.');
        return;
      }
      Alert.alert('Required', 'Please select a category for this item.');
      return;
    }

    // Check favorite limit if turning on favorite
    if (itemIsFavorite) {
      const isAlreadyFav = editingItemId ? items.find(i => i.id === editingItemId)?.isFavorite : false;
      if (!isAlreadyFav && favoriteCount >= 10) {
        Alert.alert(
          'Favorite Limit Reached',
          'Only a maximum of 10 favorite items can be selected at once. Please unstar another item first.'
        );
        return;
      }
    }

    let parsedPrice = parseFloat(itemPrice) || 0;
    let cleanVariants: MenuItemVariant[] | undefined = undefined;

    if (hasVariants) {
      const validVariants = variants.filter(v => v.name.trim().length > 0);
      if (validVariants.length === 0) {
        Alert.alert('Variants Required', 'Please add at least one named variant or turn off multiple sizes.');
        return;
      }
      cleanVariants = validVariants.map((v, idx) => ({
        id: v.id || `var_${Date.now()}_${idx}`,
        name: v.name.trim(),
        price: parseFloat(v.price) || 0,
      }));
      parsedPrice = cleanVariants[0].price;
    }

    try {
      const payload: any = {
        name: itemName.trim(),
        price: parsedPrice,
        categoryId: itemCategoryId,
        isFavorite: itemIsFavorite,
      };

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
        Alert.alert('Success', 'Item updated successfully!');
      } else {
        await DBServices.addMenuItem(
          {
            ...payload,
            isAvailable: true,
          },
          tenant?.id,
          activeLocationId || undefined
        );
        Alert.alert('Success', 'Item added to menu!');
      }

      setItemModalOpen(false);
    } catch (e: any) {
      console.error('Error saving menu item:', e);
      Alert.alert('Save Failed', e.message || 'Could not save menu item.');
    }
  };

  // Save Category (Create or Update)
  
  const confirmDeleteCategory = (cat: { id: string; name: string }) => {
    const itemCount = items.filter(i => i.categoryId === cat.id).length;
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete category "${cat.name}"?${itemCount > 0 ? ` This will also remove ${itemCount} item(s) in this category.` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Category',
          style: 'destructive',
          onPress: async () => {
            try {
              await DBServices.deleteMenuCategory(cat.id, tenant?.id, activeLocationId || undefined);
              setActiveCategory('all');
              setCategoryModalOpen(false);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
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
      Alert.alert('Error', e.message);
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
            className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 flex-row items-center mr-4"
          >
            <Plus size={13} color="#818CF8" />
            <Text className="text-indigo-300 text-xs font-bold ml-1">+ Category</Text>
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
                onPress={() => {
                  Alert.alert('Delete Item', `Delete "${item.name}" from menu?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => DBServices.deleteMenuItem(item.id, tenant?.id, activeLocationId || undefined),
                    },
                  ]);
                }}
                className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20"
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
            <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md max-h-[85%]">
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
                        onPress={() => setVariants([...variants, { name: '', price: '' }])}
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
                          className="w-20 bg-slate-900 border border-slate-700 text-white text-xs p-2 rounded-xl"
                        />
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

      {/* Excel Modal */}
      <MenuExcelImportModal isVisible={isExcelModalOpen} onClose={() => setExcelModalOpen(false)} />
    </SafeAreaView>
  );
};
