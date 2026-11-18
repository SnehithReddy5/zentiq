import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput } from 'react-native';
import { X, Check, Plus, Minus, Sparkles, CheckSquare, Square, Circle, CheckCircle2 } from 'lucide-react-native';
import { MenuItem, CustomizationGroup, CustomizationOption } from '../../../types/menu.types';
import { SelectedCustomizationOption } from '../../../types/order.types';
import { useThemeStore } from '../../../store/theme.store';

interface ItemCustomizationSheetProps {
  isVisible: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onAddToCart: (
    item: MenuItem,
    qty: number,
    selectedOptions: SelectedCustomizationOption[],
    customizationKey: string,
    unitPrice: number,
    specialNote?: string
  ) => void;
  getAvailableStock?: (item: MenuItem) => number;
}

export const ItemCustomizationSheet: React.FC<ItemCustomizationSheetProps> = ({
  isVisible,
  item,
  onClose,
  onAddToCart,
  getAvailableStock,
}) => {
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';

  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [specialNote, setSpecialNote] = useState('');

  // Default option initialization
  useEffect(() => {
    if (!item) return;
    setQty(1);
    setSpecialNote('');

    const initialMap: Record<string, string[]> = {};
    const groups = item.customizationGroups || [];

    for (const group of groups) {
      const defaultOpts = (group.options || []).filter((o) => o.isDefault).map((o) => o.id);
      if (defaultOpts.length > 0) {
        initialMap[group.id] = defaultOpts;
      } else if ((group.minSelect || 0) >= 1 && group.options && group.options.length > 0) {
        // Mandatory group: auto-select first option
        initialMap[group.id] = [group.options[0].id];
      } else {
        initialMap[group.id] = [];
      }
    }
    setSelectedMap(initialMap);
  }, [item]);

  if (!isVisible || !item) return null;

  const groups: CustomizationGroup[] = item.customizationGroups || [];

  const handleToggleOption = (group: CustomizationGroup, option: CustomizationOption) => {
    const isSingle = (group.maxSelect || 1) === 1;
    const currentList = selectedMap[group.id] || [];

    if (isSingle) {
      // Radio mode: select this option
      setSelectedMap((prev) => ({
        ...prev,
        [group.id]: [option.id],
      }));
    } else {
      // Checkbox mode: toggle option
      if (currentList.includes(option.id)) {
        // If mandatory and only 1 selected, prevent unselecting if minSelect === 1
        if ((group.minSelect || 0) >= 1 && currentList.length <= 1) {
          return;
        }
        setSelectedMap((prev) => ({
          ...prev,
          [group.id]: currentList.filter((id) => id !== option.id),
        }));
      } else {
        const max = group.maxSelect || 999;
        if (currentList.length >= max) {
          // Replace oldest or keep at max
          setSelectedMap((prev) => ({
            ...prev,
            [group.id]: [...currentList.slice(1), option.id],
          }));
        } else {
          setSelectedMap((prev) => ({
            ...prev,
            [group.id]: [...currentList, option.id],
          }));
        }
      }
    }
  };

  // Compute selected options array & price
  const { selectedOptionsList, unitPrice, validationError } = useMemo(() => {
    const list: SelectedCustomizationOption[] = [];
    let extraTotal = 0;
    let missingMandatoryName = '';

    for (const group of groups) {
      const selectedIds = selectedMap[group.id] || [];
      const min = group.minSelect || 0;

      if (min > 0 && selectedIds.length < min) {
        missingMandatoryName = group.name || 'Required group';
      }

      for (const optId of selectedIds) {
        const opt = (group.options || []).find((o) => o.id === optId);
        if (opt) {
          list.push({
            groupId: group.id,
            groupName: group.name,
            optionId: opt.id,
            optionName: opt.name,
            price: Number(opt.price) || 0,
          });
          extraTotal += Number(opt.price) || 0;
        }
      }
    }

    return {
      selectedOptionsList: list,
      unitPrice: item.price + extraTotal,
      validationError: missingMandatoryName ? `Please select required: ${missingMandatoryName}` : null,
    };
  }, [groups, selectedMap, item]);

  const totalPrice = unitPrice * qty;

  const handleConfirm = () => {
    if (validationError) return;

    const customKey = selectedOptionsList
      .map((o) => o.optionId)
      .sort()
      .join('_');

    onAddToCart(item, qty, selectedOptionsList, customKey, unitPrice, specialNote.trim());
    onClose();
  };

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/75 p-4 z-50">
        <View
          className={`w-full max-w-xl rounded-3xl p-6 shadow-2xl border ${
            isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          {/* Header */}
          <View className="flex-row items-start justify-between pb-3.5 border-b border-slate-800/60 mb-3">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-2 mb-1">
                <View className="p-1 rounded-md bg-[#5D3FD3]/20">
                  <Sparkles size={14} color="#A855F7" />
                </View>
                <Text
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isDark ? 'text-purple-400' : 'text-purple-600'
                  }`}
                >
                  Customize Item
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
              <Text className="text-emerald-400 font-bold text-xs mt-0.5">
                Base Price: ₹{item.price}
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

          {/* Customization Groups ScrollView */}
          <ScrollView className="max-h-[340px] pr-1 mb-3">
            {groups.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-slate-400 text-xs">No extra options configured for this item.</Text>
              </View>
            ) : (
              groups.map((group) => {
                const isSingle = (group.maxSelect || 1) === 1;
                const isMandatory = (group.minSelect || 0) >= 1;
                const selectedList = selectedMap[group.id] || [];

                return (
                  <View
                    key={group.id}
                    className={`p-4 rounded-2xl border mb-3 ${
                      isDark ? 'bg-slate-850/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    {/* Group Title & Badge */}
                    <View className="flex-row items-center justify-between mb-2.5">
                      <Text
                        className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}
                      >
                        {group.name}
                      </Text>
                      <View className="flex-row items-center gap-1.5">
                        <View
                          className={`px-2 py-0.5 rounded-full border ${
                            isMandatory
                              ? 'bg-amber-500/15 border-amber-500/30'
                              : 'bg-slate-700/30 border-slate-700'
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-bold ${
                              isMandatory ? 'text-amber-400' : 'text-slate-400'
                            }`}
                          >
                            {isMandatory ? 'Required' : 'Optional'}
                          </Text>
                        </View>
                        <Text className="text-slate-400 text-[10px]">
                          {isSingle ? 'Pick 1' : `Up to ${group.maxSelect || 'any'}`}
                        </Text>
                      </View>
                    </View>

                    {/* Options List */}
                    <View className="gap-2">
                      {(group.options || []).map((opt) => {
                        const isSelected = selectedList.includes(opt.id);

                        return (
                          <TouchableOpacity
                            key={opt.id}
                            onPress={() => handleToggleOption(group, opt)}
                            className={`flex-row items-center justify-between p-3 rounded-xl border transition-all ${
                              isSelected
                                ? isDark
                                  ? 'bg-purple-950/40 border-[#5D3FD3]'
                                  : 'bg-purple-50 border-[#5D3FD3]'
                                : isDark
                                ? 'bg-slate-900/60 border-slate-800'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <View className="flex-row items-center flex-1 mr-2">
                              {isSingle ? (
                                isSelected ? (
                                  <CheckCircle2 size={18} color="#A855F7" />
                                ) : (
                                  <Circle size={18} color={isDark ? '#64748B' : '#94A3B8'} />
                                )
                              ) : isSelected ? (
                                <CheckSquare size={18} color="#A855F7" />
                              ) : (
                                <Square size={18} color={isDark ? '#64748B' : '#94A3B8'} />
                              )}
                              <Text
                                className={`font-bold text-sm ml-2.5 ${
                                  isSelected
                                    ? isDark
                                      ? 'text-white'
                                      : 'text-purple-950'
                                    : isDark
                                    ? 'text-slate-200'
                                    : 'text-slate-800'
                                }`}
                              >
                                {opt.name}
                              </Text>
                            </View>

                            <Text
                              className={`font-black text-xs ${
                                opt.price > 0
                                  ? isDark
                                    ? 'text-emerald-400'
                                    : 'text-emerald-600'
                                  : 'text-slate-400'
                              }`}
                            >
                              {opt.price > 0 ? `+₹${opt.price}` : 'Free'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}

            {/* Special Instructions Input */}
            <View
              className={`p-3 rounded-2xl border mb-2 ${
                isDark ? 'bg-slate-850/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <Text className={`font-bold text-xs mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Special Instructions (Optional)
              </Text>
              <TextInput
                placeholder="e.g. Less spicy, dressing on side..."
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={specialNote}
                onChangeText={setSpecialNote}
                className={`p-2.5 rounded-xl border text-xs font-semibold ${
                  isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
            </View>
          </ScrollView>

          {/* Validation Notice if missing mandatory option */}
          {validationError && (
            <View className="mb-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <Text className="text-amber-400 font-bold text-xs text-center">{validationError}</Text>
            </View>
          )}

          {/* Quantity Stepper & Final Add Action */}
          <View className="flex-row items-center gap-3">
            <View
              className={`flex-row items-center bg-slate-800/80 rounded-2xl border p-1 ${
                isDark ? 'border-slate-700' : 'border-slate-300 bg-slate-100'
              }`}
            >
              <TouchableOpacity
                onPress={() => setQty((prev) => Math.max(1, prev - 1))}
                disabled={qty <= 1}
                className="w-11 h-11 rounded-xl items-center justify-center bg-slate-700/60 active:opacity-80"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Minus size={18} color={isDark ? '#FFFFFF' : '#0F172A'} />
              </TouchableOpacity>
              <Text
                className={`w-9 text-center font-black text-lg ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {qty}
              </Text>
              <TouchableOpacity
                onPress={() => setQty((prev) => prev + 1)}
                className="w-11 h-11 rounded-xl items-center justify-center bg-[#5D3FD3] active:opacity-80"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Plus size={18} color="white" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleConfirm}
              disabled={Boolean(validationError)}
              className={`flex-1 py-3.5 rounded-2xl flex-row items-center justify-center shadow-xl ${
                validationError
                  ? 'bg-slate-800 border border-slate-700 opacity-50'
                  : 'bg-[#5D3FD3] active:bg-[#4D32B8] shadow-purple-500/30'
              }`}
            >
              <Text className="text-white font-black text-base">
                Add to Order • ₹{totalPrice.toFixed(0)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

