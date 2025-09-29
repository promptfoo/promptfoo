import * as fs from 'fs';
import type { CsvRow } from '../types';

export async function parseXlsxFile(filePath: string): Promise<CsvRow[]> {
  try {
    // Parse file path and optional sheet name
    // Supports syntax: file.xlsx#SheetName or file.xlsx#2 (1-based index)
    const [actualFilePath, sheetSpecifier] = filePath.split('#');

    // Check if file exists before attempting to read it
    if (!fs.existsSync(actualFilePath)) {
      throw new Error(`File not found: ${actualFilePath}`);
    }

    const xlsx = await import('xlsx');
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
      if (!isNaN(sheetIndex)) {
        // Convert to 0-based index
        const zeroBasedIndex = sheetIndex - 1;
        if (zeroBasedIndex < 0 || zeroBasedIndex >= workbook.SheetNames.length) {
          throw new Error(
            `Sheet index ${sheetIndex} is out of range. Available sheets: ${workbook.SheetNames.length} (1-${workbook.SheetNames.length})`
          );
        }
        sheetName = workbook.SheetNames[zeroBasedIndex];
      } else {
        // It's a sheet name
        if (!workbook.SheetNames.includes(sheetSpecifier)) {
          throw new Error(
            `Sheet "${sheetSpecifier}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`
          );
        }
        sheetName = sheetSpecifier;
      }
    } else {
      // Use the first sheet by default
      sheetName = workbook.SheetNames[0];
    }

    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json<CsvRow>(sheet, { defval: '' });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cannot find module 'xlsx'")) {
      throw new Error(
        'xlsx is not installed. Please install it with: npm install xlsx\n' +
          'Note: xlsx is an optional peer dependency for reading Excel files.',
      );
    }
    throw new Error(
      `Failed to parse Excel file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
