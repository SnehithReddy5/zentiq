import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Bell, Eye, Printer, Save, Trash2, Users } from 'lucide-react-native';
import { Table } from '../../../types/table.types';
import { TableOrderContext } from '../../../services/orders/tableActions.service';

interface TableTileProps {
  table: Table;
  ctx: TableOrderContext;
  isDark: boolean;
  isEditMode?: boolean;
  isBusyPrint?: boolean;
  isBusySettle?: boolean;
  onPressTable: (table: Table) => void;
  onPressPrint: (table: Table, ctx: TableOrderContext) => void;
  onPressView: (table: Table) => void;
  onPressSave: (table: Table, ctx: TableOrderContext) => void;
  onPressDelete?: (table: Table) => void;
  onPressEditMeta?: (table: Table) => void;
}

const getPalette = (visualState: TableOrderContext['visualState'], isDark: boolean) => {
  switch (visualState) {
    case 'PRINTED':
      return {
        container: isDark
          ? 'bg-emerald-950/35 border-emerald-500/75'
          : 'bg-[#D1FAE5] border-[#6EE7B7]',
        borderStyle: 'solid' as const,
        titleText: isDark ? 'text-emerald-50' : 'text-slate-900',
        subText: isDark ? 'text-emerald-300' : 'text-emerald-800',
        dotColor: 'bg-emerald-500',
        actionBg: isDark ? 'bg-slate-900 border-emerald-500/50' : 'bg-white border-emerald-300',
        actionIconColor: isDark ? '#34D399' : '#059669',
      };
    case 'BILL_REQ':
      return {
        container: isDark
          ? 'bg-orange-950/40 border-orange-400/80'
          : 'bg-[#FFEDD5] border-[#FDBA74]',
        borderStyle: 'solid' as const,
        titleText: isDark ? 'text-orange-50' : 'text-slate-900',
        subText: isDark ? 'text-orange-300' : 'text-orange-800',
        dotColor: 'bg-orange-500',
        actionBg: isDark ? 'bg-slate-900 border-orange-500/50' : 'bg-white border-orange-300',
        actionIconColor: isDark ? '#FB923C' : '#EA580C',
      };
    case 'RUNNING_KOT':
      return {
        container: isDark
          ? 'bg-amber-950/35 border-amber-400/65'
          : 'bg-[#FEF9C3] border-[#FDE047]',
        borderStyle: 'dashed' as const,
        titleText: isDark ? 'text-amber-50' : 'text-slate-900',
        subText: isDark ? 'text-amber-300' : 'text-amber-800',
        dotColor: 'bg-amber-400',
        actionBg: isDark ? 'bg-slate-900 border-amber-500/40' : 'bg-white border-slate-200',
        actionIconColor: isDark ? '#FBBF24' : '#334155',
      };
    case 'RUNNING':
      return {
        container: isDark
          ? 'bg-sky-950/35 border-sky-400/65'
          : 'bg-[#E0F2FE] border-[#7DD3FC]',
        borderStyle: 'dashed' as const,
        titleText: isDark ? 'text-sky-50' : 'text-slate-900',
        subText: isDark ? 'text-sky-300' : 'text-sky-800',
        dotColor: 'bg-sky-500',
        actionBg: isDark ? 'bg-slate-900 border-sky-500/40' : 'bg-white border-slate-200',
        actionIconColor: isDark ? '#38BDF8' : '#334155',
      };
    case 'BLANK':
    default:
      return {
        container: isDark
          ? 'bg-slate-900/75 border-slate-700/80'
          : 'bg-[#F3F4F6] border-[#D1D5DB]',
        borderStyle: 'dashed' as const,
        titleText: isDark ? 'text-slate-200' : 'text-slate-800',
        subText: isDark ? 'text-slate-500' : 'text-slate-500',
        dotColor: 'bg-slate-400',
        actionBg: isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200',
        actionIconColor: isDark ? '#CBD5E1' : '#475569',
      };
  }
};

export const TableTile: React.FC<TableTileProps> = React.memo(({
  table,
  ctx,
  isDark,
  isEditMode = false,
  isBusyPrint = false,
  isBusySettle = false,
  onPressTable,
  onPressPrint,
  onPressView,
  onPressSave,
  onPressDelete,
  onPressEditMeta,
}) => {
  const palette = getPalette(ctx.visualState, isDark);
  const showPrintAndView = ctx.isOccupied && !ctx.isBillPrinted;
  const showSaveAction = ctx.isBillPrinted || ctx.isBillRequested;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => (isEditMode && onPressEditMeta ? onPressEditMeta(table) : onPressTable(table))}
      onLongPress={() => onPressEditMeta && onPressEditMeta(table)}
      className={`m-1.5 rounded-2xl border ${palette.container} px-2.5 py-2.5 h-[112px] justify-between shadow-sm`}
      style={{ borderStyle: palette.borderStyle }}
    >
      {/* Top Row: Bill No / REQ badge / Seats + Status dot or Edit delete */}
      <View className="w-full flex-row items-center justify-between min-h-[16px]">
        {ctx.visualState === 'BILL_REQ' ? (
          <View className="flex-row items-center bg-orange-500/20 px-1.5 py-0.5 rounded">
            <Bell size={9} color="#EA580C" />
            <Text className="text-[9px] font-black text-orange-600 ml-0.5">REQ</Text>
          </View>
        ) : ctx.billNo && ctx.isOccupied ? (
          <Text className={`text-[10px] font-bold ${palette.subText}`} numberOfLines={1}>
            #{ctx.billNo}
          </Text>
        ) : (
          <View className="flex-row items-center">
            <Users size={10} color={isDark ? '#64748B' : '#94A3B8'} />
            <Text className={`text-[10px] font-semibold ml-0.5 ${palette.subText}`}>
              {table.capacity || 4}
            </Text>
          </View>
        )}

        {isEditMode && onPressDelete ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onPressDelete(table);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="p-1 rounded-lg bg-rose-500/15 border border-rose-500/30"
          >
            <Trash2 size={11} color="#F43F5E" />
          </TouchableOpacity>
        ) : (
          <View className={`w-2 h-2 rounded-full ${palette.dotColor}`} />
        )}
      </View>

      {/* Center: Clean Table Name + Amount */}
      <View className="items-center justify-center">
        <Text className={`font-bold text-sm ${palette.titleText}`} numberOfLines={1}>
          Table {table.tableNo}
        </Text>
        {ctx.isOccupied && ctx.displayAmount > 0 ? (
          <Text className={`font-black text-xs mt-0.5 ${palette.subText}`} numberOfLines={1}>
            ₹{ctx.displayAmount.toFixed(0)}
          </Text>
        ) : ctx.isOccupied && ctx.waiterName ? (
          <Text className={`text-[10px] font-semibold mt-0.5 ${palette.subText}`} numberOfLines={1}>
            {ctx.waiterName}
          </Text>
        ) : null}
      </View>

      {/* Uniform Bottom Slot: Inline Print/View or Save/View or Blank/Edit subtitle */}
      <View className="w-full h-[28px] flex-row items-center justify-center gap-1.5">
        {ctx.isOccupied && !isEditMode ? (
          showSaveAction ? (
            <>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onPressSave(table, ctx);
                }}
                disabled={isBusySettle}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className={`h-[26px] px-2.5 rounded-lg border shadow-sm flex-row items-center justify-center ${palette.actionBg}`}
                accessibilityLabel={`Save and settle Table ${table.tableNo}`}
              >
                {isBusySettle ? (
                  <ActivityIndicator size="small" color={palette.actionIconColor} />
                ) : (
                  <Save size={13} color={palette.actionIconColor} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onPressView(table);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className={`h-[26px] px-2 rounded-lg border shadow-sm items-center justify-center ${palette.actionBg}`}
                accessibilityLabel={`Checkout Table ${table.tableNo}`}
              >
                <Eye size={13} color={palette.actionIconColor} />
              </TouchableOpacity>
            </>
          ) : showPrintAndView ? (
            <>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onPressPrint(table, ctx);
                }}
                disabled={isBusyPrint}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className={`h-[26px] px-2.5 rounded-lg border shadow-sm items-center justify-center ${palette.actionBg}`}
                accessibilityLabel={`Print Table ${table.tableNo} bill`}
              >
                {isBusyPrint ? (
                  <ActivityIndicator size="small" color={palette.actionIconColor} />
                ) : (
                  <Printer size={13} color={palette.actionIconColor} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onPressView(table);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className={`h-[26px] px-2 rounded-lg border shadow-sm items-center justify-center ${palette.actionBg}`}
                accessibilityLabel={`Checkout Table ${table.tableNo}`}
              >
                <Eye size={13} color={palette.actionIconColor} />
              </TouchableOpacity>
            </>
          ) : null
        ) : (
          <Text className={`text-[10px] font-medium ${palette.subText}`} numberOfLines={1}>
            {isEditMode ? 'Tap to edit' : 'Available'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});
