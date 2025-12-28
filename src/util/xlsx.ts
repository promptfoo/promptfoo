import * as fs from 'fs';

import type { CsvRow } from '../types/index';

export async function parseXlsxFile(filePath: string): Promise<CsvRow[]> {
  try {
    // Parse file path and optional sheet name
    // Supports syntax: file.xlsx#SheetName or file.xlsx#2 (1-based index)
    const [actualFilePath, sheetSpecifier] = filePath.split('#');

    // Check if file exists before attempting to read it
    if (!fs.existsSync(actualFilePath)) {
      throw new Error(`File not found: ${actualFilePath}`);
    }

    // Try to import read-excel-file first to give proper error if not installed
    let readXlsxFile: typeof import('read-excel-file/node').default;
    let readSheetNames: typeof import('read-excel-file/node').readSheetNames;
    try {
      const module = await import('read-excel-file/node');
      readXlsxFile = module.default;
      readSheetNames = module.readSheetNames;
    } catch {
      throw new Error(
        'read-excel-file is not installed. Please install it with: npm install read-excel-file\n' +
          'Note: read-excel-file is an optional peer dependency for reading Excel files.',
      );
    }

    // Get all sheet names to validate and determine which sheet to use
    const sheetNames = await readSheetNames(actualFilePath);

    // Validate that the workbook has at least one sheet
    if (!sheetNames || sheetNames.length === 0) {
      throw new Error('Excel file has no sheets');
    }

    // Determine which sheet to use
    let sheetOption: string | number;

    if (sheetSpecifier) {
      // Check if it's a numeric index (1-based)
      const sheetIndex = parseInt(sheetSpecifier, 10);
      if (isNaN(sheetIndex)) {
        // It's a sheet name
        if (!sheetNames.includes(sheetSpecifier)) {
          throw new Error(
            `Sheet "${sheetSpecifier}" not found. Available sheets: ${sheetNames.join(', ')}`,
          );
        }
        sheetOption = sheetSpecifier;
      } else {
        // Validate 1-based index
        if (sheetIndex < 1 || sheetIndex > sheetNames.length) {
          throw new Error(
            `Sheet index ${sheetIndex} is out of range. Available sheets: ${sheetNames.length} (1-${sheetNames.length})`,
          );
        }
        sheetOption = sheetIndex;
      }
    } else {
      // Use the first sheet by default (1-based index)
      sheetOption = 1;
    }

    // Get the sheet name for error messages
    const sheetName = typeof sheetOption === 'number' ? sheetNames[sheetOption - 1] : sheetOption;

    // Read the sheet - returns array of arrays
    const rows = await readXlsxFile(actualFilePath, { sheet: sheetOption });

    // Check if the sheet is empty
    if (rows.length === 0) {
      throw new Error(`Sheet "${sheetName}" is empty or contains no valid data rows`);
    }

    // First row should be headers
    const headers = rows[0].map((cell) => (cell != null ? String(cell) : ''));

    // Check if the first row has any headers
    if (headers.length === 0 || headers.every((h) => h === '')) {
      throw new Error(`Sheet "${sheetName}" has no valid column headers`);
    }

    // Check if there's only headers with no data rows
    if (rows.length === 1) {
      throw new Error(`Sheet "${sheetName}" is empty or contains no valid data rows`);
    }

    // Convert rows to array of objects (similar to xlsx's sheet_to_json with defval: '')
    const data: CsvRow[] = rows.slice(1).map((row) => {
      const obj: CsvRow = {};
      headers.forEach((header, index) => {
        // Use empty string as default value (like xlsx's defval: '')
        const cellValue = row[index];
        obj[header] = cellValue != null ? String(cellValue) : '';
      });
      return obj;
    });

    // Check for completely empty columns (all values are empty strings)
    const hasValidData = data.some((row) =>
      headers.some((header) => row[header] && row[header].toString().trim() !== ''),
    );

    if (!hasValidData) {
      throw new Error(
        `Sheet "${sheetName}" contains only empty data. Please ensure the sheet has both headers and data rows.`,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof Error) {
      // Handle missing read-excel-file module
      if (error.message.includes("Cannot find module 'read-excel-file")) {
        throw new Error(
          'read-excel-file is not installed. Please install it with: npm install read-excel-file\n' +
            'Note: read-excel-file is an optional peer dependency for reading Excel files.',
        );
      }

      // Re-throw our own validation errors without wrapping
      // These already have descriptive messages
      const knownErrors = [
        'File not found:',
        'Excel file has no sheets',
        'Sheet "',
        'Sheet index',
        'contains only empty data',
        'read-excel-file is not installed',
      ];

      if (knownErrors.some((prefix) => error.message.startsWith(prefix))) {
        throw error;
      }
    }

    // Wrap unexpected parsing errors
    throw new Error(
      `Failed to parse Excel file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
