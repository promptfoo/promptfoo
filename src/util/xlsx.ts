import * as fs from 'fs';

import type { CsvRow } from '../types/index';

type ReadXlsxFile = typeof import('read-excel-file/node').default;
type ReadSheetNames = typeof import('read-excel-file/node').readSheetNames;

const MISSING_MODULE_ERROR =
  'read-excel-file is not installed. Please install it with: npm install read-excel-file\n' +
  'Note: read-excel-file is an optional peer dependency for reading Excel files.';

const KNOWN_ERROR_PREFIXES = [
  'File not found:',
  'Excel file has no sheets',
  'Sheet "',
  'Sheet index',
  'contains only empty data',
  'read-excel-file is not installed',
];

async function importReadExcelFile(): Promise<{
  readXlsxFile: ReadXlsxFile;
  readSheetNames: ReadSheetNames;
}> {
  try {
    const module = await import('read-excel-file/node');
    return { readXlsxFile: module.default, readSheetNames: module.readSheetNames };
  } catch {
    throw new Error(MISSING_MODULE_ERROR);
  }
}

function resolveSheetOption(
  sheetSpecifier: string | undefined,
  sheetNames: string[],
): string | number {
  if (!sheetSpecifier) {
    return 1;
  }

  const sheetIndex = parseInt(sheetSpecifier, 10);
  if (isNaN(sheetIndex)) {
    if (!sheetNames.includes(sheetSpecifier)) {
      throw new Error(
        `Sheet "${sheetSpecifier}" not found. Available sheets: ${sheetNames.join(', ')}`,
      );
    }
    return sheetSpecifier;
  }

  if (sheetIndex < 1 || sheetIndex > sheetNames.length) {
    throw new Error(
      `Sheet index ${sheetIndex} is out of range. Available sheets: ${sheetNames.length} (1-${sheetNames.length})`,
    );
  }
  return sheetIndex;
}

function convertRowsToCsvData(rows: any[][], headers: string[]): CsvRow[] {
  return rows.slice(1).map((row) => {
    const obj: CsvRow = {};
    headers.forEach((header, index) => {
      const cellValue = row[index];
      obj[header] = cellValue != null ? String(cellValue) : '';
    });
    return obj;
  });
}

function isKnownError(error: Error): boolean {
  if (error.message.includes("Cannot find module 'read-excel-file")) {
    return true;
  }
  return KNOWN_ERROR_PREFIXES.some((prefix) => error.message.startsWith(prefix));
}

async function parseXlsxFileInner(filePath: string): Promise<CsvRow[]> {
  const [actualFilePath, sheetSpecifier] = filePath.split('#');

  if (!fs.existsSync(actualFilePath)) {
    throw new Error(`File not found: ${actualFilePath}`);
  }

  const { readXlsxFile, readSheetNames } = await importReadExcelFile();
  const sheetNames = await readSheetNames(actualFilePath);

  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('Excel file has no sheets');
  }

  const sheetOption = resolveSheetOption(sheetSpecifier, sheetNames);
  const sheetName = typeof sheetOption === 'number' ? sheetNames[sheetOption - 1] : sheetOption;

  const rows = await readXlsxFile(actualFilePath, { sheet: sheetOption });

  if (rows.length === 0 || rows.length === 1) {
    throw new Error(`Sheet "${sheetName}" is empty or contains no valid data rows`);
  }

  const headers = rows[0].map((cell) => (cell != null ? String(cell) : ''));

  if (headers.length === 0 || headers.every((h) => h === '')) {
    throw new Error(`Sheet "${sheetName}" has no valid column headers`);
  }

  const data = convertRowsToCsvData(rows, headers);

  const hasValidData = data.some((row) =>
    headers.some((header) => row[header] && row[header].toString().trim() !== ''),
  );

  if (!hasValidData) {
    throw new Error(
      `Sheet "${sheetName}" contains only empty data. Please ensure the sheet has both headers and data rows.`,
    );
  }

  return data;
}

export async function parseXlsxFile(filePath: string): Promise<CsvRow[]> {
  try {
    return await parseXlsxFileInner(filePath);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Cannot find module 'read-excel-file")) {
        throw new Error(MISSING_MODULE_ERROR);
      }
      if (isKnownError(error)) {
        throw error;
      }
    }

    throw new Error(
      `Failed to parse Excel file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
