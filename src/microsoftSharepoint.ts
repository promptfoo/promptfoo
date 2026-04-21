import crypto from 'crypto';
import fs from 'fs';

import { getEnvString } from './envars';
import logger from './logger';
import { fetchWithProxy } from './util/fetch/index';
import type { ConfidentialClientApplication } from '@azure/msal-node';

import type { CsvRow } from './types/index';

let cca: ConfidentialClientApplication | null = null;

/**
 * Fetches CSV data from a SharePoint file using certificate-based authentication.
 * Requires environment variables: SHAREPOINT_CLIENT_ID, SHAREPOINT_TENANT_ID,
 * SHAREPOINT_CERT_PATH, and SHAREPOINT_BASE_URL.
 *
 * @param url - Full SharePoint URL to the CSV file
 * @returns Array of CSV rows as objects
 */
export async function fetchCsvFromSharepoint(url: string): Promise<CsvRow[]> {
  const sharepointBaseUrl = getEnvString('SHAREPOINT_BASE_URL');

  if (!sharepointBaseUrl) {
    throw new Error(
      'SHAREPOINT_BASE_URL environment variable is required. Please set it to your SharePoint base URL (e.g., https://yourcompany.sharepoint.com).',
    );
  }

  const accessToken = await getSharePointAccessToken();

  const normalizedBaseUrl = sharepointBaseUrl.replace(/\/+$/, '');
  const fileRelativeUrl = url.startsWith(normalizedBaseUrl)
    ? url.slice(normalizedBaseUrl.length)
    : url;
  const serverRelativeUrl = fileRelativeUrl.startsWith('/')
    ? fileRelativeUrl
    : `/${fileRelativeUrl}`;
  const apiUrl = `${normalizedBaseUrl}/_api/web/GetFileByServerRelativeUrl('${encodeURI(serverRelativeUrl)}')/$value`;

  logger.debug(`Fetching CSV from SharePoint: ${apiUrl}`);

  const response = await fetchWithProxy(apiUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'text/csv',
    },
  });

  if (!response.ok) {
    const statusText = response.statusText || 'Unknown error';
    throw new Error(
      `Failed to fetch CSV from SharePoint URL: ${url}. Status: ${response.status} ${statusText}`,
    );
  }

  const csvData = await response.text();
  const { parse: parseCsv } = await import('csv-parse/sync');

  try {
    return parseCsv(csvData, { columns: true });
  } catch (error) {
    throw new Error(`Failed to parse CSV data from SharePoint: ${error}`);
  }
}

async function getConfidentialClient(): Promise<ConfidentialClientApplication> {
  if (!cca) {
    const { ConfidentialClientApplication: MsalClient } = await import('@azure/msal-node');

    const clientId = getEnvString('SHAREPOINT_CLIENT_ID');
    const tenantId = getEnvString('SHAREPOINT_TENANT_ID');
    const certPath = getEnvString('SHAREPOINT_CERT_PATH');

    if (!clientId) {
      throw new Error(
        'SHAREPOINT_CLIENT_ID environment variable is required. Please set it to your Azure AD application client ID.',
      );
    }

    if (!tenantId) {
      throw new Error(
        'SHAREPOINT_TENANT_ID environment variable is required. Please set it to your Azure AD tenant ID.',
      );
    }

    if (!certPath) {
      throw new Error(
        'SHAREPOINT_CERT_PATH environment variable is required. Please set it to the path of your certificate PEM file.',
      );
    }

    let pemContent: string;
    try {
      pemContent = fs.readFileSync(certPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read certificate from path: ${certPath}. Error: ${error}`);
    }

    // Extract private key
    const privateKeyMatch = pemContent.match(
      /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/,
    );
    const privateKey = privateKeyMatch ? privateKeyMatch[0] : pemContent;

    // Extract certificate for thumbprint calculation
    const certMatch = pemContent.match(
      /-----BEGIN CERTIFICATE-----\n([\s\S]+?)\n-----END CERTIFICATE-----/,
    );
    if (!certMatch) {
      throw new Error(
        `Certificate not found in PEM file at ${certPath}. The PEM file must contain both private key and certificate.`,
      );
    }

    // Calculate SHA-256 thumbprint from the certificate
    const certDer = Buffer.from(certMatch[1].replace(/\s/g, ''), 'base64');
    const thumbprintSha256 = crypto
      .createHash('sha256')
      .update(certDer)
      .digest('hex')
      .toUpperCase();

    const msalConfig = {
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        clientCertificate: {
          thumbprintSha256,
          privateKey,
        },
      },
    };

    cca = new MsalClient(msalConfig);
  }
  return cca;
}

export async function getSharePointAccessToken() {
  const client = await getConfidentialClient();
  const baseUrl = getEnvString('SHAREPOINT_BASE_URL');

  if (!baseUrl) {
    throw new Error(
      'SHAREPOINT_BASE_URL environment variable is required. Please set it to your SharePoint base URL (e.g., https://yourcompany.sharepoint.com).',
    );
  }

  const tokenResult = await client.acquireTokenByClientCredential({
    scopes: [`${baseUrl}/.default`],
  });

  if (!tokenResult?.accessToken) {
    throw new Error(
      'Failed to acquire SharePoint access token. Please check your authentication configuration.',
    );
  }

  return tokenResult.accessToken;
}
