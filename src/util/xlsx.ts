import path from 'node:path';

import type { Sheet } from 'read-excel-file/node';

import type { CsvRow } from '../types/index';

/** Only a hash after the workbook extension in the filename starts a sheet selector. */
export function getExcelWorkbookPath(reference: string): string | undefined {
  const match = /\.xlsx?(#[\s\S]*)?$/i.exec(path.basename(reference));
  if (!match) {
    return undefined;
  }
  return match[1] ? reference.slice(0, -match[1].length) : reference;
}

function selectSheet(sheets: Sheet[], selector: string | undefined): Sheet {
  if (sheets.length === 0) {
    throw new Error('Excel file has no sheets');
  }
  if (!selector) {
    return sheets[0];
  }

  // A leading number is valid in a sheet name. Only a complete integer is a 1-based index.
  if (/^[+-]?\d+$/.test(selector.trim())) {
    const index = Number(selector);
    if (index < 1 || index > sheets.length) {
      throw new Error(
        `Sheet index ${index} is out of range. Available sheets: ${sheets.length} (1-${sheets.length})`,
      );
    }
    return sheets[index - 1];
  }

  const sheet = sheets.find((entry) => entry.sheet === selector);
  if (!sheet) {
    const names = sheets.map((entry) => entry.sheet).join(', ');
    throw new Error(`Sheet "${selector}" not found. Available sheets: ${names}`);
  }
  return sheet;
}

export async function parseXlsxFile(filePath: string): Promise<CsvRow[]> {
  try {
    const actualFilePath = getExcelWorkbookPath(filePath) ?? filePath;
    const sheetSpecifier = filePath.slice(actualFilePath.length + 1);

    // Try to import read-excel-file first to give proper error if not installed
    let readXlsxFile: typeof import('read-excel-file/node').default;
    try {
      const module = await import('read-excel-file/node');
      readXlsxFile = module.default;
    } catch {
      throw new Error(
        'read-excel-file is not installed. Please install it with: npm install read-excel-file\n' +
          'Note: read-excel-file is an optional peer dependency for reading Excel files.',
      );
    }

    const sheets = await readXlsxFile(actualFilePath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${actualFilePath}`);
      }
      throw error;
    });
    const { sheet: sheetName, data: rows } = selectSheet(sheets, sheetSpecifier);

    // Check if the sheet is empty
    if (rows.length === 0) {
      throw new Error(`Sheet "${sheetName}" is empty or contains no valid data rows`);
    }

    // First row should be headers
    const headers = rows[0].map((cell) => (cell == null ? '' : String(cell)));

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
        obj[header] = cellValue == null ? '' : String(cellValue);
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
