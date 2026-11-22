import * as XLSX from 'xlsx';
import { Platform } from 'react-native';

export interface ExcelMenuRow {
  Category: string;
  'Item Name': string;
  Price?: number | string;
  'Has Variant'?: string | boolean;
  'Variant Name'?: string;
  'Variant Price'?: number | string;
  Active?: boolean | string;
  SKU?: string;
  [key: string]: any;
}

export interface ParsedVariant {
  id?: string;
  name: string;
  price: number;
  active: boolean;
}

export interface ParsedMenuItem {
  categoryName: string;
  itemName: string;
  price: number;
  hasVariants: boolean;
  variants: ParsedVariant[];
  active: boolean;
  sku?: string;
}

export interface ParseResult {
  totalRows: number;
  newRows: number;
  updatedRows: number;
  errors: { row: number; reason: string }[];
  validItems: ParsedMenuItem[];
}

export class MenuExcelService {
  /**
   * Sample template rows demonstrating both single items and items with variants
   */
  static getSampleRows(): ExcelMenuRow[] {
    return [
      {
        Category: 'Biryani Specials',
        'Item Name': 'Chicken Dum Biryani',
        Price: 180,
        'Has Variant': 'YES',
        'Variant Name': 'Single',
        'Variant Price': 180,
        Active: 'YES',
        SKU: 'BIR-01'
      },
      {
        Category: 'Biryani Specials',
        'Item Name': 'Chicken Dum Biryani',
        Price: 180,
        'Has Variant': 'YES',
        'Variant Name': 'Full',
        'Variant Price': 320,
        Active: 'YES',
        SKU: 'BIR-02'
      },
      {
        Category: 'Biryani Specials',
        'Item Name': 'Mutton Biryani',
        Price: 380,
        'Has Variant': 'YES',
        'Variant Name': 'Single (500g)',
        'Variant Price': 380,
        Active: 'YES',
        SKU: 'MBIR-01'
      },
      {
        Category: 'Biryani Specials',
        'Item Name': 'Mutton Biryani',
        Price: 380,
        'Has Variant': 'YES',
        'Variant Name': 'Family (1 Kg)',
        'Variant Price': 690,
        Active: 'YES',
        SKU: 'MBIR-02'
      },
      {
        Category: 'Starters',
        'Item Name': 'Paneer 65',
        Price: 220,
        'Has Variant': 'NO',
        'Variant Name': '',
        'Variant Price': '',
        Active: 'YES',
        SKU: 'STR-01'
      },
      {
        Category: 'Starters',
        'Item Name': 'Crispy Corn',
        Price: 180,
        'Has Variant': 'NO',
        'Variant Name': '',
        'Variant Price': '',
        Active: 'YES',
        SKU: 'STR-02'
      },
      {
        Category: 'Beverages',
        'Item Name': 'Filter Coffee',
        Price: 30,
        'Has Variant': 'NO',
        'Variant Name': '',
        'Variant Price': '',
        Active: 'YES',
        SKU: 'BEV-01'
      },
      {
        Category: 'Beverages',
        'Item Name': 'Thums Up (Can)',
        Price: 40,
        'Has Variant': 'NO',
        'Variant Name': '',
        'Variant Price': '',
        Active: 'YES',
        SKU: 'BEV-02'
      }
    ];
  }

  /**
   * Generates a binary Excel buffer with auto column widths and formatted rows
   */
  static generateTemplate(): Uint8Array {
    const sampleData = this.getSampleRows();
    const worksheet = XLSX.utils.json_to_sheet(sampleData);

    worksheet['!cols'] = [
      { wch: 20 }, // Category
      { wch: 26 }, // Item Name
      { wch: 12 }, // Price
      { wch: 14 }, // Has Variant
      { wch: 18 }, // Variant Name
      { wch: 14 }, // Variant Price
      { wch: 10 }, // Active
      { wch: 14 }, // SKU
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu Template');

    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  }

  /**
   * Triggers download of the template in Excel (.xlsx) or CSV (.csv) format
   */
  static downloadTemplateFile(format: 'xlsx' | 'csv' = 'xlsx'): boolean {
    const sampleData = this.getSampleRows();
    const worksheet = XLSX.utils.json_to_sheet(sampleData);

    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 26 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
      { wch: 14 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu Template');

    const fileType = format === 'csv' ? 'csv' : 'xlsx';
    const buffer = XLSX.write(workbook, { type: 'array', bookType: fileType });
    const fileName = `zentiq_menu_template.${fileType}`;

    // Web / Windows Electron DOM browser download
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      const mime = format === 'csv'
        ? 'text/csv;charset=utf-8;'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([buffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    }

    // React Native Native fallback using FileSystem and Sharing
    try {
      const FileSystem = require('expo-file-system');
      const Sharing = require('expo-sharing');
      const b64 = Buffer.from(buffer).toString('base64');
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 }).then(() => {
        Sharing.shareAsync(fileUri);
      });
      return true;
    } catch (nativeErr) {
      console.warn('Native sharing fallback error:', nativeErr);
    }
    return false;
  }

  /**
   * Generates and downloads an Excel spreadsheet containing the client's current live menu
   * using the exact template format that parseMenuExcel accepts for re-importing.
   */
  static async exportMenuToFile(
    items: any[],
    categories: any[],
    businessName: string = 'Restaurant',
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<{ count: number; filename: string }> {
    const catMap: Record<string, string> = {};
    (categories || []).forEach(c => {
      if (c && c.id) {
        catMap[c.id] = c.name;
      }
    });

    const rows: ExcelMenuRow[] = [];

    (items || []).forEach(item => {
      const categoryName = catMap[item.categoryId] || 'General';
      const hasVariants = Boolean(item.variants && item.variants.length > 0);
      const isItemActive = item.isAvailable !== false && item.active !== false;

      if (hasVariants) {
        item.variants.forEach((v: any) => {
          rows.push({
            Category: categoryName,
            'Item Name': item.name,
            Price: Number(item.price ?? v.price ?? 0),
            'Has Variant': 'YES',
            'Variant Name': v.name || '',
            'Variant Price': Number(v.price ?? 0),
            Active: (isItemActive && v.active !== false) ? 'YES' : 'NO',
            SKU: item.sku || '',
          });
        });
      } else {
        rows.push({
          Category: categoryName,
          'Item Name': item.name,
          Price: Number(item.price ?? 0),
          'Has Variant': 'NO',
          'Variant Name': '',
          'Variant Price': '',
          Active: isItemActive ? 'YES' : 'NO',
          SKU: item.sku || '',
        });
      }
    });

    const finalData = rows.length > 0 ? rows : this.getSampleRows();
    const worksheet = XLSX.utils.json_to_sheet(finalData);

    worksheet['!cols'] = [
      { wch: 22 }, // Category
      { wch: 28 }, // Item Name
      { wch: 12 }, // Price
      { wch: 14 }, // Has Variant
      { wch: 20 }, // Variant Name
      { wch: 14 }, // Variant Price
      { wch: 10 }, // Active
      { wch: 14 }, // SKU
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu Items');

    const fileType = format === 'csv' ? 'csv' : 'xlsx';
    const cleanBusiness = (businessName || 'Zentiq').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${cleanBusiness}_menu_${dateStr}.${fileType}`;

    // Download / Save Handling
    if (Platform.OS === 'web' || (typeof window !== 'undefined' && (window as any).document)) {
      const mime = format === 'csv'
        ? 'text/csv;charset=utf-8;'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const buffer = XLSX.write(workbook, { type: 'array', bookType: fileType });
      const blob = new Blob([buffer], { type: mime });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      // Native Mobile (Android / iOS)
      try {
        const FileSystem = require('expo-file-system');
        const Sharing = require('expo-sharing');
        const base64Data = XLSX.write(workbook, { type: 'base64', bookType: fileType });
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: `Export ${businessName} Menu`,
            UTI: 'com.microsoft.excel.xlsx',
          });
        }
      } catch (nativeErr) {
        console.warn('Native menu export error:', nativeErr);
      }
    }

    return { count: rows.length, filename };
  }

  /**
   * Flexible header value extractor - tolerates different column names
   */
  private static getField(row: any, ...keys: string[]): any {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) return row[key];
      // Case-insensitive match
      const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.trim().toLowerCase());
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
        return row[foundKey];
      }
    }
    return undefined;
  }

  /**
   * Parses Excel or CSV buffer into structured menu items with automatic variant grouping
   */
  static parseMenuExcel(buffer: ArrayBuffer | Uint8Array, existingItems: any[] = []): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<any>(worksheet);

    const result: ParseResult = {
      totalRows: rawRows.length,
      newRows: 0,
      updatedRows: 0,
      errors: [],
      validItems: [],
    };

    // Intermediate aggregation map keyed by `category:::itemname`
    const groupedMap = new Map<string, {
      categoryName: string;
      itemName: string;
      basePrice: number;
      hasVariants: boolean;
      variants: ParsedVariant[];
      active: boolean;
      sku?: string;
    }>();

    rawRows.forEach((row, index) => {
      const rowNumber = index + 2; // Row 1 is header

      const rawCat = this.getField(row, 'Category', 'category', 'Category Name', 'category_name');
      const category = (rawCat || '').toString().trim();

      const rawItem = this.getField(row, 'Item Name', 'item_name', 'Name', 'name', 'Item', 'Menu Item', 'menu_item');
      const itemName = (rawItem || '').toString().trim();

      if (!category) {
        result.errors.push({ row: rowNumber, reason: 'Category is required' });
        return;
      }
      if (!itemName) {
        result.errors.push({ row: rowNumber, reason: 'Item Name is required' });
        return;
      }

      const rawPrice = this.getField(row, 'Price', 'price', 'Base Price', 'Item Price', 'Amount');
      const priceNum = parseFloat((rawPrice || '0').toString().replace(/[^0-9.]/g, ''));

      const rawHasVariant = this.getField(row, 'Has Variant', 'has_variant', 'Has Variants', 'has_variants', 'Is Variant', 'is_variant');
      const hasVariantStr = String(rawHasVariant ?? '').trim().toLowerCase();
      const hasVariantExplicit = hasVariantStr === 'yes' || hasVariantStr === 'true' || hasVariantStr === '1';

      const rawVariantName = this.getField(row, 'Variant Name', 'variant_name', 'Variant', 'variant', 'Variants', 'variants', 'Portion');
      const variantName = (rawVariantName || '').toString().trim();

      const rawVariantPrice = this.getField(row, 'Variant Price', 'variant_price', 'VariantPrice', 'Variant Amount');
      const variantPriceNum = rawVariantPrice !== undefined && rawVariantPrice !== null && String(rawVariantPrice).trim() !== ''
        ? parseFloat(String(rawVariantPrice).replace(/[^0-9.]/g, ''))
        : priceNum;

      const rawActive = this.getField(row, 'Active', 'active', 'Status', 'is_active');
      const activeVal = rawActive === undefined || rawActive === null || String(rawActive).trim() === ''
        ? true
        : (String(rawActive).toLowerCase() === 'true' || String(rawActive).toLowerCase() === 'yes' || String(rawActive) === '1');

      const rawSku = this.getField(row, 'SKU', 'sku', 'Code', 'Item Code');
      const sku = (rawSku || '').toString().trim();

      // Price validation: either price or variant price must be valid
      const effectivePrice = !isNaN(variantPriceNum) && variantPriceNum > 0 ? variantPriceNum : priceNum;
      if (isNaN(effectivePrice) || effectivePrice < 0) {
        result.errors.push({ row: rowNumber, reason: `Invalid price for "${itemName}". Must be a positive number.` });
        return;
      }

      const itemKey = `${category.toLowerCase()}:::${itemName.toLowerCase()}`;

      // Check for inline comma-separated variants (e.g. "Single: 180, Full: 320" or "Half (150) | Full (280)")
      const inlineVariantMatches = variantName.includes(':') || variantName.includes('|');

      if (!groupedMap.has(itemKey)) {
        groupedMap.set(itemKey, {
          categoryName: category,
          itemName,
          basePrice: !isNaN(priceNum) && priceNum > 0 ? priceNum : effectivePrice,
          hasVariants: hasVariantExplicit || !!variantName,
          variants: [],
          active: activeVal,
          sku,
        });
      }

      const currentItem = groupedMap.get(itemKey)!;

      if (inlineVariantMatches) {
        currentItem.hasVariants = true;
        const parts = variantName.split(/[,|;]/);
        parts.forEach((p: string, pIdx: number) => {
          const colonIdx = p.indexOf(':');
          if (colonIdx > 0) {
            const vName = p.slice(0, colonIdx).trim();
            const vP = parseFloat(p.slice(colonIdx + 1).replace(/[^0-9.]/g, '')) || effectivePrice;
            currentItem.variants.push({
              id: `var_${Date.now()}_${pIdx}_${Math.random().toString(36).slice(2, 6)}`,
              name: vName,
              price: vP,
              active: activeVal,
            });
          }
        });
      } else if (hasVariantExplicit || variantName) {
        currentItem.hasVariants = true;
        const vName = variantName || 'Regular';
        // Avoid duplicate variant name for the same item
        const existingV = currentItem.variants.find(v => v.name.toLowerCase() === vName.toLowerCase());
        if (existingV) {
          existingV.price = effectivePrice;
          existingV.active = activeVal;
        } else {
          currentItem.variants.push({
            id: `var_${Date.now()}_${currentItem.variants.length}_${Math.random().toString(36).slice(2, 6)}`,
            name: vName,
            price: effectivePrice,
            active: activeVal,
          });
        }
      }
    });

    // Finalize grouped items
    groupedMap.forEach((entry) => {
      const existingMatch = existingItems.find(
        (i: any) => (i.name || '').toLowerCase() === entry.itemName.toLowerCase()
      );

      if (existingMatch) {
        result.updatedRows++;
      } else {
        result.newRows++;
      }

      const finalPrice = entry.hasVariants && entry.variants.length > 0
        ? entry.variants[0].price
        : entry.basePrice;

      result.validItems.push({
        categoryName: entry.categoryName,
        itemName: entry.itemName,
        price: finalPrice,
        hasVariants: entry.hasVariants && entry.variants.length > 0,
        variants: entry.variants,
        active: entry.active,
        sku: entry.sku,
      });
    });

    return result;
  }
}
