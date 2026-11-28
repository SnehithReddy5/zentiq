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
  canSettle?: boolean;
  canManageTables?: boolean;
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
          ? 'bg-emerald-950/45 border-emerald-400'
          : 'bg-[#D1FAE5] border-emerald-500',
        titleText: isDark ? 'text-emerald-50' : 'text-slate-900',
        subText: isDark ? 'text-emerald-300' : 'text-emerald-800',
        dotColor: 'bg-emerald-500',
        actionBg: isDark ? 'bg-slate-900 border-emerald-400/70' : 'bg-white border-emerald-400',
        actionIconColor: isDark ? '#34D399' : '#059669',
      };
    case 'BILL_REQ':
      return {
        container: isDark
          ? 'bg-orange-950/45 border-orange-400'
          : 'bg-[#FFEDD5] border-orange-500',
        titleText: isDark ? 'text-orange-50' : 'text-slate-900',
        subText: isDark ? 'text-orange-300' : 'text-orange-800',
        dotColor: 'bg-orange-500',
        actionBg: isDark ? 'bg-slate-900 border-orange-400/70' : 'bg-white border-orange-400',
        actionIconColor: isDark ? '#FB923C' : '#EA580C',
      };
    case 'RUNNING_KOT':
      return {
        container: isDark
          ? 'bg-amber-950/40 border-amber-400'
          : 'bg-[#FEF9C3] border-amber-500',
        titleText: isDark ? 'text-amber-50' : 'text-slate-900',
        subText: isDark ? 'text-amber-300' : 'text-amber-800',
        dotColor: 'bg-amber-500',
        actionBg: isDark ? 'bg-slate-900 border-amber-400/70' : 'bg-white border-amber-400',
        actionIconColor: isDark ? '#FBBF24' : '#B45309',
      };
    case 'RUNNING':
      return {
        container: isDark
          ? 'bg-sky-950/40 border-sky-400'
          : 'bg-[#E0F2FE] border-sky-500',
        titleText: isDark ? 'text-sky-50' : 'text-slate-900',
        subText: isDark ? 'text-sky-300' : 'text-sky-800',
        dotColor: 'bg-sky-500',
        actionBg: isDark ? 'bg-slate-900 border-sky-400/70' : 'bg-white border-sky-400',
        actionIconColor: isDark ? '#38BDF8' : '#0369A1',
      };
    case 'BLANK':
    default:
      return {
        container: isDark
          ? 'bg-slate-900 border-slate-500'
          : 'bg-slate-100 border-slate-400',
        titleText: isDark ? 'text-slate-100' : 'text-slate-900',
        subText: isDark ? 'text-slate-400' : 'text-slate-600',
        dotColor: isDark ? 'bg-slate-400' : 'bg-slate-500',
        actionBg: isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-300',
        actionIconColor: isDark ? '#CBD5E1' : '#334155',
      };
  }
};

export const TableTile: React.FC<TableTileProps> = React.memo(({
  table,
  ctx,
  isDark,
  isEditMode = false,
  canSettle = true,
  canManageTables = false,
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
  const showSaveOrPrinted = ctx.isBillPrinted || ctx.isBillRequested;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => (isEditMode && canManageTables && onPressEditMeta ? onPressEditMeta(table) : onPressTable(table))}
      onLongPress={() => {
        if (canManageTables && onPressEditMeta) onPressEditMeta(table);
      }}
      className={`m-1.5 rounded-2xl border-2 ${palette.container} px-2.5 py-2.5 min-h-[126px] justify-between shadow-sm`}
    >
      {/* Top Row: Bill No / REQ badge / Seats + Status dot or Edit delete */}
      <View className="w-full flex-row items-center justify-between min-h-[18px]">
        {ctx.visualState === 'BILL_REQ' ? (
          <View className="flex-row items-center bg-orange-500/20 px-1.5 py-0.5 rounded">
            <Bell size={10} color="#EA580C" />
            <Text className="text-[10px] font-black text-orange-600 ml-0.5">REQ</Text>
          </View>
        ) : ctx.billNo && ctx.isOccupied ? (
          <Text className={`text-[11px] font-bold ${palette.subText}`} numberOfLines={1}>
            #{ctx.billNo}
          </Text>
        ) : (
          <View className="flex-row items-center">
            <Users size={11} color={isDark ? '#94A3B8' : '#64748B'} />
            <Text className={`text-[10px] font-bold ml-1 ${palette.subText}`}>
              {table.capacity || 4}
            </Text>
          </View>
        )}

        {isEditMode && canManageTables && onPressDelete ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onPressDelete(table);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="p-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40"
          >
            <Trash2 size={13} color="#F43F5E" />
          </TouchableOpacity>
        ) : (
          <View className={`w-2.5 h-2.5 rounded-full ${palette.dotColor}`} />
        )}
      </View>

      {/* Center: Clean Table Name + Amount */}
      <View className="items-center justify-center my-1">
        <Text className={`font-extrabold text-sm ${palette.titleText}`} numberOfLines={1}>
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

      {/* Uniform Bottom Slot: Generous spacing & bigger Print/View/Save icons */}
      <View className="w-full h-[36px] flex-row items-center justify-center gap-3">
        {ctx.isOccupied && !(isEditMode && canManageTables) ? (
          showSaveOrPrinted ? (
            <>
              {canSettle && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onPressSave(table, ctx);
                  }}
                  disabled={isBusySettle}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  className={`h-[34px] flex-1 max-w-[56px] rounded-xl border shadow-sm items-center justify-center ${palette.actionBg}`}
                  accessibilityLabel={`Save and settle Table ${table.tableNo}`}
                >
                  {isBusySettle ? (
                    <ActivityIndicator size="small" color={palette.actionIconColor} />
                  ) : (
                    <Save size={17} color={palette.actionIconColor} />
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onPressView(table);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className={`h-[34px] flex-1 max-w-[56px] rounded-xl border shadow-sm items-center justify-center ${palette.actionBg}`}
                accessibilityLabel={`Checkout Table ${table.tableNo}`}
              >
                <Eye size={17} color={palette.actionIconColor} />
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
                className={`h-[34px] flex-1 max-w-[56px] rounded-xl border shadow-sm items-center justify-center ${palette.actionBg}`}
                accessibilityLabel={`Print Table ${table.tableNo} bill`}
              >
                {isBusyPrint ? (
                  <ActivityIndicator size="small" color={palette.actionIconColor} />
                ) : (
                  <Printer size={17} color={palette.actionIconColor} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onPressView(table);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className={`h-[34px] flex-1 max-w-[56px] rounded-xl border shadow-sm items-center justify-center ${palette.actionBg}`}
                accessibilityLabel={`Checkout Table ${table.tableNo}`}
              >
                <Eye size={17} color={palette.actionIconColor} />
              </TouchableOpacity>
            </>
          ) : null
        ) : (
          <Text className={`text-[11px] font-semibold ${palette.subText}`} numberOfLines={1}>
            {isEditMode && canManageTables ? 'Tap to edit' : 'Available'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});
