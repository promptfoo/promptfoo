import type { CsvRow } from '../types';

export async function parseXlsxFile(filePath: string): Promise<CsvRow[]> {
  try {
    const xlsx = await import('xlsx');
    const workbook = xlsx.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
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
