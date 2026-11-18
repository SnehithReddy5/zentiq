import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Plus, Minus, Star, Layers, Sparkles } from 'lucide-react-native';
import { MenuItem, getItemInteractionType } from '../../../types/menu.types';
import { useThemeStore } from '../../../store/theme.store';

interface ProductCardProps {
  item: MenuItem;
  cartQty: number;
  isOutOfStock: boolean;
  lowStockText?: string | null;
  onPress: (item: MenuItem) => void;
  onIncrement: (item: MenuItem, currentQty: number) => void;
  onDecrement: (item: MenuItem, currentQty: number) => void;
  viewMode?: 'grid' | 'lines';
  cardWidth?: string | number;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  item,
  cartQty,
  isOutOfStock,
  lowStockText,
  onPress,
  onIncrement,
  onDecrement,
  viewMode = 'grid',
  cardWidth,
}) => {
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  const interaction = getItemInteractionType(item);
  const isDirectAdd = interaction === 'DIRECT_ADD';
  const isVariant = interaction === 'VARIANT_SELECTION';
  const isCustomizable = interaction === 'CUSTOMIZABLE';

  const lastTapRef = useRef<number>(0);

  const handleCardPress = () => {
    if (isOutOfStock) return;
    const now = Date.now();
    // 220ms debounce to prevent rapid accidental double-taps on iPad touchscreens
    if (now - lastTapRef.current < 220) return;
    lastTapRef.current = now;

    onPress(item);
  };

  if (viewMode === 'lines') {
    return (
      <TouchableOpacity
        activeOpacity={isOutOfStock ? 1 : 0.75}
        onPress={handleCardPress}
        disabled={isOutOfStock}
        className={`p-4 rounded-2xl mb-3 flex-row items-center justify-between border shadow-sm transition-all ${
          isOutOfStock
            ? isDark
              ? 'bg-slate-900/50 border-rose-950/40 opacity-60'
              : 'bg-slate-100 border-slate-200 opacity-60'
            : cartQty > 0
            ? isDark
              ? 'bg-[#151D38] border-2 border-[#5D3FD3] shadow-md shadow-purple-500/10'
              : 'bg-purple-50/70 border-2 border-[#5D3FD3] shadow-sm'
            : isDark
            ? 'bg-[#111827] border-slate-800 active:bg-slate-850'
            : 'bg-white border-slate-200 active:bg-slate-50'
        }`}
      >
        <View className="flex-1 mr-3">
          <View className="flex-row items-center flex-wrap gap-1.5">
            {item.isFavorite && (
              <View className="mr-0.5 bg-amber-500/20 px-1.5 py-0.5 rounded flex-row items-center">
                <Star size={10} color="#FBBF24" fill="#FBBF24" />
              </View>
            )}
            <Text
              className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-900'}`}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            {isVariant && (
              <View className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40">
                <Text className="text-[10px] font-bold text-indigo-300">Sizes Available</Text>
              </View>
            )}
            {isCustomizable && (
              <View className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40">
                <Text className="text-[10px] font-bold text-purple-300">Customizable</Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center gap-2 mt-1">
            <Text className={`font-black text-lg ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              ₹{item.price}
            </Text>
            {lowStockText && (
              <Text className="text-amber-400 font-bold text-[11px]">{lowStockText}</Text>
            )}
          </View>
        </View>

        {/* Action / Stepper */}
        {isOutOfStock ? (
          <View className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl">
            <Text className="text-rose-400 font-bold text-xs uppercase">Out of Stock</Text>
          </View>
        ) : cartQty > 0 && isDirectAdd ? (
          <View
            className={`flex-row items-center rounded-2xl p-1 border ${
              isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}
          >
            <TouchableOpacity
              className={`w-10 h-10 rounded-xl items-center justify-center border active:opacity-75 ${
                isDark ? 'bg-slate-800 border-slate-750' : 'bg-white border-slate-300'
              }`}
              onPress={() => onDecrement(item, cartQty)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Minus size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
            </TouchableOpacity>

            <Text
              className={`w-8 text-center font-black text-sm ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {cartQty}
            </Text>

            <TouchableOpacity
              className="w-10 h-10 rounded-xl bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-md shadow-purple-500/30"
              onPress={() => onIncrement(item, cartQty)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Plus size={18} color="white" />
            </TouchableOpacity>
          </View>
        ) : (
          <View
            className={`px-4 py-2.5 rounded-xl flex-row items-center gap-1.5 ${
              isDark ? 'bg-[#5D3FD3]' : 'bg-[#5D3FD3]'
            } shadow-md shadow-purple-500/20`}
          >
            {isVariant ? (
              <Layers size={14} color="white" />
            ) : isCustomizable ? (
              <Sparkles size={14} color="white" />
            ) : (
              <Plus size={14} color="white" />
            )}
            <Text className="text-white font-black text-xs">
              {cartQty > 0
                ? `${cartQty} in cart`
                : isVariant
                ? 'Sizes'
                : isCustomizable
                ? 'Customize'
                : 'Add'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // Grid View Card (iPad Tablet First: Large touch area, min 125pt height)
  return (
    <View style={{ width: cardWidth || '100%', padding: 4 }}>
      <TouchableOpacity
        activeOpacity={isOutOfStock ? 1 : 0.75}
        onPress={handleCardPress}
        disabled={isOutOfStock}
        className={`rounded-2xl p-3.5 justify-between border shadow-sm transition-all min-h-[130px] ${
          isOutOfStock
            ? isDark
              ? 'bg-slate-900/50 border-rose-950/40 opacity-60'
              : 'bg-slate-100 border-slate-200 opacity-60'
            : cartQty > 0
            ? isDark
              ? 'bg-[#151D38] border-2 border-[#5D3FD3] shadow-lg shadow-purple-500/20'
              : 'bg-purple-50/70 border-2 border-[#5D3FD3] shadow-md'
            : isDark
            ? 'bg-[#111827] border-slate-800/90 active:bg-slate-850'
            : 'bg-white border-slate-200 active:bg-slate-50'
        }`}
      >
        {/* Top: Name & Badges */}
        <View className="flex-row items-start justify-between mb-2">
          <View className="flex-1 mr-1">
            <View className="flex-row items-center flex-wrap gap-1">
              {item.isFavorite && (
                <View className="mr-0.5 bg-amber-500/20 px-1 py-0.5 rounded">
                  <Star size={10} color="#FBBF24" fill="#FBBF24" />
                </View>
              )}
              <Text
                className={`font-black text-sm sm:text-base leading-snug ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
                numberOfLines={2}
              >
                {item.name}
              </Text>
            </View>

            {isOutOfStock ? (
              <Text className="text-rose-400 font-bold text-[9px] uppercase mt-1">Out of Stock</Text>
            ) : lowStockText ? (
              <Text className="text-amber-400 font-bold text-[10px] mt-0.5">{lowStockText}</Text>
            ) : null}
          </View>

          {/* Cart Quantity Indicator Badge */}
          {cartQty > 0 && (
            <View className="bg-[#5D3FD3] px-2 py-0.5 rounded-full shrink-0 shadow-sm shadow-purple-500/30">
              <Text className="text-white text-[11px] font-black">{cartQty}</Text>
            </View>
          )}
        </View>

        {/* Bottom Row: Price & Large Touch Stepper or Action Pill */}
        <View className="flex-row items-end justify-between mt-auto pt-2">
          <View>
            <Text
              className={`font-black text-lg sm:text-xl tracking-tight ${
                isDark ? 'text-emerald-400' : 'text-emerald-600'
              }`}
            >
              ₹{item.price}
            </Text>
            {isVariant && (
              <Text className="text-indigo-400 text-[10px] font-bold">Sizes ▾</Text>
            )}
            {isCustomizable && (
              <Text className="text-purple-400 text-[10px] font-bold">Options ✨</Text>
            )}
          </View>

          {/* Direct Add Inline Stepper (When added to cart) */}
          {cartQty > 0 && isDirectAdd ? (
            <View
              className={`flex-row items-center rounded-2xl p-0.5 border ${
                isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <TouchableOpacity
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl items-center justify-center border active:opacity-75 ${
                  isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                }`}
                onPress={() => onDecrement(item, cartQty)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Minus size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
              </TouchableOpacity>

              <Text
                className={`w-7 text-center font-black text-sm ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {cartQty}
              </Text>

              <TouchableOpacity
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-md shadow-purple-500/30"
                onPress={() => onIncrement(item, cartQty)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Plus size={18} color="white" />
              </TouchableOpacity>
            </View>
          ) : isOutOfStock ? (
            <View className="bg-slate-800/80 border border-slate-700 px-2.5 py-1 rounded-xl">
              <Text className="text-rose-400 font-bold text-[10px] uppercase">Out</Text>
            </View>
          ) : (
            <View
              className={`px-3 py-1.5 rounded-xl flex-row items-center gap-1 shadow-sm ${
                cartQty > 0
                  ? 'bg-purple-600/30 border border-purple-500/50'
                  : 'bg-[#5D3FD3] shadow-purple-500/20'
              }`}
            >
              {isVariant ? (
                <Layers size={13} color="white" />
              ) : isCustomizable ? (
                <Sparkles size={13} color="white" />
              ) : (
                <Plus size={14} color="white" />
              )}
              <Text className="text-white font-black text-xs">
                {cartQty > 0
                  ? `${cartQty}`
                  : isVariant
                  ? 'Sizes'
                  : isCustomizable
                  ? 'Custom'
                  : 'Add'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

