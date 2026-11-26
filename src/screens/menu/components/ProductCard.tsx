import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Image, Platform } from 'react-native';
import { Plus, Minus, Star, Layers, Sparkles } from 'lucide-react-native';
import { MenuItem, getItemInteractionType } from '../../../types/menu.types';
import { useThemeStore } from '../../../store/theme.store';
import { getAutoMenuItemImage } from '../../../utils/foodImageResolver';

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
  showImage?: boolean;
  categoryName?: string;
  isDark?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = React.memo(({
  item,
  cartQty,
  isOutOfStock,
  lowStockText,
  onPress,
  onIncrement,
  onDecrement,
  viewMode = 'grid',
  cardWidth,
  showImage = false,
  categoryName,
  isDark: isDarkProp,
}) => {
  const { themeMode } = useThemeStore();
  const isDark = isDarkProp !== undefined ? isDarkProp : themeMode === 'dark';

  const imageUrl = showImage
    ? getAutoMenuItemImage(item.name, categoryName, (item as any).imageUrl || (item as any).image)
    : null;

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
        className={`p-3.5 sm:p-4 rounded-2xl mb-3 flex-row items-center justify-between border shadow-sm transition-all ${
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
        {/* Optional Food Image Thumbnail */}
        {showImage && imageUrl && (
          <View className="mr-3 w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700/50">
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </View>
        )}

        <View className="flex-1 mr-3">
          <View className="flex-row items-center flex-wrap gap-1.5">
            {item.isFavorite && (
              <View className="mr-0.5 bg-amber-500/20 px-1.5 py-0.5 rounded flex-row items-center">
                <Star size={10} color="#FBBF24" fill="#FBBF24" />
              </View>
            )}
            <Text
              className={`font-black text-sm sm:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}
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
            <Text className={`font-black text-base sm:text-lg ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              ₹{item.price}
            </Text>
            {lowStockText && (
              <Text className="text-amber-400 font-bold text-[11px]">{lowStockText}</Text>
            )}
          </View>
        </View>

        {/* Action / Stepper */}
        {isOutOfStock ? (
          <View className="bg-slate-800/80 border border-slate-700 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl">
            <Text className="text-rose-400 font-bold text-[10px] sm:text-xs uppercase">Out of Stock</Text>
          </View>
        ) : cartQty > 0 && isDirectAdd ? (
          <View
            className={`flex-row items-center rounded-full px-1 py-0.5 border shadow-sm ${
              isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
            }`}
          >
            <TouchableOpacity
              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full items-center justify-center active:opacity-75 ${
                isDark ? 'bg-slate-800' : 'bg-slate-100'
              }`}
              onPress={() => onDecrement(item, cartQty)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Minus size={12} color={isDark ? '#CBD5E1' : '#475569'} strokeWidth={2.5} />
            </TouchableOpacity>

            <Text
              className={`w-5 sm:w-6 text-center font-black text-xs sm:text-sm ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {cartQty}
            </Text>

            <TouchableOpacity
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-sm shadow-purple-500/30"
              onPress={() => onIncrement(item, cartQty)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Plus size={12} color="white" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        ) : (
          <View
            className={`px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-xl flex-row items-center gap-1.5 ${
              isDark ? 'bg-[#5D3FD3]' : 'bg-[#5D3FD3]'
            } shadow-md shadow-purple-500/20`}
          >
            {isVariant ? (
              <Layers size={13} color="white" />
            ) : isCustomizable ? (
              <Sparkles size={13} color="white" />
            ) : (
              <Plus size={13} color="white" />
            )}
            <Text className="text-white font-black text-[11px] sm:text-xs">
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

  // Grid View Card (iPad Tablet & Mobile Responsive)
  return (
    <View style={{ width: cardWidth || '100%', padding: 3 }}>
      <TouchableOpacity
        activeOpacity={isOutOfStock ? 1 : 0.75}
        onPress={handleCardPress}
        disabled={isOutOfStock}
        className={`rounded-2xl p-2.5 sm:p-3 justify-between border shadow-sm transition-all ${
          showImage ? 'min-h-[160px] sm:min-h-[185px]' : 'min-h-[115px] sm:min-h-[130px]'
        } ${
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
        {/* Optional Food Image Banner in Grid Mode */}
        {showImage && imageUrl && (
          <View className="w-full h-22 sm:h-26 rounded-xl overflow-hidden mb-2 bg-slate-800 border border-slate-700/40 relative">
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            {item.isFavorite && (
              <View className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-xs px-1.5 py-0.5 rounded-md flex-row items-center">
                <Star size={9} color="#FBBF24" fill="#FBBF24" />
              </View>
            )}
            {cartQty > 0 && (
              <View className="absolute top-1.5 right-1.5 bg-[#5D3FD3] px-2 py-0.5 rounded-full shadow-md shadow-purple-500/40">
                <Text className="text-white text-[10px] sm:text-[11px] font-black">{cartQty}</Text>
              </View>
            )}
          </View>
        )}

        {/* Top: Name & Badges */}
        <View className="flex-row items-start justify-between mb-1">
          <View className="flex-1 mr-1">
            <View className="flex-row items-center flex-wrap gap-1">
              {!showImage && item.isFavorite && (
                <View className="mr-0.5 bg-amber-500/20 px-1 py-0.5 rounded">
                  <Star size={9} color="#FBBF24" fill="#FBBF24" />
                </View>
              )}
              <Text
                className={`font-black text-xs sm:text-sm leading-snug ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
                numberOfLines={2}
              >
                {item.name}
              </Text>
            </View>

            {isOutOfStock ? (
              <Text className="text-rose-400 font-bold text-[9px] uppercase mt-0.5">Out of Stock</Text>
            ) : lowStockText ? (
              <Text className="text-amber-400 font-bold text-[9px] sm:text-[10px] mt-0.5">{lowStockText}</Text>
            ) : null}
          </View>

          {/* Cart Quantity Indicator Badge (when no image) */}
          {!showImage && cartQty > 0 && (
            <View className="bg-[#5D3FD3] px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 shadow-sm shadow-purple-500/30">
              <Text className="text-white text-[10px] sm:text-[11px] font-black">{cartQty}</Text>
            </View>
          )}
        </View>

        {/* Bottom Row: Price & Large Touch Stepper or Action Pill */}
        <View className="flex-row items-end justify-between mt-auto pt-1 sm:pt-2">
          <View>
            <Text
              className={`font-black text-sm sm:text-base tracking-tight ${
                isDark ? 'text-emerald-400' : 'text-emerald-600'
              }`}
            >
              ₹{item.price}
            </Text>
            {isVariant && (
              <Text className="text-indigo-400 text-[9px] sm:text-[10px] font-bold">Sizes ▾</Text>
            )}
            {isCustomizable && (
              <Text className="text-purple-400 text-[9px] sm:text-[10px] font-bold">Options ✨</Text>
            )}
          </View>

          {/* Direct Add Inline Capsule Stepper */}
          {cartQty > 0 && isDirectAdd ? (
            <View
              className={`flex-row items-center rounded-full px-1 py-0.5 border shadow-sm ${
                isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
              }`}
            >
              <TouchableOpacity
                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full items-center justify-center active:opacity-75 ${
                  isDark ? 'bg-slate-800' : 'bg-slate-100'
                }`}
                onPress={() => onDecrement(item, cartQty)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Minus size={11} color={isDark ? '#CBD5E1' : '#475569'} strokeWidth={2.5} />
              </TouchableOpacity>

              <Text
                className={`w-5 sm:w-6 text-center font-black text-xs sm:text-sm ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {cartQty}
              </Text>

              <TouchableOpacity
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#5D3FD3] items-center justify-center active:opacity-75 shadow-sm shadow-purple-500/30"
                onPress={() => onIncrement(item, cartQty)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Plus size={11} color="white" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ) : (
            <View
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl flex-row items-center gap-1 ${
                isDark ? 'bg-[#5D3FD3]' : 'bg-[#5D3FD3]'
              } shadow-sm shadow-purple-500/20`}
            >
              {isVariant ? (
                <Layers size={11} color="white" />
              ) : isCustomizable ? (
                <Sparkles size={11} color="white" />
              ) : (
                <Plus size={11} color="white" />
              )}
              <Text className="text-white font-black text-[10px] sm:text-[11px]">
                {cartQty > 0
                  ? `${cartQty}`
                  : isVariant
                  ? 'Sizes'
                  : isCustomizable
                  ? 'Options'
                  : 'Add'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
});

