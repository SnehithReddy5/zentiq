import * as XLSX from 'xlsx';

export interface ExcelMenuRow {
  Category: string;
  'Menu Item': string;
  Variant?: string;
  Price: number | string;
  Active?: boolean | string;
  SKU?: string;
}

export interface ParseResult {
  totalRows: number;
  newRows: number;
  updatedRows: number;
  errors: { row: number; reason: string }[];
  validItems: {
    categoryName: string;
    itemName: string;
    variantName: string;
    price: number;
    active: boolean;
    sku?: string;
  }[];
}

export class MenuExcelService {
  static generateTemplate(): Uint8Array {
    const sampleData: ExcelMenuRow[] = [
      { Category: 'Biryani Specials', 'Menu Item': 'Chicken Dum Biryani', Variant: 'Single', Price: 180, Active: true, SKU: 'BIR-01' },
      { Category: 'Biryani Specials', 'Menu Item': 'Chicken Dum Biryani', Variant: 'Full', Price: 320, Active: true, SKU: 'BIR-02' },
      { Category: 'Biryani Specials', 'Menu Item': 'Mutton Biryani', Variant: '500 gms', Price: 380, Active: true, SKU: 'MBIR-01' },
      { Category: 'Biryani Specials', 'Menu Item': 'Mutton Biryani', Variant: '1 Kg', Price: 690, Active: true, SKU: 'MBIR-02' },
      { Category: 'Tiffins', 'Menu Item': 'Idli', Variant: '2 Pieces', Price: 40, Active: true, SKU: 'TIF-01' },
      { Category: 'Tiffins', 'Menu Item': 'Masala Dosa', Variant: 'Regular', Price: 60, Active: true, SKU: 'TIF-02' },
      { Category: 'Beverages', 'Menu Item': 'Tea', Variant: 'Regular', Price: 15, Active: true, SKU: 'BEV-01' },
      { Category: 'Beverages', 'Menu Item': 'Filter Coffee', Variant: 'Regular', Price: 25, Active: true, SKU: 'BEV-02' }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu');

    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  }

  static parseMenuExcel(buffer: ArrayBuffer | Uint8Array, existingItems: any[] = []): ParseResult {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<ExcelMenuRow>(worksheet);

    const result: ParseResult = {
      totalRows: rawRows.length,
      newRows: 0,
      updatedRows: 0,
      errors: [],
      validItems: [],
    };

    rawRows.forEach((row, index) => {
      const rowNumber = index + 2; // Header is row 1
      const category = (row.Category || '').toString().trim();
      const itemName = (row['Menu Item'] || '').toString().trim();
      const variantName = (row.Variant || 'Regular').toString().trim();
      const priceNum = parseFloat((row.Price || '0').toString().replace(/[^0-9.]/g, ''));
      const activeVal = row.Active === true || String(row.Active).toLowerCase() === 'true' || String(row.Active) === '1';
      const sku = (row.SKU || '').toString().trim();

      if (!category) {
        result.errors.push({ row: rowNumber, reason: 'Category is required' });
        return;
      }
      if (!itemName) {
        result.errors.push({ row: rowNumber, reason: 'Menu Item name is required' });
        return;
      }
      if (isNaN(priceNum) || priceNum < 0) {
        result.errors.push({ row: rowNumber, reason: `Invalid price "${row.Price}". Must be a positive number` });
        return;
      }

      const existingMatch = existingItems.find(
        (i: any) => (i.name || '').toLowerCase() === itemName.toLowerCase()
      );

      if (existingMatch) {
        result.updatedRows++;
      } else {
        result.newRows++;
      }

      result.validItems.push({
        categoryName: category,
        itemName,
        variantName: variantName || 'Regular',
        price: priceNum,
        active: activeVal,
        sku,
      });
    });

    return result;
  }
}
