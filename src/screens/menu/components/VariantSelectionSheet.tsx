import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { X, Check, Plus, Minus, Layers } from 'lucide-react-native';
import { MenuItem, MenuItemVariant } from '../../../types/menu.types';
import { useThemeStore } from '../../../store/theme.store';

interface VariantSelectionSheetProps {
  isVisible: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onAddToCart: (variant: MenuItemVariant, qty: number) => void;
  getAvailableStock?: (item: MenuItem) => number;
}

export const VariantSelectionSheet: React.FC<VariantSelectionSheetProps> = ({
  isVisible,
  item,
  onClose,
  onAddToCart,
  getAvailableStock,
}) => {
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (item && item.variants && item.variants.length > 0) {
      // Default to first variant
      setSelectedVariant(item.variants[0]);
      setQty(1);
    }
  }, [item]);

  if (!isVisible || !item) return null;

  const variants = item.variants || [];
  const availStock = getAvailableStock ? getAvailableStock(item) : 999999;

  const handleConfirm = () => {
    if (!selectedVariant) return;
    onAddToCart(selectedVariant, qty);
    onClose();
  };

  const totalPrice = selectedVariant ? selectedVariant.price * qty : 0;

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/75 p-4 z-50">
        <View
          className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl border ${
            isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          {/* Header */}
          <View className="flex-row items-start justify-between pb-4 border-b border-slate-800/60 mb-4">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-2 mb-1">
                <View className="p-1.5 rounded-lg bg-[#5D3FD3]/20">
                  <Layers size={16} color="#A855F7" />
                </View>
                <Text
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isDark ? 'text-purple-400' : 'text-purple-600'
                  }`}
                >
                  Select Portion / Size
                </Text>
              </View>
              <Text
                className={`text-xl font-black leading-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
                numberOfLines={2}
              >
                {item.name}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              className={`p-2.5 rounded-full border ${
                isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-300'
              } active:opacity-80`}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={20} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
          </View>

          {/* Variant Tiles (Touch Targets min 56pt) */}
          <ScrollView className="max-h-[320px] mb-4">
            <View className="gap-2.5">
              {variants.map((v) => {
                const isSelected = selectedVariant?.id === v.id;
                const deduction = typeof v.portionDeduction === 'number' ? v.portionDeduction : 1;
                const isOutOfStock =
                  item.isAvailable === false ||
                  (item.trackInventory && availStock < deduction * qty);

                return (
                  <TouchableOpacity
                    key={v.id}
                    disabled={isOutOfStock}
                    onPress={() => setSelectedVariant(v)}
                    className={`flex-row items-center justify-between p-4 rounded-2xl border transition-all ${
                      isOutOfStock
                        ? isDark
                          ? 'bg-slate-900/40 border-slate-800/60 opacity-40'
                          : 'bg-slate-100 border-slate-200 opacity-40'
                        : isSelected
                        ? isDark
                          ? 'bg-purple-950/40 border-2 border-[#5D3FD3] shadow-md shadow-purple-500/20'
                          : 'bg-purple-50 border-2 border-[#5D3FD3] shadow-sm'
                        : isDark
                        ? 'bg-slate-850/80 border-slate-750 active:bg-slate-800'
                        : 'bg-slate-50 border-slate-200 active:bg-slate-100'
                    }`}
                  >
                    <View className="flex-row items-center flex-1 mr-3">
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center mr-3 border ${
                          isSelected
                            ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                            : isDark
                            ? 'border-slate-600 bg-slate-800'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check size={14} color="white" />}
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`font-black text-base ${
                            isSelected
                              ? isDark
                                ? 'text-white'
                                : 'text-purple-950'
                              : isDark
                              ? 'text-slate-200'
                              : 'text-slate-800'
                          }`}
                        >
                          {v.name}
                        </Text>
                        {item.trackInventory && (
                          <Text className="text-slate-400 text-[11px] mt-0.5">
                            Deducts {deduction} {item.stockUnit || 'kg'}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View className="items-end">
                      <Text
                        className={`font-black text-lg ${
                          isSelected ? 'text-emerald-400 font-black' : isDark ? 'text-emerald-400' : 'text-emerald-600'
                        }`}
                      >
                        ₹{v.price}
                      </Text>
                      {isOutOfStock && (
                        <Text className="text-rose-400 font-bold text-[10px] mt-0.5 uppercase">
                          Out of stock
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Quantity Stepper Row */}
          <View
            className={`flex-row items-center justify-between p-3.5 rounded-2xl mb-5 border ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <View>
              <Text className={`font-bold text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Quantity to Add
              </Text>
              <Text className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {qty} portion{qty > 1 ? 's' : ''}
              </Text>
            </View>

            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => setQty((prev) => Math.max(1, prev - 1))}
                disabled={qty <= 1}
                className={`w-12 h-12 rounded-2xl items-center justify-center border ${
                  qty <= 1
                    ? 'opacity-40 border-slate-700 bg-slate-800'
                    : isDark
                    ? 'bg-slate-800 border-slate-700 active:bg-slate-700'
                    : 'bg-white border-slate-300 active:bg-slate-100'
                }`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Minus size={20} color={isDark ? '#FFFFFF' : '#0F172A'} />
              </TouchableOpacity>

              <Text
                className={`text-xl font-black w-10 text-center ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {qty}
              </Text>

              <TouchableOpacity
                onPress={() => setQty((prev) => prev + 1)}
                className={`w-12 h-12 rounded-2xl items-center justify-center bg-[#5D3FD3] active:bg-[#4D32B8] shadow-md shadow-purple-500/30`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Plus size={20} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Add to Order Action Button (min 56pt height) */}
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!selectedVariant}
            className="w-full py-4 rounded-2xl bg-[#5D3FD3] active:bg-[#4D32B8] flex-row items-center justify-center shadow-xl shadow-purple-500/30"
          >
            <Text className="text-white font-black text-base tracking-wide">
              Add to Order • ₹{totalPrice.toFixed(0)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

