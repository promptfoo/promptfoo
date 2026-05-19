import { afterEach, describe, expect, it, vi } from 'vitest';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1234567890/edit';

describe('Google Sheets optional dependency', () => {
  afterEach(() => {
    vi.doUnmock('@googleapis/sheets');
    vi.resetModules();
  });

  it('explains how to install the authenticated Sheets dependency', async () => {
    vi.doMock('@googleapis/sheets', () => {
      throw new Error('Cannot find package @googleapis/sheets');
    });

    const { fetchCsvFromGoogleSheetAuthenticated } = await import('../src/googleSheets');
    const fetchPromise = fetchCsvFromGoogleSheetAuthenticated(SHEET_URL);

    await expect(fetchPromise).rejects.toThrow(
      'The @googleapis/sheets package is required for authenticated Google Sheets access.',
    );
    await expect(fetchPromise).rejects.toThrow('npm install @googleapis/sheets');
  });
});
