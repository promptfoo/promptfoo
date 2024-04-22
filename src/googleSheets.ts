import logger from './logger';

import type { CsvRow } from './types';

async function checkGoogleSheetAccess(url: string) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return { public: true, status: response.status };
    } else {
      return { public: false, status: response.status };
    }
  } catch (error) {
    logger.error('Error checking sheet access:', error);
    return { public: false };
  }
}

export async function fetchCsvFromGoogleSheet(url: string): Promise<CsvRow[]> {
  const { public: isPublic } = await checkGoogleSheetAccess(url);
  logger.debug(`Google Sheets URL: ${url}, isPublic: ${isPublic}`);
  if (isPublic) {
    return fetchCsvFromGoogleSheetUnauthenticated(url);
  }
  return fetchCsvFromGoogleSheetAuthenticated(url);
}

export async function fetchCsvFromGoogleSheetUnauthenticated(url: string): Promise<CsvRow[]> {
  const { parse: parseCsv } = await import('csv-parse/sync');
  const { fetchWithProxy } = await import('./fetch');

  const csvUrl = url.replace(/\/edit.*$/, '/export?format=csv');
  const response = await fetchWithProxy(csvUrl);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch CSV from Google Sheets URL: ${url}`);
  }
  const csvData = await response.text();
  return parseCsv(csvData, { columns: true });
}

export async function fetchCsvFromGoogleSheetAuthenticated(url: string): Promise<CsvRow[]> {
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets('v4');

  const match = url.match(/\/d\/([^/]+)/);
  if (!match) {
    throw new Error(`Invalid Google Sheets URL: ${url}`);
  }
  const spreadsheetId = match[1];
  const range = 'A1:ZZZ';
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range, auth });

  const rows = response.data.values;
  if (!rows?.length) {
    throw new Error(`No data found in Google Sheets URL: ${url}`);
  }

  // Assuming the first row contains headers
  const headers = rows[0];
  const dataRows = rows.slice(1);

  return dataRows.map((row) => {
    const csvRow: CsvRow = {};
    headers.forEach((header, index) => {
      csvRow[header] = row[index];
    });
    return csvRow;
  });
}

export async function writeCsvToGoogleSheet(rows: CsvRow[], url: string): Promise<void> {
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets('v4');

  const match = url.match(/\/d\/([^/]+)/);
  if (!match) {
    throw new Error(`Invalid Google Sheets URL: ${url}`);
  }
  const spreadsheetId = match[1];
  const range = 'A1:ZZZ';

  // Extract headers from the first row
  const headers = Object.keys(rows[0]);

  // Convert rows to a 2D array
  const values = [headers, ...rows.map((row) => headers.map((header) => row[header]))];

  // Write data to the sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    auth,
    requestBody: {
      values,
    },
  });
}
