import { toast } from '../../utils/toast';
import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Download, Upload, CheckCircle2, AlertTriangle, X, FileSpreadsheet } from 'lucide-react-native';
import { Button } from '../../components/common/Button';
import { MenuExcelService, ParseResult } from '../../services/excel/menuExcel.service';
import { DBServices } from '../../services/firebase/db';
import { useTenantStore } from '../../store/tenant.store';
import { useMenuStore } from '../../store/menu.store';

interface MenuExcelImportModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export const MenuExcelImportModal: React.FC<MenuExcelImportModalProps> = ({ isVisible, onClose }) => {
  const { tenant, activeLocationId } = useTenantStore();
  const { items } = useMenuStore();
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Demo simulator for mobile test: loads sample Excel data buffer
  const handleLoadSampleExcel = () => {
    try {
      const templateBuffer = MenuExcelService.generateTemplate();
      const parsed = MenuExcelService.parseMenuExcel(templateBuffer, items);
      setParseResult(parsed);
    } catch (e: any) {
      toast.error(e.message, 'Parse Error');
    }
  };

  const handleCommitImport = async () => {
    if (!parseResult || parseResult.validItems.length === 0) return;
    setIsImporting(true);
    try {
      await DBServices.bulkUpsertMenuItems(
        parseResult.validItems,
        tenant?.id,
        activeLocationId || undefined
      );
      toast.success(`Successfully imported ${parseResult.validItems.length} menu items and variants!`, 'Import Successful');
      onClose();
      setParseResult(null);
    } catch (e: any) {
      toast.error(e.message, 'Import Failed');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} transparent animationType="slide">
      <View className="flex-1 justify-end bg-black/70">
        <View className="bg-[#111827] border-t border-slate-800 rounded-t-3xl p-6 max-h-[85%]">
          <View className="flex-row justify-between items-center mb-4">
            <View className="flex-row items-center">
              <FileSpreadsheet size={24} color="#818CF8" />
              <Text className="text-white font-bold text-xl ml-2">Excel Menu Manager</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1 rounded-lg bg-slate-800">
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text className="text-slate-400 text-xs mb-4">
            Download our standard menu template, update items in Excel, and upload to preview validation before import.
          </Text>

          {/* Action Row */}
          <View className="flex-row gap-3 mb-5">
            <TouchableOpacity
              className="flex-1 bg-slate-800 p-3.5 rounded-xl border border-slate-700 flex-row items-center justify-center"
              onPress={() => {
                toast.info('Template columns: Category | Menu Item | Variant | Price | Active | SKU', 'Excel Template');
              }}
            >
              <Download size={18} color="#818CF8" />
              <Text className="text-white font-bold text-xs ml-2">Download Template</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 bg-[#5D3FD3] p-3.5 rounded-xl flex-row items-center justify-center"
              onPress={handleLoadSampleExcel}
            >
              <Upload size={18} color="white" />
              <Text className="text-white font-bold text-xs ml-2">Load / Test Excel</Text>
            </TouchableOpacity>
          </View>

          {/* Validation Preview Card */}
          {parseResult && (
            <ScrollView className="mb-4">
              <Text className="text-white font-bold text-sm mb-3">Validation & Diff Preview</Text>

              <View className="flex-row gap-2 mb-4">
                <View className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl items-center">
                  <Text className="text-slate-400 text-[10px] uppercase font-bold">Total Rows</Text>
                  <Text className="text-white font-black text-lg">{parseResult.totalRows}</Text>
                </View>

                <View className="flex-1 bg-emerald-950/30 border border-emerald-500/30 p-3 rounded-xl items-center">
                  <Text className="text-emerald-400 text-[10px] uppercase font-bold">New Items</Text>
                  <Text className="text-emerald-400 font-black text-lg">{parseResult.newRows}</Text>
                </View>

                <View className="flex-1 bg-blue-950/30 border border-blue-500/30 p-3 rounded-xl items-center">
                  <Text className="text-blue-400 text-[10px] uppercase font-bold">Updated</Text>
                  <Text className="text-blue-400 font-black text-lg">{parseResult.updatedRows}</Text>
                </View>

                <View className="flex-1 bg-rose-950/30 border border-rose-500/30 p-3 rounded-xl items-center">
                  <Text className="text-rose-400 text-[10px] uppercase font-bold">Errors</Text>
                  <Text className="text-rose-400 font-black text-lg">{parseResult.errors.length}</Text>
                </View>
              </View>

              {parseResult.errors.length > 0 && (
                <View className="bg-rose-950/20 border border-rose-500/30 p-3 rounded-xl mb-4">
                  <View className="flex-row items-center mb-1">
                    <AlertTriangle size={14} color="#F43F5E" />
                    <Text className="text-rose-400 font-bold text-xs ml-1">Errors Found:</Text>
                  </View>
                  {parseResult.errors.map((e, idx) => (
                    <Text key={idx} className="text-rose-300 text-[11px]">
                      • Row {e.row}: {e.reason}
                    </Text>
                  ))}
                </View>
              )}

              <Text className="text-slate-400 text-xs mb-2">Valid Items to Import:</Text>
              {parseResult.validItems.slice(0, 5).map((item, i) => (
                <View key={i} className="flex-row justify-between py-1.5 border-b border-slate-800">
                  <Text className="text-slate-300 text-xs">
                    {item.itemName} ({item.variantName})
                  </Text>
                  <Text className="text-purple-400 font-bold text-xs">₹{item.price}</Text>
                </View>
              ))}
              {parseResult.validItems.length > 5 && (
                <Text className="text-slate-500 text-[10px] text-center mt-2">
                  ...and {parseResult.validItems.length - 5} more items
                </Text>
              )}
            </ScrollView>
          )}

          {/* Action buttons */}
          <View className="flex-row gap-3 pt-2 border-t border-slate-800">
            <Button title="Cancel" variant="secondary" onPress={onClose} className="flex-1" />
            {parseResult && (
              <Button
                title={`Import ${parseResult.validItems.length} Valid Rows`}
                variant="success"
                onPress={handleCommitImport}
                isLoading={isImporting}
                className="flex-1"
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};
