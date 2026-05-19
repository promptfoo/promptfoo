import { afterEach, describe, expect, it, vi } from 'vitest';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1234567890/edit';

describe('Google Sheets optional dependency', () => {
  afterEach(() => {
    vi.doUnmock('@googleapis/sheets');
    vi.doUnmock('../src/util/fetch/index');
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

  it('keeps public-sheet CSV reads working when the access probe fails', async () => {
    const fetchWithProxy = vi
      .fn()
      .mockRejectedValueOnce(new Error('probe failed'))
      .mockResolvedValueOnce({
        status: 200,
        text: async () => 'header\nvalue',
      });

    vi.doMock('../src/util/fetch/index', () => ({ fetchWithProxy }));
    vi.doMock('@googleapis/sheets', () => {
      throw new Error('Cannot find package @googleapis/sheets');
    });

    const { fetchCsvFromGoogleSheet } = await import('../src/googleSheets');

    await expect(fetchCsvFromGoogleSheet(SHEET_URL)).resolves.toEqual([{ header: 'value' }]);
    expect(fetchWithProxy).toHaveBeenCalledTimes(2);
  });
});
