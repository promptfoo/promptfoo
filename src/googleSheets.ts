import logger from './logger';
import { fetchWithProxy } from './util/fetch/index';
import { isMissingPackageImportError } from './util/packageImportErrors';
import type { GoogleAuth } from 'google-auth-library';

import type { CsvRow } from './types/index';

class GoogleSheetAuthenticationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetAuthenticationRequiredError';
  }
}

async function createSheetsAuth(scope: string): Promise<GoogleAuth> {
  try {
    const { GoogleAuth } = await import('google-auth-library');
    return new GoogleAuth({ scopes: [`https://www.googleapis.com/auth/${scope}`] });
  } catch (error) {
    if (isMissingPackageImportError(error, 'google-auth-library')) {
      throw new Error(
        'The google-auth-library package is required for authenticated Google Sheets access. Install it with: npm install google-auth-library',
      );
    }
    throw error;
  }
}

function encodePathSegment(value: string): string {
  if (value === '.' || value === '..') {
    throw new Error(`Invalid Google Sheets path segment: ${value}`);
  }
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

async function openSpreadsheet(url: string, scope: string) {
  const match = url.match(/\/d\/([^/]+)/);
  if (!match) {
    throw new Error(`Invalid Google Sheets URL: ${url}`);
  }
  const spreadsheetId = encodePathSegment(match[1]);
  const auth = await createSheetsAuth(scope);
  // The Sheets client uses the process-level Google universe and verifies it against ADC.
  const domain = process.env.GOOGLE_CLOUD_UNIVERSE_DOMAIN ?? 'googleapis.com';
  const credentialDomain = await auth.getUniverseDomain();
  if (domain !== credentialDomain) {
    throw new Error(
      `The configured universe domain (${domain}) does not match the universe domain found in the credentials (${credentialDomain}).`,
    );
  }
  const endpoint = new URL('https://sheets.googleapis.com');
  endpoint.hostname = `sheets.${domain}`;
  return { auth, endpoint: `${endpoint.origin}/v4/spreadsheets/${spreadsheetId}` };
}

function readSheet<T>(auth: GoogleAuth, url: string) {
  return auth.request<T>({
    url,
    method: 'GET',
    retry: true,
    // Google requires both headers to enable gzip response compression.
    headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'promptfoo (gzip)' },
  });
}

async function getSheetTitle(auth: GoogleAuth, endpoint: string, gid?: string): Promise<string> {
  const { data } = await readSheet<{
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(auth, endpoint);
  const sheet = gid
    ? data.sheets?.find((entry) => entry.properties?.sheetId === Number(gid))
    : data.sheets?.[0];
  if (!sheet?.properties?.title) {
    throw new Error(gid ? `Sheet not found for gid: ${gid}` : 'No sheets found in spreadsheet');
  }
  return sheet.properties.title;
}

export async function checkGoogleSheetAccess(url: string) {
  try {
    const response = await fetchWithProxy(url);
    return { public: Boolean(response.ok), status: response.status };
  } catch (error) {
    logger.error(`Error checking sheet access: ${error}`);
    return { public: false };
  }
}

function isHtmlExportResponse(
  response: { headers?: { get(name: string): string | null } },
  body: string,
): boolean {
  const contentType = response.headers?.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('text/html')) {
    return true;
  }
  if (contentType.includes('text/csv') || contentType.includes('application/csv')) {
    return false;
  }

  const prefix = body.trimStart().slice(0, 32).toLowerCase();
  return prefix.startsWith('<!doctype html') || prefix.startsWith('<html');
}

/**
 * Returns the sheet id (`gid`) a Google Sheets URL selects. The browser keeps it in the fragment
 * (`/edit#gid=123`); newer URLs also repeat it in the query (`/edit?gid=123#gid=123`). It stays a
 * string so that sheet id 0 is still truthy.
 */
function getSheetGid(url: string): string | undefined {
  const { searchParams, hash } = new URL(url);
  return searchParams.get('gid') || new URLSearchParams(hash.slice(1)).get('gid') || undefined;
}

export async function fetchCsvFromGoogleSheetUnauthenticated(url: string): Promise<CsvRow[]> {
  const { parse: parseCsv } = await import('csv-parse/sync');

  const gid = getSheetGid(url);
  const csvUrl = `${url.replace(/\/edit.*$/, '/export')}?format=csv${gid ? `&gid=${gid}` : ''}`;

  const response = await fetchWithProxy(csvUrl);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch CSV from Google Sheets URL: ${url}`);
  }
  const csvData = await response.text();
  if (isHtmlExportResponse(response, csvData)) {
    throw new GoogleSheetAuthenticationRequiredError(
      `Failed to fetch CSV from Google Sheets URL: ${url}`,
    );
  }
  return parseCsv(csvData, { columns: true });
}

export async function fetchCsvFromGoogleSheetAuthenticated(url: string): Promise<CsvRow[]> {
  const { auth, endpoint } = await openSpreadsheet(url, 'spreadsheets.readonly');
  const title = await getSheetTitle(auth, endpoint, getSheetGid(url));
  const response = await readSheet<{ values?: string[][] }>(
    auth,
    `${endpoint}/values/${encodePathSegment(title)}`,
  );

  const rows = response.data.values;
  if (!rows?.length) {
    throw new Error(`No data found in Google Sheets URL: ${url}`);
  }

  // Assuming the first row contains headers
  const headers = rows[0];
  const dataRows = rows.slice(1);

  return dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])),
  );
}

export async function fetchCsvFromGoogleSheet(url: string): Promise<CsvRow[]> {
  const access = await checkGoogleSheetAccess(url);
  const { public: isPublic } = access;
  logger.debug(`Google Sheets URL: ${url}, isPublic: ${isPublic}`);
  // A failed probe leaves public access unknown. Try the export before requesting credentials.
  if (isPublic || !('status' in access)) {
    try {
      return await fetchCsvFromGoogleSheetUnauthenticated(url);
    } catch (error) {
      if (isPublic && !(error instanceof GoogleSheetAuthenticationRequiredError)) {
        throw error;
      }
    }
  }
  return fetchCsvFromGoogleSheetAuthenticated(url);
}

export async function writeCsvToGoogleSheet(rows: CsvRow[], url: string): Promise<void> {
  const { auth, endpoint } = await openSpreadsheet(url, 'spreadsheets');

  // Extract headers from the first row
  const headers = Object.keys(rows[0]);

  // Convert rows to a 2D array
  const values = [headers, ...rows.map((row) => headers.map((header) => row[header]))];

  // Helper function to convert column number to A1 notation
  const getColumnLetter = (col: number): string => {
    let letter = '';
    while (col > 0) {
      col--;
      letter = String.fromCharCode(65 + (col % 26)) + letter;
      col = Math.floor(col / 26);
    }
    return letter;
  };

  // Calculate the range based on actual data dimensions
  const numRows = values.length;
  const numCols = headers.length;
  const endColumn = getColumnLetter(numCols);

  const gid = getSheetGid(url);
  const title = gid ? await getSheetTitle(auth, endpoint, gid) : `Sheet${Date.now()}`;
  if (!gid) {
    await auth.request({
      url: `${endpoint}:batchUpdate`,
      method: 'POST',
      retry: true,
      data: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }
  const range = `${title}!A1:${endColumn}${numRows}`;

  // Write data to the sheet
  logger.debug(`Writing CSV to Google Sheets URL: ${url} with ${values.length} rows`);
  await auth.request({
    url: `${endpoint}/values/${encodePathSegment(range)}`,
    method: 'PUT',
    retry: true,
    params: { valueInputOption: 'USER_ENTERED' },
    data: { values },
  });
}
