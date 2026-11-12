import { toast } from '../../utils/toast';
import React, { useState, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, Upload, CheckCircle2, AlertTriangle, X, FileSpreadsheet, Layers, Sparkles, RefreshCw, FileText } from 'lucide-react-native';
import { Button } from '../../components/common/Button';
import { MenuExcelService, ParseResult, ParsedMenuItem } from '../../services/excel/menuExcel.service';
import { DBServices } from '../../services/firebase/db';
import { useTenantStore } from '../../store/tenant.store';
import { useMenuStore } from '../../store/menu.store';

interface MenuExcelImportModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export const MenuExcelImportModal: React.FC<MenuExcelImportModalProps> = ({ isVisible, onClose }) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 640;

  const { tenant, activeLocationId } = useTenantStore();
  const { items } = useMenuStore();
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // 1. Download formatted template (Excel .xlsx or .csv)
  const handleDownloadTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
    try {
      const ok = MenuExcelService.downloadTemplateFile(format);
      if (ok) {
        toast.success(
          `Template downloaded (${format.toUpperCase()})! Edit it in Excel or Sheets and upload here.`,
          'Template Downloaded'
        );
      }
    } catch (e: any) {
      toast.error(`Download failed: ${e.message}`);
    }
  };

  // 2. Load demo sample data for instant testing
  const handleLoadSampleExcel = () => {
    setIsParsing(true);
    try {
      const templateBuffer = MenuExcelService.generateTemplate();
      const parsed = MenuExcelService.parseMenuExcel(templateBuffer, items);
      setFileName('sample_menu_template.xlsx');
      setParseResult(parsed);
      toast.info(`Loaded sample template with ${parsed.validItems.length} menu items.`, 'Sample Loaded');
    } catch (e: any) {
      toast.error(e.message, 'Parse Error');
    } finally {
      setIsParsing(false);
    }
  };

  // 3. Native & Web File Picker: Open Excel / CSV file
  const handlePickFile = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx, .xls, .csv';
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        setIsParsing(true);
        setFileName(file.name);
        try {
          const arrayBuffer = await file.arrayBuffer();
          const parsed = MenuExcelService.parseMenuExcel(arrayBuffer, items);
          setParseResult(parsed);
          if (parsed.errors.length > 0) {
            toast.warning(`Parsed with ${parsed.errors.length} row warning(s). Check error details.`, 'Partial Validation');
          } else {
            toast.success(`Successfully parsed ${parsed.validItems.length} items from ${file.name}!`, 'Excel Validated');
          }
        } catch (err: any) {
          toast.error(`Failed to parse file: ${err.message}`, 'File Error');
        } finally {
          setIsParsing(false);
        }
      };
      input.click();
      return;
    }

    // React Native DocumentPicker fallback if on mobile
    try {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', '*/*'],
        copyToCacheDirectory: true,
      }).then(async (res: any) => {
        if (res.canceled || !res.assets || res.assets.length === 0) return;
        const asset = res.assets[0];
        setIsParsing(true);
        setFileName(asset.name);
        try {
          const FileSystem = require('expo-file-system');
          const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
          const binary = Uint8Array.from(atob(b64), (c: string) => c.charCodeAt(0));
          const parsed = MenuExcelService.parseMenuExcel(binary, items);
          setParseResult(parsed);
          toast.success(`Parsed ${parsed.validItems.length} items from ${asset.name}!`);
        } catch (err: any) {
          toast.error(err.message, 'Parse Failed');
        } finally {
          setIsParsing(false);
        }
      }).catch((pickErr: any) => {
        console.warn('Document picker error:', pickErr);
      });
    } catch (_) {
      handleLoadSampleExcel();
    }
  };

  // 4. Commit validated items into Firestore
  const handleCommitImport = async () => {
    if (!parseResult || parseResult.validItems.length === 0) return;
    setIsImporting(true);
    try {
      await DBServices.bulkUpsertMenuItems(
        parseResult.validItems,
        tenant?.id,
        activeLocationId || undefined
      );
      toast.success(
        `Successfully imported ${parseResult.validItems.length} menu items into database!`,
        'Menu Updated'
      );
      setParseResult(null);
      setFileName(null);
      onClose();
    } catch (e: any) {
      toast.error(e.message, 'Import Failed');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} transparent animationType={isMobile ? "slide" : "fade"} onRequestClose={onClose}>
      <View
        className="flex-1 justify-end sm:justify-center items-center bg-black/85"
        style={{ padding: isMobile ? 0 : 16 }}
      >
        <View
          className="bg-slate-900 border border-slate-800 w-full max-w-2xl shadow-2xl overflow-hidden flex-col"
          style={{
            height: isMobile ? '94%' : undefined,
            maxHeight: isMobile ? '94%' : '90%',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderBottomLeftRadius: isMobile ? 0 : 28,
            borderBottomRightRadius: isMobile ? 0 : 28,
            paddingBottom: isMobile ? Math.max(insets.bottom, 8) : 0,
          }}
        >
          {/* Modal Header */}
          <View className="px-4 py-3.5 sm:p-5 border-b border-slate-800 flex-row items-center justify-between bg-slate-950/70">
            <View className="flex-row items-center flex-1 mr-2">
              <View className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 items-center justify-center mr-2.5 sm:mr-3 shrink-0">
                <FileSpreadsheet size={isMobile ? 18 : 22} color="#818CF8" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-black text-base sm:text-lg" numberOfLines={1}>
                  Excel / CSV Menu Import
                </Text>
                <Text className="text-slate-400 text-[11px] sm:text-xs mt-0.5" numberOfLines={1}>
                  Bulk add or update items via spreadsheet
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-700 rounded-full shrink-0"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 p-3.5 sm:p-5" showsVerticalScrollIndicator={true}>
            {/* Step 1 & Step 2 Action Grid */}
            <View className={`gap-3 mb-4 ${isMobile ? 'flex-col' : 'flex-row'}`}>
              {/* Step 1: Download Template */}
              <View className="flex-1 bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5 sm:p-4 flex-col justify-between">
                <View>
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <View className="w-5 h-5 rounded-full bg-indigo-500/20 items-center justify-center">
                      <Text className="text-indigo-300 font-bold text-xs">1</Text>
                    </View>
                    <Text className="text-white font-bold text-sm">Download Template</Text>
                  </View>
                  <Text className="text-slate-400 text-[11px] leading-relaxed mb-3">
                    Columns: <Text className="text-indigo-300 font-semibold">Category, Item Name, Price, Variants</Text>.
                  </Text>
                </View>

                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => handleDownloadTemplate('xlsx')}
                    className="flex-1 py-2.5 px-2.5 sm:px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl flex-row items-center justify-center shadow-md shadow-indigo-600/20"
                  >
                    <Download size={14} color="white" />
                    <Text className="text-white font-black text-xs ml-1.5">.XLSX Template</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDownloadTemplate('csv')}
                    className="py-2.5 px-3 bg-slate-700 hover:bg-slate-650 active:bg-slate-600 rounded-xl flex-row items-center justify-center"
                  >
                    <FileText size={14} color="#CBD5E1" />
                    <Text className="text-slate-200 font-bold text-xs ml-1">.CSV</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Step 2: Upload Excel File */}
              <View className="flex-1 bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5 sm:p-4 flex-col justify-between">
                <View>
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <View className="w-5 h-5 rounded-full bg-emerald-500/20 items-center justify-center">
                      <Text className="text-emerald-300 font-bold text-xs">2</Text>
                    </View>
                    <Text className="text-white font-bold text-sm">Upload Spreadsheet</Text>
                  </View>
                  <Text className="text-slate-400 text-[11px] leading-relaxed mb-3">
                    Select your populated file to validate and import into menu.
                  </Text>
                </View>

                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handlePickFile}
                    disabled={isParsing}
                    className="flex-1 py-2.5 px-2.5 sm:px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl flex-row items-center justify-center shadow-md shadow-emerald-600/20"
                  >
                    {isParsing ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <View className="flex-row items-center justify-center">
                        <Upload size={14} color="white" />
                        <Text className="text-white font-black text-xs ml-1.5" numberOfLines={1}>
                          {fileName ? 'Change File' : 'Browse File...'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleLoadSampleExcel}
                    disabled={isParsing}
                    className="py-2.5 px-3 bg-slate-700 hover:bg-slate-650 rounded-xl flex-row items-center justify-center"
                  >
                    <RefreshCw size={13} color="#CBD5E1" />
                    <Text className="text-slate-300 font-semibold text-xs ml-1">Sample</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Validation & Preview Card */}
            {parseResult ? (
              <View className="space-y-4">
                {/* Metrics Badges - Responsive wrap for mobile */}
                <View className="flex-row flex-wrap gap-2">
                  <View className="flex-1 min-w-[130px] bg-slate-800/80 border border-slate-700/60 p-3 rounded-2xl items-center">
                    <Text className="text-slate-400 text-[10px] uppercase font-bold">Total Items</Text>
                    <Text className="text-white font-black text-xl mt-0.5">{parseResult.validItems.length}</Text>
                  </View>
                  <View className="flex-1 min-w-[130px] bg-emerald-950/40 border border-emerald-500/40 p-3 rounded-2xl items-center">
                    <Text className="text-emerald-400 text-[10px] uppercase font-bold">New to Add</Text>
                    <Text className="text-emerald-300 font-black text-xl mt-0.5">+{parseResult.newRows}</Text>
                  </View>
                  <View className="flex-1 min-w-[130px] bg-blue-950/40 border border-blue-500/40 p-3 rounded-2xl items-center">
                    <Text className="text-blue-400 text-[10px] uppercase font-bold">To Update</Text>
                    <Text className="text-blue-300 font-black text-xl mt-0.5">{parseResult.updatedRows}</Text>
                  </View>
                  {parseResult.errors.length > 0 && (
                    <View className="flex-1 min-w-[130px] bg-rose-950/40 border border-rose-500/40 p-3 rounded-2xl items-center">
                      <Text className="text-rose-400 text-[10px] uppercase font-bold">Errors</Text>
                      <Text className="text-rose-300 font-black text-xl mt-0.5">{parseResult.errors.length}</Text>
                    </View>
                  )}
                </View>

                {/* Validation Errors Box (if any) */}
                {parseResult.errors.length > 0 && (
                  <View className="bg-rose-950/30 border border-rose-500/40 p-3.5 rounded-2xl">
                    <View className="flex-row items-center mb-2">
                      <AlertTriangle size={15} color="#FB7185" />
                      <Text className="text-rose-300 font-bold text-xs ml-1.5">
                        {parseResult.errors.length} Row(s) Skipped Due to Validation Errors:
                      </Text>
                    </View>
                    <ScrollView className="max-h-24">
                      {parseResult.errors.map((err, idx) => (
                        <Text key={idx} className="text-rose-200 text-[11px] leading-relaxed">
                          • <Text className="font-bold">Row {err.row}:</Text> {err.reason}
                        </Text>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Parsed Items List Preview */}
                <View className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5">
                  <View className="flex-row items-center justify-between mb-2.5 pb-2 border-b border-slate-800">
                    <Text className="text-white font-bold text-xs">
                      Validated Items Preview ({parseResult.validItems.length})
                    </Text>
                    {fileName && (
                      <Text className="text-slate-400 text-[11px] font-mono" numberOfLines={1}>
                        📄 {fileName}
                      </Text>
                    )}
                  </View>

                  <ScrollView style={{ maxHeight: isMobile ? 240 : 320 }} showsVerticalScrollIndicator={true}>
                    {parseResult.validItems.map((item, idx) => {
                      const isExisting = items.some(
                        i => (i.name || '').toLowerCase() === item.itemName.toLowerCase()
                      );
                      return (
                        <View
                          key={idx}
                          className="py-2.5 px-2 border-b border-slate-800/60 last:border-b-0 flex-row items-center justify-between"
                        >
                          <View className="flex-1 mr-3">
                            <View className="flex-row items-center gap-1.5">
                              <Text className="text-white font-bold text-xs">
                                {item.itemName}
                              </Text>
                              <View className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${isExisting
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                                }`}>
                                <Text className={isExisting ? 'text-blue-300 text-[9px] font-bold' : 'text-emerald-300 text-[9px] font-bold'}>
                                  {isExisting ? 'UPDATE' : 'NEW'}
                                </Text>
                              </View>
                              {item.hasVariants && (
                                <View className="bg-purple-500/20 px-1.5 py-0.2 rounded">
                                  <Text className="text-purple-300 text-[9px] font-bold">
                                    {item.variants.length} VARIANTS
                                  </Text>
                                </View>
                              )}
                            </View>

                            <Text className="text-slate-400 text-[10px] mt-0.5">
                              {item.categoryName} {item.sku ? `• SKU: ${item.sku}` : ''}
                            </Text>

                            {/* Variant Details pills */}
                            {item.hasVariants && item.variants.length > 0 && (
                              <View className="flex-row flex-wrap gap-1 mt-1.5">
                                {item.variants.map((v, vIdx) => (
                                  <View
                                    key={vIdx}
                                    className="bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded-lg flex-row items-center"
                                  >
                                    <Text className="text-slate-300 text-[10px]">{v.name}:</Text>
                                    <Text className="text-emerald-400 font-bold text-[10px] ml-1">₹{v.price}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>

                          <View className="items-end shrink-0">
                            <Text className="text-emerald-400 font-black text-sm">
                              ₹{item.price}
                            </Text>
                            <Text className="text-slate-500 text-[9px]">
                              {item.hasVariants ? 'Base Price' : 'Price'}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ) : (
              /* Empty state / instructions */
              <View className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 items-center justify-center text-center my-2">
                <View className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 items-center justify-center mb-3">
                  <Layers size={22} color="#94A3B8" />
                </View>
                <Text className="text-white font-bold text-sm mb-1">No Spreadsheet Loaded Yet</Text>
                <Text className="text-slate-400 text-xs max-w-sm text-center leading-relaxed mb-4">
                  Download the template above, fill in your categories, items, and variant portions, then click "Browse File" to preview your menu.
                </Text>
                <TouchableOpacity
                  onPress={handleLoadSampleExcel}
                  className="px-4 py-2 bg-indigo-600/20 border border-indigo-500/40 rounded-xl flex-row items-center"
                >
                  <Sparkles size={13} color="#818CF8" />
                  <Text className="text-indigo-300 font-bold text-xs ml-1.5">Preview Sample Menu Data</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Modal Footer Actions */}
          <View
            className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/90 flex-row gap-2.5 sm:gap-3"
            style={{ paddingBottom: isMobile ? Math.max(insets.bottom, 12) : 16 }}
          >
            <TouchableOpacity
              onPress={onClose}
              disabled={isImporting}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 rounded-2xl items-center justify-center"
            >
              <Text className="text-slate-300 font-bold text-sm">Cancel</Text>
            </TouchableOpacity>

            {parseResult && parseResult.validItems.length > 0 && (
              <TouchableOpacity
                onPress={handleCommitImport}
                disabled={isImporting}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-2xl flex-row items-center justify-center shadow-lg shadow-emerald-600/30"
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <View className="flex-row items-center justify-center">
                    <CheckCircle2 size={16} color="white" />
                    <Text className="text-white font-black text-sm ml-1.5">
                      Import {parseResult.validItems.length} Items
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};
