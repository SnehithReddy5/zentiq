import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { X, Check, Plus, Minus, Layers } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (item && item.variants && item.variants.length > 0) {
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
      <View className="flex-1 justify-end sm:justify-center items-center bg-black/60 sm:p-4 z-50">
        <TouchableOpacity
          className="absolute inset-0"
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          className={`w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl px-5 pt-3 pb-5 sm:p-6 shadow-2xl border ${
            isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-100'
          }`}
          style={{ paddingBottom: Math.max(insets.bottom + 8, 20) }}
        >
          {/* Pull handle indicator on mobile */}
          <View className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 self-center mb-3 sm:hidden" />

          {/* Header */}
          <View
            className={`flex-row items-center justify-between pb-3.5 mb-3.5 border-b ${
              isDark ? 'border-slate-800/80' : 'border-slate-100'
            }`}
          >
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-1.5 mb-1">
                <View className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/20 flex-row items-center gap-1">
                  <Layers size={11} color="#A855F7" />
                  <Text className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                    Select Size
                  </Text>
                </View>
              </View>
              <Text
                className={`text-base sm:text-lg font-black leading-snug ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              className={`w-8 h-8 rounded-full items-center justify-center border ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
              } active:opacity-70`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={16} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
          </View>

          {/* Variant Selection Tiles */}
          <ScrollView className="max-h-[260px] mb-4" showsVerticalScrollIndicator={false}>
            <View className="gap-2">
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
                    className={`flex-row items-center justify-between p-3 sm:p-3.5 rounded-2xl border transition-all ${
                      isOutOfStock
                        ? isDark
                          ? 'bg-slate-900/40 border-slate-800/60 opacity-40'
                          : 'bg-slate-100 border-slate-200 opacity-40'
                        : isSelected
                        ? isDark
                          ? 'bg-purple-950/30 border-[1.5px] border-[#5D3FD3] shadow-sm shadow-purple-500/20'
                          : 'bg-purple-50/80 border-[1.5px] border-[#5D3FD3] shadow-sm'
                        : isDark
                        ? 'bg-slate-850/60 border border-slate-800 active:bg-slate-800'
                        : 'bg-slate-50/80 border border-slate-200/80 active:bg-slate-100'
                    }`}
                  >
                    <View className="flex-row items-center flex-1 mr-3">
                      {/* Selection Radio Indicator */}
                      <View
                        className={`w-5 h-5 rounded-full items-center justify-center mr-3 border ${
                          isSelected
                            ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                            : isDark
                            ? 'border-slate-600 bg-slate-800'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check size={12} color="white" strokeWidth={3} />}
                      </View>
                      <View className="flex-1">
                        <Text
                          className={`text-sm ${
                            isSelected
                              ? isDark
                                ? 'text-purple-200 font-black'
                                : 'text-purple-900 font-black'
                              : isDark
                              ? 'text-slate-200 font-bold'
                              : 'text-slate-800 font-bold'
                          }`}
                        >
                          {v.name}
                        </Text>
                        {item.trackInventory && (
                          <Text
                            className={`text-[10px] mt-0.5 ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            Deducts {deduction} {item.stockUnit || 'kg'}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View className="items-end">
                      <Text
                        className={`text-sm sm:text-base ${
                          isSelected
                            ? 'font-black text-[#5D3FD3] dark:text-purple-300'
                            : isDark
                            ? 'font-extrabold text-white'
                            : 'font-extrabold text-slate-900'
                        }`}
                      >
                        ₹{v.price}
                      </Text>
                      {isOutOfStock && (
                        <Text className="text-rose-500 font-bold text-[9px] mt-0.5 uppercase">
                          Out of stock
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Bottom Integrated Action Bar: Capsule Stepper + Add Button */}
          <View className="flex-row items-center gap-2.5 pt-1">
            {/* Smooth Pill Capsule Stepper */}
            <View
              className={`flex-row items-center rounded-full border px-1.5 py-1 ${
                isDark
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <TouchableOpacity
                onPress={() => setQty((prev) => Math.max(1, prev - 1))}
                disabled={qty <= 1}
                className={`w-8 h-8 rounded-full items-center justify-center ${
                  qty <= 1
                    ? 'opacity-30'
                    : isDark
                    ? 'bg-slate-800 active:bg-slate-700'
                    : 'bg-white border border-slate-200 shadow-xs active:bg-slate-200'
                }`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Minus size={14} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2.5} />
              </TouchableOpacity>

              <Text
                className={`w-7 text-center font-black text-sm ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {qty}
              </Text>

              <TouchableOpacity
                onPress={() => setQty((prev) => prev + 1)}
                className="w-8 h-8 rounded-full items-center justify-center bg-[#5D3FD3] active:bg-[#4D32B8] shadow-sm shadow-purple-500/30"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Plus size={14} color="white" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Elevated Add Action Button */}
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!selectedVariant}
              className={`flex-1 h-11 sm:h-12 rounded-full bg-[#5D3FD3] active:bg-[#4D32B8] flex-row items-center justify-center px-4 shadow-md shadow-purple-500/30 ${
                !selectedVariant ? 'opacity-50' : ''
              }`}
            >
              <Text
                className="text-white font-black text-xs sm:text-sm tracking-wide shrink text-center"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                Add to Order • ₹{totalPrice.toFixed(0)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
