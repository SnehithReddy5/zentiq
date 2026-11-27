import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Banknote, CheckCircle2, CreditCard, ExternalLink, Printer, Smartphone, X } from 'lucide-react-native';
import { Table } from '../../../types/table.types';
import { TableOrderContext } from '../../../services/orders/tableActions.service';

interface QuickSettleModalProps {
  visible: boolean;
  table: Table | null;
  ctx: TableOrderContext | null;
  activeMethods: string[];
  paymentsEnabled: boolean;
  isDark: boolean;
  isSettling: boolean;
  onClose: () => void;
  onConfirmSettle: (method: string, shouldPrint: boolean) => void;
  onOpenFullCart: (table: Table) => void;
}

const getMethodIcon = (method: string, color: string) => {
  const upper = method.toUpperCase();
  if (upper.includes('UPI')) return <Smartphone size={16} color={color} />;
  if (upper.includes('CARD')) return <CreditCard size={16} color={color} />;
  return <Banknote size={16} color={color} />;
};

export const QuickSettleModal: React.FC<QuickSettleModalProps> = ({
  visible,
  table,
  ctx,
  activeMethods,
  paymentsEnabled,
  isDark,
  isSettling,
  onClose,
  onConfirmSettle,
  onOpenFullCart,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<string>(activeMethods[0] || 'CASH');

  useEffect(() => {
    if (visible && activeMethods.length > 0 && !activeMethods.includes(selectedMethod)) {
      setSelectedMethod(activeMethods[0]);
    }
  }, [visible, activeMethods]);

  if (!visible || !table || !ctx) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 items-center justify-center p-4">
        <View
          className={`w-full max-w-[420px] rounded-3xl border p-5 shadow-2xl ${
            isDark ? 'bg-[#111827] border-slate-700' : 'bg-white border-slate-200'
          }`}
        >
          {/* Header */}
          <View className={`flex-row items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <View>
              <Text className={`font-black text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Save & Settle • Table {table.tableNo}
              </Text>
              <Text className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {ctx.billNo ? `Bill #${ctx.billNo} • ` : ''}{ctx.itemCount} {ctx.itemCount === 1 ? 'item' : 'items'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className={`p-2 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}
            >
              <X size={16} color={isDark ? '#CBD5E1' : '#475569'} />
            </TouchableOpacity>
          </View>

          {/* Total Amount Banner */}
          <View
            className={`my-4 p-4 rounded-2xl border flex-row items-center justify-between ${
              isDark ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <Text className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
              Payable Total
            </Text>
            <Text className={`font-black text-2xl ${isDark ? 'text-white' : 'text-slate-900'}`}>
              ₹{ctx.displayAmount.toFixed(2)}
            </Text>
          </View>

          {/* Payment Methods */}
          {paymentsEnabled && activeMethods.length > 0 && (
            <View className="mb-4">
              <Text className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Payment Mode
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {activeMethods.map(method => {
                  const isSelected = selectedMethod === method;
                  return (
                    <TouchableOpacity
                      key={method}
                      onPress={() => setSelectedMethod(method)}
                      className={`flex-1 min-w-[95px] py-2.5 px-3 rounded-xl border flex-row items-center justify-center ${
                        isSelected
                          ? 'bg-[#5D3FD3] border-[#5D3FD3]'
                          : isDark
                            ? 'bg-slate-800 border-slate-700'
                            : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      {getMethodIcon(method, isSelected ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475569')}
                      <Text
                        className={`text-xs font-bold ml-1.5 ${
                          isSelected ? 'text-white' : isDark ? 'text-slate-200' : 'text-slate-700'
                        }`}
                      >
                        {method}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View className="flex-row gap-2.5">
            <TouchableOpacity
              onPress={() => onConfirmSettle(selectedMethod || 'CASH', false)}
              disabled={isSettling}
              className="flex-1 bg-emerald-600 py-3.5 px-4 rounded-2xl flex-row items-center justify-center shadow-md active:opacity-90"
            >
              {isSettling ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <CheckCircle2 size={17} color="white" />
                  <Text className="text-white font-black text-sm ml-2">Save & Settle</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onConfirmSettle(selectedMethod || 'CASH', true)}
              disabled={isSettling}
              className={`px-3.5 py-3.5 rounded-2xl border flex-row items-center justify-center ${
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
              }`}
              accessibilityLabel="Save and Reprint Receipt"
            >
              <Printer size={16} color={isDark ? '#E2E8F0' : '#334155'} />
            </TouchableOpacity>
          </View>

          {/* Secondary Link to Full Checkout (Discounts / Split Payments) */}
          <TouchableOpacity
            onPress={() => {
              onClose();
              onOpenFullCart(table);
            }}
            className="mt-3 py-2 flex-row items-center justify-center"
          >
            <ExternalLink size={13} color="#6366F1" />
            <Text className="text-indigo-500 text-xs font-bold ml-1.5">
              Open Full Checkout (Split / Discount)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
