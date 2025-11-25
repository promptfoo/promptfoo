import * as fs from 'fs';
import type { CsvRow } from '../types/index';

export async function parseXlsxFile(filePath: string): Promise<CsvRow[]> {
  try {
    // Parse file path and optional sheet name
    // Supports syntax: file.xlsx#SheetName or file.xlsx#2 (1-based index)
    const [actualFilePath, sheetSpecifier] = filePath.split('#');

    // Try to import xlsx first to give proper error if not installed
    const xlsx = await import('xlsx');

    // Check if file exists before attempting to read it
    if (!fs.existsSync(actualFilePath)) {
      throw new Error(`File not found: ${actualFilePath}`);
    }
    const workbook = xlsx.readFile(actualFilePath);

    // Validate that the workbook has at least one sheet
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel file has no sheets');
    }

    // Determine which sheet to use
    let sheetName: string;

    if (sheetSpecifier) {
      // Check if it's a numeric index (1-based)
      const sheetIndex = parseInt(sheetSpecifier, 10);
      if (isNaN(sheetIndex)) {
        // It's a sheet name
        if (!workbook.SheetNames.includes(sheetSpecifier)) {
          throw new Error(
            `Sheet "${sheetSpecifier}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`,
          );
        }
        sheetName = sheetSpecifier;
      } else {
        // Convert to 0-based index
        const zeroBasedIndex = sheetIndex - 1;
        if (zeroBasedIndex < 0 || zeroBasedIndex >= workbook.SheetNames.length) {
          throw new Error(
            `Sheet index ${sheetIndex} is out of range. Available sheets: ${workbook.SheetNames.length} (1-${workbook.SheetNames.length})`,
          );
        }
        sheetName = workbook.SheetNames[zeroBasedIndex];
      }
    } else {
      // Use the first sheet by default
      sheetName = workbook.SheetNames[0];
    }

    const sheet = workbook.Sheets[sheetName];

    // Convert sheet to JSON and validate the result
    const data = xlsx.utils.sheet_to_json<CsvRow>(sheet, { defval: '' });

    // Check if the sheet is empty
    if (data.length === 0) {
      throw new Error(`Sheet "${sheetName}" is empty or contains no valid data rows`);
    }

    // Check if the first row has any headers
    const firstRow = data[0];
    const headers = Object.keys(firstRow);
    if (headers.length === 0) {
      throw new Error(`Sheet "${sheetName}" has no valid column headers`);
    }

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
      // Handle missing xlsx module
      if (error.message.includes("Cannot find module 'xlsx'")) {
        throw new Error(
          'xlsx is not installed. Please install it with: npm install xlsx\n' +
            'Note: xlsx is an optional peer dependency for reading Excel files.',
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
