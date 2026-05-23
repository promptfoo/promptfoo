import { afterEach, describe, expect, it, vi } from 'vitest';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1234567890/edit';

describe('Google Sheets optional dependency', () => {
  afterEach(() => {
    vi.doUnmock('@googleapis/sheets');
    vi.doUnmock('../src/util/fetch/index');
    vi.doUnmock('../src/util/packageImportErrors');
    vi.resetModules();
  });

  it('explains how to install the authenticated Sheets dependency', async () => {
    vi.doMock('@googleapis/sheets', () => {
      throw new Error('Cannot find package @googleapis/sheets');
    });
    vi.doMock('../src/util/packageImportErrors', () => ({
      isMissingPackageImportError: () => true,
    }));

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

  it('parses CSV exports whose first header looks like an HTML tag', async () => {
    const fetchWithProxy = vi.fn().mockResolvedValueOnce({
      status: 200,
      headers: {
        get: () => 'text/csv; charset=utf-8',
      },
      text: async () => '<html>,label\nliteral,value',
    });

    vi.doMock('../src/util/fetch/index', () => ({ fetchWithProxy }));

    const { fetchCsvFromGoogleSheetUnauthenticated } = await import('../src/googleSheets');

    await expect(fetchCsvFromGoogleSheetUnauthenticated(SHEET_URL)).resolves.toEqual([
      { '<html>': 'literal', label: 'value' },
    ]);
  });

  it('falls back to authenticated sheet access when the probe and CSV export both fail', async () => {
    const fetchWithProxy = vi
      .fn()
      .mockRejectedValueOnce(new Error('probe failed'))
      .mockResolvedValueOnce({
        status: 403,
        text: async () => 'forbidden',
      });

    vi.doMock('../src/util/fetch/index', () => ({ fetchWithProxy }));
    vi.doMock('@googleapis/sheets', () => ({
      auth: {
        GoogleAuth: class {},
      },
      sheets: () => ({
        spreadsheets: {
          get: vi.fn().mockResolvedValue({
            data: {
              sheets: [{ properties: { title: 'Sheet1' } }],
            },
          }),
          values: {
            get: vi.fn().mockResolvedValue({
              data: {
                values: [['header'], ['value']],
              },
            }),
          },
        },
      }),
    }));

    const { fetchCsvFromGoogleSheet } = await import('../src/googleSheets');

    await expect(fetchCsvFromGoogleSheet(SHEET_URL)).resolves.toEqual([{ header: 'value' }]);
    expect(fetchWithProxy).toHaveBeenCalledTimes(2);
  });

  it('falls back to authenticated access when CSV export returns a login page', async () => {
    const fetchWithProxy = vi
      .fn()
      .mockRejectedValueOnce(new Error('probe failed'))
      .mockResolvedValueOnce({
        status: 200,
        headers: {
          get: () => 'text/html; charset=utf-8',
        },
        text: async () => '<!doctype html><html><body>Sign in</body></html>',
      });

    vi.doMock('../src/util/fetch/index', () => ({ fetchWithProxy }));
    vi.doMock('@googleapis/sheets', () => ({
      auth: {
        GoogleAuth: class {},
      },
      sheets: () => ({
        spreadsheets: {
          get: vi.fn().mockResolvedValue({
            data: {
              sheets: [{ properties: { title: 'Sheet1' } }],
            },
          }),
          values: {
            get: vi.fn().mockResolvedValue({
              data: {
                values: [['header'], ['value']],
              },
            }),
          },
        },
      }),
    }));

    const { fetchCsvFromGoogleSheet } = await import('../src/googleSheets');

    await expect(fetchCsvFromGoogleSheet(SHEET_URL)).resolves.toEqual([{ header: 'value' }]);
    expect(fetchWithProxy).toHaveBeenCalledTimes(2);
  });

  it('falls back to authenticated access when the access probe masks a login page', async () => {
    const fetchWithProxy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {
          get: () => 'text/html; charset=utf-8',
        },
        text: async () => '<!doctype html><html><body>Sign in</body></html>',
      });

    vi.doMock('../src/util/fetch/index', () => ({ fetchWithProxy }));
    vi.doMock('@googleapis/sheets', () => ({
      auth: {
        GoogleAuth: class {},
      },
      sheets: () => ({
        spreadsheets: {
          get: vi.fn().mockResolvedValue({
            data: {
              sheets: [{ properties: { title: 'Sheet1' } }],
            },
          }),
          values: {
            get: vi.fn().mockResolvedValue({
              data: {
                values: [['header'], ['value']],
              },
            }),
          },
        },
      }),
    }));

    const { fetchCsvFromGoogleSheet } = await import('../src/googleSheets');

    await expect(fetchCsvFromGoogleSheet(SHEET_URL)).resolves.toEqual([{ header: 'value' }]);
    expect(fetchWithProxy).toHaveBeenCalledTimes(2);
  });
});
