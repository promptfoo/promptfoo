import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';

import httpZ from 'http-z';
import { Agent } from 'undici';
import { z } from 'zod';
import { fetchWithCache } from '../cache';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { maybeLoadConfigFromExternalFile, maybeLoadFromExternalFile } from '../util/file';
import { isJavascriptFile } from '../util/fileExtensions';
import { renderVarsInObject } from '../util/index';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { TOKEN_REFRESH_BUFFER_MS } from '../util/oauth';
import { safeResolve } from '../util/pathUtils';
import { sanitizeObject, sanitizeUrl } from '../util/sanitizer';
import { getNunjucksEngine } from '../util/templates';
import { createEmptyTokenUsage } from '../util/tokenUsageUtils';
import {
  createTransformRequest,
  createTransformResponse,
  type TransformResponseContext,
} from './httpTransforms';
import { REQUEST_TIMEOUT_MS, type ToolFormat, transformToolChoice, transformTools } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
  TokenUsage,
} from '../types/index';

/**
 * Escapes string values in variables for safe JSON template substitution.
 * Converts { key: "value\nwith\nnewlines" } to { key: "value\\nwith\\nnewlines" }
 */
export function escapeJsonVariables(vars: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [
      key,
      typeof value === 'string' ? JSON.stringify(value).slice(1, -1) : value,
    ]),
  );
}

/**
 * Detect certificate type from its filename extension.
 */
function detectTypeFromFilename(filename: string): string | undefined {
  const ext = filename.toLowerCase();
  if (ext.endsWith('.pfx') || ext.endsWith('.p12')) {
    return 'pfx';
  }
  if (ext.endsWith('.jks')) {
    return 'jks';
  }
  if (ext.endsWith('.pem') || ext.endsWith('.key')) {
    return 'pem';
  }
  return undefined;
}

/**
 * Detect certificate type from legacy field names present in the auth config.
 */
function detectTypeFromLegacyFields(signatureAuth: any): string | undefined {
  if (signatureAuth.privateKeyPath || signatureAuth.privateKey) {
    return 'pem';
  }
  if (signatureAuth.keystorePath || signatureAuth.keystoreContent) {
    return 'jks';
  }
  if (
    signatureAuth.pfxPath ||
    signatureAuth.pfxContent ||
    (signatureAuth.certPath && signatureAuth.keyPath)
  ) {
    return 'pfx';
  }
  return undefined;
}

/**
 * Apply PFX-specific generic field mappings to processedAuth.
 */
function applyPfxGenericFields(
  processedAuth: any,
  certificateContent: string | undefined,
  certificatePassword: string | undefined,
  certificateFilename: string | undefined,
): void {
  if (certificateContent && !processedAuth.pfxContent) {
    processedAuth.pfxContent = certificateContent;
  }
  if (certificatePassword && !processedAuth.pfxPassword) {
    processedAuth.pfxPassword = certificatePassword;
  }
  if (certificateFilename && !processedAuth.pfxPath) {
    processedAuth.certificateFilename = certificateFilename;
  }
}

/**
 * Apply JKS-specific generic field mappings to processedAuth.
 */
function applyJksGenericFields(
  processedAuth: any,
  certificateContent: string | undefined,
  certificatePassword: string | undefined,
  certificateFilename: string | undefined,
): void {
  if (certificateContent && !processedAuth.keystoreContent) {
    processedAuth.keystoreContent = certificateContent;
  }
  if (certificatePassword && !processedAuth.keystorePassword) {
    processedAuth.keystorePassword = certificatePassword;
  }
  if (certificateFilename && !processedAuth.keystorePath) {
    processedAuth.certificateFilename = certificateFilename;
  }
}

/**
 * Apply PEM-specific generic field mappings to processedAuth.
 */
function applyPemGenericFields(
  processedAuth: any,
  certificateContent: string | undefined,
  certificatePassword: string | undefined,
  certificateFilename: string | undefined,
): void {
  if (certificateContent && !processedAuth.privateKey) {
    processedAuth.privateKey = Buffer.from(certificateContent, 'base64').toString('utf8');
  }
  if (certificatePassword) {
    processedAuth.certificatePassword = certificatePassword;
  }
  if (certificateFilename) {
    processedAuth.certificateFilename = certificateFilename;
  }
}

/**
 * Maps promptfoo-cloud certificate fields to type-specific fields based on the certificate type.
 * This handles certificates stored in the database with generic field names.
 *
 * @param signatureAuth - The signature authentication configuration
 * @returns The processed signature authentication configuration
 */
function preprocessSignatureAuthConfig(signatureAuth: any): any {
  if (!signatureAuth) {
    return signatureAuth;
  }

  const { certificateContent, certificatePassword, certificateFilename, type, ...rest } =
    signatureAuth;

  let detectedType = type;
  if (!detectedType) {
    if (certificateFilename) {
      detectedType = detectTypeFromFilename(certificateFilename);
    }
    if (!detectedType) {
      detectedType = detectTypeFromLegacyFields(signatureAuth);
    }
  }

  const hasGenericFields = certificateContent || certificatePassword || certificateFilename;

  if (!hasGenericFields && !detectedType) {
    return signatureAuth;
  }

  const processedAuth = { ...rest };

  if (detectedType) {
    processedAuth.type = detectedType;
  }

  if (!detectedType) {
    throw new Error(
      `[Http Provider] Cannot determine certificate type from filename: ${certificateFilename || 'no filename provided'}`,
    );
  }

  switch (detectedType) {
    case 'pfx':
      applyPfxGenericFields(
        processedAuth,
        certificateContent,
        certificatePassword,
        certificateFilename,
      );
      break;
    case 'jks':
      applyJksGenericFields(
        processedAuth,
        certificateContent,
        certificatePassword,
        certificateFilename,
      );
      break;
    case 'pem':
      applyPemGenericFields(
        processedAuth,
        certificateContent,
        certificatePassword,
        certificateFilename,
      );
      break;
    default:
      throw new Error(`[Http Provider] Unknown certificate type: ${detectedType}`);
  }

  return processedAuth;
}

/**
 * Renders a JSON template string with proper escaping for JSON context.
 *
 * When template substitution would create invalid JSON (due to unescaped newlines,
 * quotes, etc.), this function attempts to fix it by re-rendering with escaped variables.
 *
 * @param template - The template string (should look like JSON)
 * @param vars - Variables to substitute into the template
 * @returns Parsed JSON object/array/primitive
 * @throws Error if the template cannot be rendered as valid JSON
 */
function renderJsonTemplate(template: string, vars: Record<string, any>): any {
  // First attempt: try normal rendering and parsing
  const rendered = renderVarsInObject(template, vars);
  try {
    return JSON.parse(rendered);
  } catch {
    // Second attempt: re-render with JSON-escaped variables
    const escapedVars = escapeJsonVariables(vars);
    const reRendered = renderVarsInObject(template, escapedVars);
    return JSON.parse(reRendered); // This will throw if still invalid
  }
}

/**
 * Safely render raw HTTP templates with Nunjucks by wrapping the entire
 * template in raw blocks and selectively allowing only {{...}} variables.
 */
function renderRawRequestWithNunjucks(template: string, vars: Record<string, any>): string {
  // Protect literal Nunjucks syntax in the source by raw-wrapping
  // and then re-enabling only variable tags.
  const VAR_TOKEN = '__PF_VAR__';
  let working = template;

  // 1) Temporarily replace all {{...}} occurrences with placeholders
  const placeholders: string[] = [];
  working = working.replace(/\{\{[\s\S]*?\}\}/g, (m) => {
    const idx = placeholders.push(m) - 1;
    return `${VAR_TOKEN}${idx}__`;
  });

  // 2) Wrap everything in raw so Nunjucks ignores any {%...%} found in headers/cookies
  working = `{% raw %}${working}{% endraw %}`;

  // 3) Re-enable variables by inserting endraw/raw around each placeholder
  working = working.replace(new RegExp(`${VAR_TOKEN}(\\d+)__`, 'g'), (_m, g1) => {
    const original = placeholders[Number(g1)];
    return `{% endraw %}${original}{% raw %}`;
  });

  // 4) Render with Nunjucks normally
  const nunjucks = getNunjucksEngine();
  return nunjucks.renderString(working, vars);
}

// This function is used to encode the URL in the first line of a raw request
export function urlEncodeRawRequestPath(rawRequest: string) {
  const firstLine = rawRequest.split('\n')[0];

  const firstSpace = firstLine.indexOf(' ');
  const method = firstLine.slice(0, firstSpace);
  if (!method || !http.METHODS.includes(method)) {
    logger.error(`[Http Provider] HTTP request method ${method} is not valid. From: ${firstLine}`);
    throw new Error(
      `[Http Provider] HTTP request method ${method} is not valid. From: ${firstLine}`,
    );
  }
  const lastSpace = firstLine.lastIndexOf(' ');
  if (lastSpace === -1) {
    logger.error(
      `[Http Provider] HTTP request URL is not valid. Protocol is missing. From: ${firstLine}`,
    );
    throw new Error(
      `[Http Provider] HTTP request URL is not valid. Protocol is missing. From: ${firstLine}`,
    );
  }
  const url = firstLine.slice(firstSpace + 1, lastSpace);

  if (url.length === 0) {
    logger.error(`[Http Provider] HTTP request URL is not valid. From: ${firstLine}`);
    throw new Error(`[Http Provider] HTTP request URL is not valid. From: ${firstLine}`);
  }

  const protocol = lastSpace < firstLine.length ? firstLine.slice(lastSpace + 1) : '';

  if (!protocol.toLowerCase().startsWith('http')) {
    logger.error(`[Http Provider] HTTP request protocol is not valid. From: ${firstLine}`);
    throw new Error(`[Http Provider] HTTP request protocol is not valid. From: ${firstLine}`);
  }

  logger.debug(`[Http Provider] Encoding URL: ${url} from first line of raw request: ${firstLine}`);

  try {
    // Use the built-in URL class to parse and encode the URL
    const parsedUrl = new URL(url, 'http://placeholder-base.com');

    // Replace the original URL in the first line
    rawRequest = rawRequest.replace(
      firstLine,
      `${method} ${parsedUrl.pathname}${parsedUrl.search}${protocol ? ' ' + protocol : ''}`,
    );
  } catch (err) {
    logger.error(`[Http Provider] Error parsing URL in HTTP request: ${String(err)}`);
    throw new Error(`[Http Provider] Error parsing URL in HTTP request: ${String(err)}`);
  }

  return rawRequest;
}

/**
 * Detects if a string is likely base64-encoded
 */
function isBase64(str: string): boolean {
  // Check for common base64 patterns
  // Must be divisible by 4, only contain valid base64 chars, and optionally end with padding
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return str.length % 4 === 0 && base64Regex.test(str) && str.length > 100;
}

/**
 * Load a private key from PEM-type signature auth config.
 */
async function loadPemPrivateKey(signatureAuth: any): Promise<string> {
  if (signatureAuth.privateKeyPath) {
    const resolvedPath = safeResolve(cliState.basePath || '', signatureAuth.privateKeyPath);
    return fs.readFileSync(resolvedPath, 'utf8');
  }
  if (signatureAuth.privateKey) {
    return signatureAuth.privateKey;
  }
  if (signatureAuth.certificateContent) {
    logger.debug(`[Signature Auth] Loading PEM from remote certificate content`);
    return Buffer.from(signatureAuth.certificateContent, 'base64').toString('utf8');
  }
  throw new Error(
    'PEM private key is required. Provide privateKey, privateKeyPath, or certificateContent',
  );
}

/**
 * Load a private key from JKS-type signature auth config.
 */
async function loadJksPrivateKey(signatureAuth: any): Promise<string> {
  const keystorePassword =
    signatureAuth.keystorePassword ||
    signatureAuth.certificatePassword ||
    getEnvString('PROMPTFOO_JKS_PASSWORD');

  if (!keystorePassword) {
    throw new Error(
      'JKS keystore password is required. Provide it via config keystorePassword/certificatePassword or PROMPTFOO_JKS_PASSWORD environment variable',
    );
  }

  const jksModule = await import('jks-js').catch(() => {
    throw new Error(
      'JKS certificate support requires the "jks-js" package. Install it with: npm install jks-js',
    );
  });

  const jks = jksModule as any;
  let keystoreData: Buffer;

  if (signatureAuth.keystoreContent || signatureAuth.certificateContent) {
    const content = signatureAuth.keystoreContent || signatureAuth.certificateContent;
    logger.debug(`[Signature Auth] Loading JKS from base64 content`);
    keystoreData = Buffer.from(content, 'base64');
  } else if (signatureAuth.keystorePath) {
    const resolvedPath = safeResolve(cliState.basePath || '', signatureAuth.keystorePath);
    keystoreData = fs.readFileSync(resolvedPath);
  } else {
    throw new Error(
      'JKS keystore content or path is required. Provide keystoreContent/certificateContent or keystorePath',
    );
  }

  const keystore = jks.toPem(keystoreData, keystorePassword);
  const aliases = Object.keys(keystore);
  if (aliases.length === 0) {
    throw new Error('No certificates found in JKS file');
  }

  const targetAlias = signatureAuth.keyAlias || aliases[0];
  const entry = keystore[targetAlias];

  if (!entry) {
    throw new Error(
      `Alias '${targetAlias}' not found in JKS file. Available aliases: ${aliases.join(', ')}`,
    );
  }
  if (!entry.key) {
    throw new Error('No private key found for the specified alias in JKS file');
  }

  return entry.key;
}

/**
 * Load private key from PFX using inline content or file path (PKCS12).
 */
async function loadPfxKeyFromPkcs12(signatureAuth: any, pfxPassword: string): Promise<string> {
  const pemModule = await import('pem').catch(() => {
    throw new Error(
      'PFX certificate support requires the "pem" package. Install it with: npm install pem',
    );
  });

  const pem = pemModule.default as any;
  let result: { key: string; cert: string };

  if (signatureAuth.pfxContent || signatureAuth.certificateContent) {
    const content = signatureAuth.pfxContent || signatureAuth.certificateContent;
    logger.debug(`[Signature Auth] Loading PFX from base64 content`);
    const pfxBuffer = Buffer.from(content, 'base64');
    logger.debug(
      `[Signature Auth][PFX] Base64 content length: ${content.length}, decoded bytes: ${pfxBuffer.byteLength}`,
    );
    result = await new Promise<{ key: string; cert: string }>((resolve, reject) => {
      pem.readPkcs12(pfxBuffer, { p12Password: pfxPassword }, (err: any, data: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  } else {
    const resolvedPath = safeResolve(cliState.basePath || '', signatureAuth.pfxPath);
    logger.debug(`[Signature Auth] Loading PFX file: ${resolvedPath}`);
    try {
      const stat = await fs.promises.stat(resolvedPath);
      logger.debug(`[Signature Auth][PFX] PFX file size: ${stat.size} bytes`);
    } catch (e) {
      logger.debug(`[Signature Auth][PFX] Could not stat PFX file: ${String(e)}`);
    }
    result = await new Promise<{ key: string; cert: string }>((resolve, reject) => {
      pem.readPkcs12(resolvedPath, { p12Password: pfxPassword }, (err: any, data: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  if (!result.key) {
    logger.error('[Signature Auth][PFX] No private key extracted from PFX');
    throw new Error('No private key found in PFX file');
  }

  logger.debug(`[Signature Auth] Successfully extracted private key from PFX using pem library`);
  return result.key;
}

/**
 * Load private key from separate cert+key files or base64 content.
 */
async function loadCertAndKeyPrivateKey(signatureAuth: any): Promise<string> {
  if (signatureAuth.keyContent) {
    logger.debug(`[Signature Auth] Loading private key from base64 content`);
    const privateKey = Buffer.from(signatureAuth.keyContent, 'base64').toString('utf8');
    logger.debug(
      `[Signature Auth][PFX] Decoded keyContent length: ${privateKey.length} characters`,
    );
    logger.debug(`[Signature Auth] Successfully loaded private key from separate key file`);
    return privateKey;
  }

  const resolvedCertPath = safeResolve(cliState.basePath || '', signatureAuth.certPath);
  const resolvedKeyPath = safeResolve(cliState.basePath || '', signatureAuth.keyPath);
  logger.debug(
    `[Signature Auth] Loading separate CRT and KEY files: ${resolvedCertPath}, ${resolvedKeyPath}`,
  );

  if (!fs.existsSync(resolvedKeyPath)) {
    throw new Error(`Key file not found: ${resolvedKeyPath}`);
  }
  if (!fs.existsSync(resolvedCertPath)) {
    throw new Error(`Certificate file not found: ${resolvedCertPath}`);
  }

  const privateKey = fs.readFileSync(resolvedKeyPath, 'utf8');
  logger.debug(`[Signature Auth][PFX] Loaded key file characters: ${privateKey.length}`);
  logger.debug(`[Signature Auth] Successfully loaded private key from separate key file`);
  return privateKey;
}

/**
 * Rethrow a PFX loading error with a more user-friendly message.
 */
function rethrowPfxLoadError(err: unknown, signatureAuth: any): never {
  if (err instanceof Error) {
    if (err.message.includes('ENOENT') && signatureAuth.pfxPath) {
      const resolvedPath = safeResolve(cliState.basePath || '', signatureAuth.pfxPath);
      throw new Error(`PFX file not found: ${resolvedPath}`);
    }
    if (err.message.includes('invalid') || err.message.includes('decrypt')) {
      throw new Error(`Invalid PFX file format or wrong password: ${err.message}`);
    }
  }
  logger.error(`Error loading PFX certificate: ${String(err)}`);
  const sourceDesc =
    signatureAuth.pfxContent || signatureAuth.certificateContent
      ? 'content is valid'
      : 'file exists';
  throw new Error(
    `Failed to load PFX certificate. Make sure the ${sourceDesc} and the password is correct: ${String(err)}`,
  );
}

/**
 * Load private key via PKCS12 (PFX) path or content, given the password.
 */
async function loadPfxWithPassword(signatureAuth: any): Promise<string> {
  const pfxPassword =
    signatureAuth.pfxPassword ||
    signatureAuth.certificatePassword ||
    getEnvString('PROMPTFOO_PFX_PASSWORD');

  if (!pfxPassword) {
    throw new Error(
      'PFX certificate password is required. Provide it via config pfxPassword/certificatePassword or PROMPTFOO_PFX_PASSWORD environment variable',
    );
  }

  try {
    return await loadPfxKeyFromPkcs12(signatureAuth, pfxPassword);
  } catch (err) {
    rethrowPfxLoadError(err, signatureAuth);
  }
}

/**
 * Load a private key from PFX-type signature auth config.
 */
async function loadPfxPrivateKey(signatureAuth: any): Promise<string> {
  const hasPfxContent = signatureAuth.pfxContent || signatureAuth.certificateContent;
  const hasPfxPath = signatureAuth.pfxPath;
  const hasCertAndKey =
    (signatureAuth.certPath && signatureAuth.keyPath) ||
    (signatureAuth.certContent && signatureAuth.keyContent);

  logger.debug(
    `[Signature Auth][PFX] Source detection: hasPfxContent=${Boolean(hasPfxContent)}, hasPfxPath=${Boolean(
      hasPfxPath,
    )}, hasCertAndKey=${Boolean(hasCertAndKey)}; filename=${
      signatureAuth.certificateFilename || signatureAuth.pfxPath || 'n/a'
    }`,
  );

  if (hasPfxPath || hasPfxContent) {
    return loadPfxWithPassword(signatureAuth);
  }

  if (hasCertAndKey) {
    try {
      return await loadCertAndKeyPrivateKey(signatureAuth);
    } catch (err) {
      logger.error(`Error loading certificate/key files: ${String(err)}`);
      throw new Error(
        `Failed to load certificate/key files. Make sure both files exist and are readable: ${String(err)}`,
      );
    }
  }

  throw new Error(
    'PFX type requires either pfxPath, pfxContent, both certPath and keyPath, or both certContent and keyContent',
  );
}

/**
 * Detect the auth type from legacy field presence if not explicitly set.
 */
function detectSignatureAuthType(signatureAuth: any): string | undefined {
  if (signatureAuth.privateKeyPath || signatureAuth.privateKey) {
    return 'pem';
  }
  if (signatureAuth.keystorePath || signatureAuth.keystoreContent) {
    return 'jks';
  }
  if (
    signatureAuth.pfxPath ||
    signatureAuth.pfxContent ||
    (signatureAuth.certPath && signatureAuth.keyPath)
  ) {
    return 'pfx';
  }
  return undefined;
}

/**
 * Load the private key based on the auth type from signatureAuth config.
 */
async function loadPrivateKeyForAuth(signatureAuth: any): Promise<string> {
  const authType = signatureAuth.type || detectSignatureAuthType(signatureAuth);

  switch (authType) {
    case 'pem':
      return loadPemPrivateKey(signatureAuth);
    case 'jks':
      return loadJksPrivateKey(signatureAuth);
    case 'pfx':
      return loadPfxPrivateKey(signatureAuth);
    default:
      throw new Error(`Unsupported signature auth type: ${signatureAuth.type}`);
  }
}

/**
 * Sign data with the private key and return the base64-encoded signature.
 */
function signData(data: string, privateKey: string, algorithm: string): string {
  logger.debug(
    `[Signature Auth] Preparing to sign with algorithm=${algorithm}, dataLength=${data.length}, keyProvided=${Boolean(privateKey)}`,
  );
  const sign = crypto.createSign(algorithm);
  sign.update(data);
  sign.end();
  try {
    const signature = sign.sign(privateKey);
    return signature.toString('base64');
  } catch (e) {
    logger.error(
      `[Signature Auth] Signing failed: ${String(e)}; keyLength=${privateKey?.length || 0}, algorithm=${algorithm}`,
    );
    throw e;
  }
}

/**
 * Generate signature using different certificate types
 */
export async function generateSignature(
  signatureAuth: any,
  signatureTimestamp: number,
): Promise<string> {
  try {
    const privateKey = await loadPrivateKeyForAuth(signatureAuth);

    const data = getNunjucksEngine()
      .renderString(signatureAuth.signatureDataTemplate, { signatureTimestamp })
      .replace(/\\n/g, '\n');

    return signData(data, privateKey, signatureAuth.signatureAlgorithm);
  } catch (err) {
    logger.error(`Error generating signature: ${String(err)}`);
    throw new Error(`Failed to generate signature: ${String(err)}`);
  }
}

function needsSignatureRefresh(timestamp: number, validityMs: number, bufferMs?: number): boolean {
  const now = Date.now();
  const timeElapsed = now - timestamp;
  const effectiveBufferMs = bufferMs ?? Math.floor(validityMs * 0.1); // Default to 10% of validity time
  return timeElapsed + effectiveBufferMs >= validityMs;
}

const TokenEstimationConfigSchema = z.object({
  enabled: z.boolean().prefault(false),
  multiplier: z.number().min(0.01).prefault(1.3),
});

// Base signature auth fields
const BaseSignatureAuthSchema = z.object({
  signatureValidityMs: z.number().prefault(300000),
  signatureDataTemplate: z.string().prefault('{{signatureTimestamp}}'),
  signatureAlgorithm: z.string().prefault('SHA256'),
  signatureRefreshBufferMs: z.number().optional(),
});

// PEM signature auth schema
const PemSignatureAuthSchema = BaseSignatureAuthSchema.extend({
  type: z.literal('pem'),
  privateKeyPath: z.string().optional(),
  privateKey: z.string().optional(),
}).refine((data) => data.privateKeyPath !== undefined || data.privateKey !== undefined, {
  error: 'Either privateKeyPath or privateKey must be provided for PEM type',
});

// JKS signature auth schema
const JksSignatureAuthSchema = BaseSignatureAuthSchema.extend({
  type: z.literal('jks'),
  keystorePath: z.string().optional(),
  keystoreContent: z.string().optional(), // Base64 encoded JKS content
  keystorePassword: z.string().optional(),
  keyAlias: z.string().optional(),
}).refine((data) => data.keystorePath !== undefined || data.keystoreContent !== undefined, {
  error: 'Either keystorePath or keystoreContent must be provided for JKS type',
});

// PFX signature auth schema
const PfxSignatureAuthSchema = BaseSignatureAuthSchema.extend({
  type: z.literal('pfx'),
  pfxPath: z.string().optional(),
  pfxContent: z.string().optional(), // Base64 encoded PFX content
  pfxPassword: z.string().optional(),
  certPath: z.string().optional(),
  keyPath: z.string().optional(),
  certContent: z.string().optional(), // Base64 encoded certificate content
  keyContent: z.string().optional(), // Base64 encoded private key content
}).refine(
  (data) => {
    return (
      data.pfxPath ||
      data.pfxContent ||
      (data.certPath && data.keyPath) ||
      (data.certContent && data.keyContent)
    );
  },
  {
    error:
      'Either pfxPath, pfxContent, both certPath and keyPath, or both certContent and keyContent must be provided for PFX type',
  },
);

// Legacy signature auth schema (for backward compatibility)
const LegacySignatureAuthSchema = z.looseObject(
  BaseSignatureAuthSchema.extend({
    privateKeyPath: z.string().optional(),
    privateKey: z.string().optional(),
    keystorePath: z.string().optional(),
    keystorePassword: z.string().optional(),
    keyAlias: z.string().optional(),
    keyPassword: z.string().optional(),
    pfxPath: z.string().optional(),
    pfxPassword: z.string().optional(),
    certPath: z.string().optional(),
    keyPath: z.string().optional(),
  }).shape,
);

// Generic certificate auth schema (for UI-based certificate uploads)
const GenericCertificateAuthSchema = z.looseObject(
  BaseSignatureAuthSchema.extend({
    certificateContent: z.string().optional(),
    certificatePassword: z.string().optional(),
    certificateFilename: z.string().optional(),
    type: z.enum(['pem', 'jks', 'pfx']).optional(),
    // Include type-specific fields that might be present or added by transform
    pfxContent: z.string().optional(),
    pfxPassword: z.string().optional(),
    pfxPath: z.string().optional(),
    keystoreContent: z.string().optional(),
    keystorePassword: z.string().optional(),
    keystorePath: z.string().optional(),
    privateKey: z.string().optional(),
    privateKeyPath: z.string().optional(),
    keyAlias: z.string().optional(),
    certPath: z.string().optional(),
    keyPath: z.string().optional(),
    certContent: z.string().optional(),
    keyContent: z.string().optional(),
  }).shape,
);

// TLS Certificate configuration schema for HTTPS connections
const TlsCertificateSchema = z
  .object({
    // CA certificate for verifying server certificates
    ca: z.union([z.string(), z.array(z.string())]).optional(),
    caPath: z.string().optional(),

    // Client certificate for mutual TLS
    cert: z.union([z.string(), z.array(z.string())]).optional(),
    certPath: z.string().optional(),

    // Private key for client certificate
    key: z.union([z.string(), z.array(z.string())]).optional(),
    keyPath: z.string().optional(),

    // PFX/PKCS12 certificate bundle
    // Supports inline content as base64-encoded string or Buffer
    pfx: z
      .union([z.string(), z.instanceof(Buffer)])
      .optional()
      .describe(
        'PFX/PKCS12 certificate bundle. Can be a file path via pfxPath, or inline as a base64-encoded string or Buffer',
      ),
    pfxPath: z.string().optional().describe('Path to PFX/PKCS12 certificate file'),
    passphrase: z.string().optional().describe('Passphrase for PFX certificate'),

    // Security options
    rejectUnauthorized: z.boolean().prefault(true),
    servername: z.string().optional(),

    // Cipher configuration
    ciphers: z.string().optional(),
    secureProtocol: z.string().optional(),
    minVersion: z.string().optional(),
    maxVersion: z.string().optional(),
  })
  .refine(
    (data) => {
      // Ensure that if cert is provided, key is also provided (and vice versa)
      const hasCert = data.cert || data.certPath;
      const hasKey = data.key || data.keyPath;
      const hasPfx = data.pfx || data.pfxPath;

      // If using PFX, don't need separate cert/key
      if (hasPfx) {
        return true;
      }

      // If using cert/key, both must be provided
      if (hasCert || hasKey) {
        return hasCert && hasKey;
      }

      return true;
    },
    {
      error:
        'Both certificate and key must be provided for client certificate authentication (unless using PFX)',
    },
  );

const OAuthClientCredentialsSchema = z.object({
  type: z.literal('oauth'),
  grantType: z.literal('client_credentials'),
  clientId: z.string(),
  clientSecret: z.string(),
  tokenUrl: z.string(),
  scopes: z.array(z.string()).optional(),
});

const OAuthPasswordSchema = z.object({
  type: z.literal('oauth'),
  grantType: z.literal('password'),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  tokenUrl: z.string(),
  scopes: z.array(z.string()).optional(),
  username: z.string(),
  password: z.string(),
});

const BasicAuthSchema = z.object({
  type: z.literal('basic'),
  username: z.string(),
  password: z.string(),
});

const BearerAuthSchema = z.object({
  type: z.literal('bearer'),
  token: z.string(),
});

const ApiKeyAuthSchema = z.object({
  type: z.literal('api_key'),
  value: z.string(),
  placement: z.enum(['header', 'query']),
  keyName: z.string(),
});

const AuthSchema = z.union([
  OAuthClientCredentialsSchema,
  OAuthPasswordSchema,
  BasicAuthSchema,
  BearerAuthSchema,
  ApiKeyAuthSchema,
]);

/**
 * Configuration for a separate session endpoint that must be called before the main API.
 * The session endpoint returns a session ID that is then used in the main request.
 */
export const SessionEndpointConfigSchema = z.object({
  /** URL of the session endpoint */
  url: z.string(),
  /** HTTP method for the session endpoint (default: POST) */
  method: z.enum(['GET', 'POST']).optional().default('POST'),
  /** Headers to send with the session endpoint request */
  headers: z.record(z.string(), z.string()).optional(),
  /** Request body for the session endpoint (for POST requests) */
  body: z.union([z.record(z.string(), z.any()), z.string()]).optional(),
  /**
   * Path to extract sessionId from response.
   * Can be a JavaScript expression like 'data.body.sessionId' or 'data.headers["x-session-id"]'
   */
  responseParser: z.union([z.string(), z.function()]),
});

export type SessionEndpointConfig = z.infer<typeof SessionEndpointConfigSchema>;

export const HttpProviderConfigSchema = z.object({
  body: z.union([z.record(z.string(), z.any()), z.string(), z.array(z.any())]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  maxRetries: z.number().min(0).optional(),
  method: z.string().optional(),
  queryParams: z.record(z.string(), z.string()).optional(),
  request: z.string().optional(),
  /**
   * Tools to make available to the model, in OpenAI format.
   * Use with `transformToolsFormat` to auto-convert to provider-specific format.
   */
  tools: z.array(z.any()).optional(),
  /**
   * Tool choice configuration, in OpenAI format.
   * Use with `transformToolsFormat` to auto-convert to provider-specific format.
   */
  tool_choice: z.any().optional(),
  /**
   * Transform OpenAI-format tools/tool_choice to provider-specific format.
   * Use 'openai' for OpenAI-compatible endpoints, 'anthropic' for Anthropic, etc.
   */
  transformToolsFormat: z.enum(['openai', 'anthropic', 'bedrock', 'google']).optional(),
  useHttps: z
    .boolean()
    .optional()
    .describe('Use HTTPS for the request. This only works with the raw request option'),
  /**
   * Configuration for a separate session endpoint.
   * When configured, the provider will call this endpoint to get a session ID
   * before making the main API request.
   */
  session: SessionEndpointConfigSchema.optional(),
  sessionParser: z.union([z.string(), z.function()]).optional(),
  sessionSource: z.enum(['client', 'server', 'endpoint']).optional(),
  stateful: z.boolean().optional(),
  transformRequest: z.union([z.string(), z.function()]).optional(),
  transformResponse: z.union([z.string(), z.function()]).optional(),
  url: z.string().optional(),
  validateStatus: z
    .union([z.string(), z.function({ input: [z.number()], output: z.boolean() })])
    .optional(),
  /**
   * @deprecated use transformResponse instead
   */
  responseParser: z.union([z.string(), z.function()]).optional(),
  // Token estimation configuration
  tokenEstimation: TokenEstimationConfigSchema.optional(),
  auth: AuthSchema.optional(),
  // Digital Signature Authentication with support for multiple certificate types
  signatureAuth: z
    .union([
      LegacySignatureAuthSchema,
      PemSignatureAuthSchema,
      JksSignatureAuthSchema,
      PfxSignatureAuthSchema,
      GenericCertificateAuthSchema,
    ])
    .optional()
    .transform(preprocessSignatureAuthConfig),
  // TLS Certificate configuration for HTTPS connections
  tls: TlsCertificateSchema.optional(),
});

export type HttpProviderConfig = z.infer<typeof HttpProviderConfigSchema>;

function contentTypeIsJson(headers: Record<string, string> | undefined) {
  if (!headers) {
    return false;
  }
  return Object.keys(headers).some((key) => {
    if (key.toLowerCase().startsWith('content-type')) {
      return headers?.[key].includes('application/json');
    }
    return false;
  });
}

interface SessionParserData {
  headers?: Record<string, string> | null;
  body?: Record<string, any> | string | null;
}

/**
 * Loads a module from a file:// reference if needed
 * This function should be called before passing transforms to createTransformResponse/createTransformRequest
 *
 * @param transform - The transform config (string or function)
 * @returns The loaded function, or the original value if not a file:// reference
 */
export async function loadTransformModule(
  transform: string | Function | undefined,
): Promise<string | Function | undefined> {
  if (!transform) {
    return transform;
  }
  if (typeof transform === 'function') {
    return transform;
  }
  if (typeof transform === 'string' && transform.startsWith('file://')) {
    let filename = transform.slice('file://'.length);
    let functionName: string | undefined;
    if (filename.includes(':')) {
      const splits = filename.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filename, functionName] = splits;
      }
    }
    const requiredModule = await importModule(
      path.resolve(cliState.basePath || '', filename),
      functionName,
    );
    if (typeof requiredModule === 'function') {
      return requiredModule;
    }
    throw new Error(
      `Transform module malformed: ${filename} must export a function or have a default export as a function`,
    );
  }
  // For string expressions, return as-is
  return transform;
}

export async function createSessionParser(
  parser: string | Function | undefined,
): Promise<(data: SessionParserData) => string> {
  if (!parser) {
    return () => '';
  }
  if (typeof parser === 'function') {
    return (response) => parser(response);
  }
  if (typeof parser === 'string' && parser.startsWith('file://')) {
    let filename = parser.slice('file://'.length);
    let functionName: string | undefined;
    if (filename.includes(':')) {
      const splits = filename.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filename, functionName] = splits;
      }
    }
    const requiredModule = await importModule(
      path.resolve(cliState.basePath || '', filename),
      functionName,
    );
    if (typeof requiredModule === 'function') {
      return requiredModule;
    }
    throw new Error(
      `Response transform malformed: ${filename} must export a function or have a default export as a function`,
    );
  } else if (typeof parser === 'string') {
    return (data: SessionParserData) => {
      const trimmedParser = parser.trim();

      return new Function('data', `return (${trimmedParser});`)(data);
    };
  }
  throw new Error(
    `Unsupported response transform type: ${typeof parser}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

/**
 * Substitutes template variables in a JSON object or array.
 *
 * This function walks through all properties of the provided JSON structure
 * and replaces template expressions (like {{varName}}) with their actual values.
 * If a substituted string is valid JSON, it will be parsed into an object or array.
 *
 * Example:
 * Input: {"greeting": "Hello {{name}}!", "data": {"id": "{{userId}}"}}
 * Vars: {name: "World", userId: 123}
 * Output: {"greeting": "Hello World!", "data": {"id": 123}}
 *
 * @param body The JSON object or array containing template expressions
 * @param vars Dictionary of variable names and their values for substitution
 * @returns A new object or array with all template expressions replaced
 */
export function processJsonBody(
  body: Record<string, any> | any[] | string,
  vars: Record<string, any>,
): Record<string, any> | any[] | string {
  // First apply the standard variable rendering
  const rendered = renderVarsInObject(body, vars);

  // For objects and arrays, we need to check each string value to see if it can be parsed as JSON
  if (typeof rendered === 'object' && rendered !== null) {
    // Function to process nested values
    const processNestedValues = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(processNestedValues);
      } else if (typeof obj === 'object' && obj !== null) {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = processNestedValues(value);
        }
        return result;
      } else if (typeof obj === 'string') {
        const trimmed = obj.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          // Parse JSON objects and arrays (e.g. from pre-serialized template vars)
          try {
            const parsed = JSON.parse(obj);
            if (typeof parsed === 'object' && parsed !== null) {
              return parsed;
            }
            return obj;
          } catch {
            return obj;
          }
        }
        return obj;
      }
      return obj;
    };

    return processNestedValues(rendered);
  }

  // If it's a string, attempt to parse as JSON
  // For top-level strings, we parse JSON primitives (for backward compatibility)
  // For nested string values in objects, we only parse objects/arrays (see processNestedValues)
  if (typeof rendered === 'string') {
    try {
      return JSON.parse(rendered);
    } catch (err) {
      // If it looks like JSON but parsing failed, try with escaped variables
      const trimmed = rendered.trim();
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && typeof body === 'string') {
        try {
          return renderJsonTemplate(body, vars);
        } catch {
          // Fall back to original behavior
        }
      }
      // JSON.parse failed, return the string as-is
      // This string will be used directly as the request body without further JSON.stringify()
      logger.debug(
        `[HTTP Provider] Body is a string that failed JSON parsing, using as-is: ${String(err)}`,
      );
      return rendered;
    }
  }

  return rendered;
}

/**
 * Substitutes template variables in a text string.
 *
 * Replaces template expressions (like {{varName}}) in the string with their
 * actual values from the provided variables dictionary.
 *
 * Example:
 * Input: "Hello {{name}}! Your user ID is {{userId}}."
 * Vars: {name: "World", userId: 123}
 * Output: "Hello World! Your user ID is 123."
 *
 * @param body The string containing template expressions to substitute
 * @param vars Dictionary of variable names and their values for substitution
 * @returns A new string with all template expressions replaced
 * @throws Error if body is an object instead of a string
 */
export function processTextBody(body: string, vars: Record<string, any>): string {
  if (body == null) {
    return body;
  }
  invariant(
    typeof body !== 'object',
    'Expected body to be a string when content type is not application/json',
  );
  try {
    return renderVarsInObject(body, vars);
  } catch (err) {
    logger.warn(`Error rendering body template: ${err}`);
    return body;
  }
}

/**
 * Normalize line endings in raw HTTP request strings.
 * Converts all line endings to \r\n (HTTP standard) and trims whitespace.
 */
function normalizeHttpLineEndings(input: string): string {
  const normalized = input.replace(/\r\n/g, '\n').trim();
  return normalized.replace(/\n/g, '\r\n');
}

function parseRawRequest(input: string) {
  const adjusted = normalizeHttpLineEndings(input) + '\r\n\r\n';
  // If the injectVar is in a query param, we need to encode the URL in the first line
  const encoded = urlEncodeRawRequestPath(adjusted);
  try {
    const messageModel = httpZ.parse(encoded);
    // Type assertion for request model (http-z v8 doesn't export types)
    const requestModel = messageModel as {
      method: string;
      target: string;
      headers: Array<{ name: string; value: string }>;
      body?: {
        contentType?: string;
        text?: string;
        params?: Array<{ name: string; value: string }>;
      };
    };
    return {
      method: requestModel.method,
      url: requestModel.target,
      headers: requestModel.headers.reduce(
        (acc: Record<string, string>, header: { name: string; value: string }) => {
          acc[header.name.toLowerCase()] = header.value;
          return acc;
        },
        {} as Record<string, string>,
      ),
      body: requestModel.body,
    };
  } catch (err) {
    throw new Error(`Error parsing raw HTTP request: ${String(err)}`);
  }
}

/**
 * Extract the raw body from an HTTP request string.
 * Used when http-z parses the body into params (e.g., multipart/form-data, application/x-www-form-urlencoded)
 * instead of preserving the raw text.
 */
export function extractBodyFromRawRequest(rawRequest: string): string | undefined {
  const adjusted = normalizeHttpLineEndings(rawRequest);

  // Find header/body separator (blank line)
  const separatorIndex = adjusted.indexOf('\r\n\r\n');
  if (separatorIndex === -1) {
    return undefined;
  }

  const body = adjusted.slice(separatorIndex + 4).trim();
  return body.length > 0 ? body : undefined;
}

export function determineRequestBody(
  contentType: boolean,
  parsedPrompt: any,
  configBody: Record<string, any> | any[] | string | undefined,
  vars: Record<string, any>,
): Record<string, any> | any[] | string {
  // Parse stringified JSON body if needed (handles legacy data saved as strings)
  let actualConfigBody = configBody;
  if (typeof configBody === 'string' && contentType) {
    try {
      actualConfigBody = JSON.parse(configBody);
      logger.debug('[HTTP Provider] Parsed stringified config body to object');
    } catch (err) {
      // If parsing fails, it's probably a template string or non-JSON content, leave as-is
      logger.debug(
        `[HTTP Provider] Config body is a string that couldn't be parsed as JSON, treating as template: ${String(err)}`,
      );
    }
  }

  if (contentType) {
    // For JSON content type
    if (typeof parsedPrompt === 'object' && parsedPrompt !== null) {
      // If parser returned an object, merge it with config body
      return Object.assign({}, actualConfigBody || {}, parsedPrompt);
    }
    // Otherwise process the config body with parsed prompt
    return processJsonBody(actualConfigBody as Record<string, any> | any[], {
      ...vars,
      prompt: parsedPrompt,
    });
  }
  // For non-JSON content type, process as text
  return processTextBody(actualConfigBody as string, {
    ...vars,
    prompt: parsedPrompt,
  });
}

export async function createValidateStatus(
  validator: string | ((status: number) => boolean) | undefined,
): Promise<(status: number) => boolean> {
  if (!validator) {
    return (_status: number) => true;
  }

  if (typeof validator === 'function') {
    return validator;
  }

  if (typeof validator === 'string') {
    if (validator.startsWith('file://')) {
      let filename = validator.slice('file://'.length);
      let functionName: string | undefined;
      if (filename.includes(':')) {
        const splits = filename.split(':');
        if (splits[0] && isJavascriptFile(splits[0])) {
          [filename, functionName] = splits;
        }
      }
      try {
        const requiredModule = await importModule(
          path.resolve(cliState.basePath || '', filename),
          functionName,
        );
        if (typeof requiredModule === 'function') {
          return requiredModule;
        }
        throw new Error('Exported value must be a function');
      } catch (err: any) {
        throw new Error(`Status validator malformed: ${filename} - ${err?.message || String(err)}`);
      }
    }
    // Handle string template - wrap in a function body
    try {
      const trimmedValidator = validator.trim();
      // Check if it's an arrow function or regular function
      if (trimmedValidator.includes('=>') || trimmedValidator.startsWith('function')) {
        // For arrow functions and regular functions, evaluate the whole function
        return new Function(`return ${trimmedValidator}`)() as (status: number) => boolean;
      }
      // For expressions, wrap in a function body
      return new Function('status', `return ${trimmedValidator}`) as (status: number) => boolean;
    } catch (err: any) {
      throw new Error(`Invalid status validator expression: ${err?.message || String(err)}`);
    }
  }

  throw new Error(
    `Unsupported status validator type: ${typeof validator}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

/**
 * Estimates token count for a given text using word-based counting
 */
export function estimateTokenCount(text: string, multiplier: number = 1.3): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Split by whitespace and filter out empty strings
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return Math.ceil(words.length * multiplier);
}

/**
 * Load a JKS keystore from config and apply cert/key to tlsOptions.
 */
async function applyJksTlsOptions(tlsConfig: any, tlsOptions: https.AgentOptions): Promise<void> {
  const jksModule = await import('jks-js').catch(() => {
    throw new Error(
      'JKS certificate support requires the "jks-js" package. Install it with: npm install jks-js',
    );
  });
  const jks = jksModule as any;

  const keystorePassword =
    tlsConfig.keystorePassword || tlsConfig.passphrase || getEnvString('PROMPTFOO_JKS_PASSWORD');

  if (!keystorePassword) {
    throw new Error(
      'JKS keystore password is required for TLS. Provide it via passphrase or PROMPTFOO_JKS_PASSWORD environment variable',
    );
  }

  let keystoreData: Buffer;
  if (tlsConfig.jksContent) {
    logger.debug(`[HTTP Provider] Loading JKS from base64 content for TLS`);
    keystoreData = Buffer.from(tlsConfig.jksContent, 'base64');
  } else if (tlsConfig.jksPath) {
    const resolvedPath = safeResolve(cliState.basePath || '', tlsConfig.jksPath);
    logger.debug(`[HTTP Provider] Loading JKS from file for TLS: ${resolvedPath}`);
    keystoreData = fs.readFileSync(resolvedPath);
  } else {
    throw new Error('JKS content or path is required');
  }

  const keystore = jks.toPem(keystoreData, keystorePassword);
  const aliases = Object.keys(keystore);

  if (aliases.length === 0) {
    throw new Error('No certificates found in JKS file');
  }

  const targetAlias = tlsConfig.keyAlias || aliases[0];
  const entry = keystore[targetAlias];

  if (!entry) {
    throw new Error(
      `Alias '${targetAlias}' not found in JKS file. Available aliases: ${aliases.join(', ')}`,
    );
  }

  if (entry.cert) {
    tlsOptions.cert = entry.cert;
    logger.debug(`[HTTP Provider] Extracted certificate from JKS for TLS (alias: ${targetAlias})`);
  }
  if (entry.key) {
    tlsOptions.key = entry.key;
    logger.debug(`[HTTP Provider] Extracted private key from JKS for TLS (alias: ${targetAlias})`);
  }

  if (!tlsOptions.cert || !tlsOptions.key) {
    throw new Error('Failed to extract both certificate and key from JKS file');
  }
}

/**
 * Load client cert/key from non-JKS config and apply to tlsOptions.
 */
function applyStandardCertTlsOptions(
  tlsConfig: z.infer<typeof TlsCertificateSchema>,
  tlsOptions: https.AgentOptions,
): void {
  if (tlsConfig.cert) {
    tlsOptions.cert = tlsConfig.cert;
  } else if (tlsConfig.certPath) {
    const resolvedPath = safeResolve(cliState.basePath || '', tlsConfig.certPath);
    tlsOptions.cert = fs.readFileSync(resolvedPath, 'utf8');
    logger.debug(`[HTTP Provider] Loaded client certificate from ${resolvedPath}`);
  }

  if (tlsConfig.key) {
    tlsOptions.key = tlsConfig.key;
  } else if (tlsConfig.keyPath) {
    const resolvedPath = safeResolve(cliState.basePath || '', tlsConfig.keyPath);
    tlsOptions.key = fs.readFileSync(resolvedPath, 'utf8');
    logger.debug(`[HTTP Provider] Loaded private key from ${resolvedPath}`);
  }
}

/**
 * Load PFX certificate from config and apply to tlsOptions.
 */
function applyPfxTlsOptions(
  tlsConfig: z.infer<typeof TlsCertificateSchema>,
  tlsOptions: https.AgentOptions,
): void {
  if (tlsConfig.pfx) {
    if (typeof tlsConfig.pfx === 'string') {
      if (isBase64(tlsConfig.pfx)) {
        tlsOptions.pfx = Buffer.from(tlsConfig.pfx, 'base64');
        logger.debug(`[HTTP Provider] Using base64-encoded inline PFX certificate`);
      } else {
        tlsOptions.pfx = tlsConfig.pfx;
        logger.debug(`[HTTP Provider] Using inline PFX certificate`);
      }
    } else {
      tlsOptions.pfx = tlsConfig.pfx;
      logger.debug(`[HTTP Provider] Using inline PFX certificate buffer`);
    }
  } else if (tlsConfig.pfxPath) {
    const resolvedPath = safeResolve(cliState.basePath || '', tlsConfig.pfxPath);
    tlsOptions.pfx = fs.readFileSync(resolvedPath);
    logger.debug(`[HTTP Provider] Loaded PFX certificate from ${resolvedPath}`);
  }
}

/**
 * Apply cipher/security options to tlsOptions.
 */
function applyTlsSecurityOptions(
  tlsConfig: z.infer<typeof TlsCertificateSchema>,
  tlsOptions: https.AgentOptions,
): void {
  tlsOptions.rejectUnauthorized = tlsConfig.rejectUnauthorized !== false;

  if (tlsConfig.servername) {
    tlsOptions.servername = tlsConfig.servername;
  }
  if (tlsConfig.ciphers) {
    tlsOptions.ciphers = tlsConfig.ciphers;
  }
  if (tlsConfig.secureProtocol) {
    tlsOptions.secureProtocol = tlsConfig.secureProtocol;
  }
  if (tlsConfig.minVersion) {
    tlsOptions.minVersion = tlsConfig.minVersion as any;
  }
  if (tlsConfig.maxVersion) {
    tlsOptions.maxVersion = tlsConfig.maxVersion as any;
  }
}

/**
 * Creates an HTTPS agent with TLS configuration for secure connections
 */
async function createHttpsAgent(tlsConfig: z.infer<typeof TlsCertificateSchema>): Promise<Agent> {
  const tlsOptions: https.AgentOptions = {};

  // Load CA certificates
  if (tlsConfig.ca) {
    tlsOptions.ca = tlsConfig.ca;
  } else if (tlsConfig.caPath) {
    const resolvedPath = safeResolve(cliState.basePath || '', tlsConfig.caPath);
    tlsOptions.ca = fs.readFileSync(resolvedPath, 'utf8');
    logger.debug(`[HTTP Provider] Loaded CA certificate from ${resolvedPath}`);
  }

  // Handle JKS certificates for TLS (extract cert and key)
  if ((tlsConfig as any).jksPath || (tlsConfig as any).jksContent) {
    try {
      await applyJksTlsOptions(tlsConfig, tlsOptions);
    } catch (err) {
      logger.error(`[HTTP Provider] Failed to load JKS certificate for TLS: ${String(err)}`);
      throw new Error(`Failed to load JKS certificate: ${String(err)}`);
    }
  } else {
    applyStandardCertTlsOptions(tlsConfig, tlsOptions);
  }

  applyPfxTlsOptions(tlsConfig, tlsOptions);

  if (tlsConfig.passphrase) {
    tlsOptions.passphrase = tlsConfig.passphrase;
  }

  applyTlsSecurityOptions(tlsConfig, tlsOptions);

  logger.debug(`[HTTP Provider] Creating HTTPS agent with TLS configuration`);

  return new Agent({
    connect: tlsOptions,
  });
}

export class HttpProvider implements ApiProvider {
  url: string;
  config: HttpProviderConfig;
  private transformResponse: Promise<
    (data: any, text: string, context?: TransformResponseContext) => ProviderResponse
  >;
  private sessionParser: Promise<(data: SessionParserData) => string>;
  private transformRequest: Promise<
    (prompt: string, vars: Record<string, any>, context?: CallApiContextParams) => any
  >;
  private validateStatus: Promise<(status: number) => boolean>;
  private lastSignatureTimestamp?: number;
  private lastSignature?: string;
  private lastToken?: string;
  private lastTokenExpiresAt?: number;
  private tokenRefreshPromise?: Promise<void>;
  private httpsAgent?: Agent;
  private httpsAgentPromise?: Promise<Agent>;
  /**
   * Tracks session IDs that were fetched from the session endpoint.
   * Used to distinguish sessions we created from client-generated UUIDs.
   */
  private fetchedSessions: Set<string> = new Set();
  /**
   * Parser for extracting session ID from session endpoint response.
   */
  private sessionEndpointParser?: Promise<(data: SessionParserData) => string>;

  constructor(url: string, options: ProviderOptions) {
    this.config = HttpProviderConfigSchema.parse(options.config);
    if (!this.config.tokenEstimation && cliState.config?.redteam) {
      this.config.tokenEstimation = { enabled: true, multiplier: 1.3 };
    }
    this.url = this.config.url || url;

    // Pre-load any file:// references before passing to transform functions
    // This ensures httpTransforms.ts doesn't need to import from ../esm
    this.transformResponse = loadTransformModule(
      this.config.transformResponse || this.config.responseParser,
    ).then(createTransformResponse);
    this.sessionParser = createSessionParser(this.config.sessionParser);
    this.transformRequest = loadTransformModule(this.config.transformRequest).then(
      createTransformRequest,
    );
    this.validateStatus = createValidateStatus(this.config.validateStatus);

    // Initialize session endpoint parser if session config is provided
    if (this.config.session) {
      this.sessionEndpointParser = createSessionParser(this.config.session.responseParser);
    }

    // Initialize HTTPS agent if TLS configuration is provided
    // Note: We can't use async in constructor, so we'll initialize on first use
    if (this.config.tls) {
      logger.debug(
        '[HTTP Provider] TLS configuration detected, HTTPS agent will be created on first use',
      );
    }

    if (this.config.request) {
      this.config.request = maybeLoadFromExternalFile(this.config.request) as string;
    } else {
      invariant(
        this.config.body || this.config.method === 'GET',
        `Expected HTTP provider ${this.url} to have a config containing {body}, but instead got ${safeJsonStringify(
          this.config,
        )}`,
      );
    }

    // Process body to resolve file:// references
    if (this.config.body) {
      this.config.body = maybeLoadConfigFromExternalFile(this.config.body);
    }
  }

  id(): string {
    return this.url;
  }

  toString(): string {
    return `[HTTP Provider ${this.url}]`;
  }

  /**
   * Estimates token usage for prompt and completion text
   */
  private async estimateTokenUsage(
    promptText: string,
    completionText: string,
  ): Promise<Partial<TokenUsage> | undefined> {
    if (!this.config.tokenEstimation?.enabled) {
      return undefined;
    }

    try {
      const config = this.config.tokenEstimation;

      const promptTokens = estimateTokenCount(promptText, config.multiplier);
      const completionTokens = estimateTokenCount(completionText, config.multiplier);
      const totalTokens = promptTokens + completionTokens;

      return {
        prompt: promptTokens,
        completion: completionTokens,
        total: totalTokens,
        numRequests: 1,
      };
    } catch (err) {
      logger.warn(`Failed to estimate tokens: ${String(err)}`);
      return undefined;
    }
  }

  private async refreshOAuthTokenIfNeeded(vars: Record<string, any> = {}): Promise<void> {
    if (!this.config.auth || this.config.auth.type !== 'oauth') {
      logger.debug('[HTTP Provider Auth]: No OAuth auth configured');
      return;
    }

    // Render OAuth config values with template substitution
    const nunjucks = getNunjucksEngine();
    const baseConfig = {
      ...this.config.auth,
      clientId: this.config.auth.clientId
        ? nunjucks.renderString(this.config.auth.clientId, vars)
        : undefined,
      clientSecret: this.config.auth.clientSecret
        ? nunjucks.renderString(this.config.auth.clientSecret, vars)
        : undefined,
      tokenUrl: nunjucks.renderString(this.config.auth.tokenUrl, vars),
      scopes: this.config.auth.scopes
        ? this.config.auth.scopes.map((scope) => nunjucks.renderString(scope, vars))
        : undefined,
    };

    // Add username/password for password grant type
    const oauthConfig =
      this.config.auth.grantType === 'password' && 'username' in this.config.auth
        ? {
            ...baseConfig,
            username: this.config.auth.username
              ? nunjucks.renderString(this.config.auth.username, vars)
              : undefined,
            password: this.config.auth.password
              ? nunjucks.renderString(this.config.auth.password, vars)
              : undefined,
          }
        : baseConfig;
    const now = Date.now();

    // Check if token exists and is still valid (with buffer before expiry)
    if (
      this.lastToken &&
      this.lastTokenExpiresAt &&
      now + TOKEN_REFRESH_BUFFER_MS < this.lastTokenExpiresAt
    ) {
      logger.debug('[HTTP Provider Auth]: Using cached OAuth token');
      return;
    }

    // If a refresh is already in progress, wait for it instead of making a new request
    if (this.tokenRefreshPromise != null) {
      logger.debug('[HTTP Provider Auth]: Token refresh already in progress, waiting...');
      try {
        await this.tokenRefreshPromise;
        // If we successfully waited for the refresh, verify token is still valid
        // (it might have expired while we were waiting)
        const stillValid =
          this.lastToken &&
          this.lastTokenExpiresAt &&
          Date.now() + TOKEN_REFRESH_BUFFER_MS < this.lastTokenExpiresAt;
        if (stillValid) {
          return;
        }
        // Token expired while waiting, fall through to refresh again
        logger.debug('[HTTP Provider Auth]: Token expired while waiting, refreshing again...');
      } catch {
        // If the in-progress refresh failed, we'll try again below
        logger.debug('[HTTP Provider Auth]: Previous token refresh failed, retrying...');
      }
    }

    // Start a new token refresh and store the promise for deduplication
    logger.debug('[HTTP Provider Auth]: Refreshing OAuth token');
    const refreshPromise = this.performTokenRefresh(oauthConfig, now);
    this.tokenRefreshPromise = refreshPromise;

    try {
      await refreshPromise;
    } finally {
      // Only clear the promise if it's still the one we created (prevents race conditions)
      if (this.tokenRefreshPromise === refreshPromise) {
        this.tokenRefreshPromise = undefined;
      }
    }
  }

  private async performTokenRefresh(
    oauthConfig: {
      grantType: string;
      clientId?: string;
      clientSecret?: string;
      tokenUrl: string;
      scopes?: string[];
      username?: string;
      password?: string;
    },
    now: number,
  ): Promise<void> {
    try {
      // Prepare the token request body
      const tokenRequestBody = new URLSearchParams();
      tokenRequestBody.append('grant_type', oauthConfig.grantType);
      if (oauthConfig.clientId) {
        tokenRequestBody.append('client_id', oauthConfig.clientId);
      }
      if (oauthConfig.clientSecret) {
        tokenRequestBody.append('client_secret', oauthConfig.clientSecret);
      }

      // Add username and password for password grant type
      if (oauthConfig.grantType === 'password') {
        if (!oauthConfig.username || !oauthConfig.password) {
          throw new Error('Username and password are required for password grant type');
        }
        tokenRequestBody.append('username', oauthConfig.username);
        tokenRequestBody.append('password', oauthConfig.password);
      }

      if (oauthConfig.scopes && oauthConfig.scopes.length > 0) {
        tokenRequestBody.append('scope', oauthConfig.scopes.join(' '));
      }

      // Make the token request
      const httpsAgent = await this.getHttpsAgent();
      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenRequestBody.toString(),
      };

      if (httpsAgent) {
        fetchOptions.dispatcher = httpsAgent;
      }

      const response = await fetchWithCache(
        oauthConfig.tokenUrl,
        fetchOptions,
        REQUEST_TIMEOUT_MS,
        'text',
        true, // Always bust cache for token requests
        0, // No retries for token requests
      );

      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `OAuth token request failed with status ${response.status} ${response.statusText}: ${response.data}`,
        );
      }

      const tokenData = JSON.parse(response.data as string);

      if (!tokenData.access_token) {
        throw new Error('OAuth token response missing access_token');
      }

      this.lastToken = tokenData.access_token;

      // Calculate expiration time
      // expires_in is typically in seconds, default to 3600 (1 hour) if not provided
      const expiresInSeconds = tokenData.expires_in || 3600;
      this.lastTokenExpiresAt = now + expiresInSeconds * 1000;

      logger.debug('[HTTP Provider Auth]: Successfully refreshed OAuth token');
    } catch (err) {
      logger.error(`[HTTP Provider Auth]: Failed to refresh OAuth token: ${String(err)}`);
      throw new Error(`Failed to refresh OAuth token: ${String(err)}`);
    }

    invariant(this.lastToken, 'OAuth token should be defined at this point');
  }

  private async refreshSignatureIfNeeded(vars: Record<string, any>): Promise<void> {
    if (!this.config.signatureAuth) {
      logger.debug('[HTTP Provider Auth]: No signature auth configured');
      return;
    }

    const signatureAuth = this.config.signatureAuth;

    if (
      !this.lastSignatureTimestamp ||
      !this.lastSignature ||
      needsSignatureRefresh(
        this.lastSignatureTimestamp,
        signatureAuth.signatureValidityMs,
        signatureAuth.signatureRefreshBufferMs,
      )
    ) {
      logger.debug('[HTTP Provider Auth]: Generating new signature');
      this.lastSignatureTimestamp = Date.now();

      // Render privateKey with template substitution
      const nunjucks = getNunjucksEngine();
      const renderedConfig: any = {
        ...signatureAuth,
        privateKey: signatureAuth.privateKey
          ? nunjucks.renderString(signatureAuth.privateKey, vars)
          : undefined,
      };

      // Determine the signature auth type for legacy configurations
      let authConfig = renderedConfig;
      if (!('type' in renderedConfig)) {
        authConfig = { ...renderedConfig, type: 'pem' };
      }

      this.lastSignature = await generateSignature(authConfig, this.lastSignatureTimestamp);
      logger.debug('[HTTP Provider Auth]: Generated new signature successfully');
    } else {
      logger.debug('[HTTP Provider Auth]: Using cached signature');
    }

    invariant(this.lastSignature, 'Signature should be defined at this point');
    invariant(this.lastSignatureTimestamp, 'Timestamp should be defined at this point');
  }

  /**
   * Resolves the session ID to use for the main API request.
   *
   * For session endpoint configurations, this method handles the logic of when to
   * fetch a new session vs reuse an existing one:
   *
   * - Hydra/Crescendo (shared session): The strategy passes the sessionId we returned
   *   in a previous response. We recognize it (it's in fetchedSessions) and reuse it.
   *
   * - Meta-agent (fresh session): The strategy may pass a client-generated UUID or
   *   no sessionId. We don't recognize it, so we fetch a new session.
   *
   * @param vars - Variables including potential sessionId from context
   * @returns The session ID to use, or undefined if no session endpoint is configured
   */
  private async resolveSessionId(vars: Record<string, any>): Promise<string | undefined> {
    if (!this.config.session || !this.sessionEndpointParser) {
      return undefined;
    }

    const contextSessionId = vars.sessionId as string | undefined;

    // If we have a sessionId from context AND it's one we fetched, reuse it
    if (contextSessionId && this.fetchedSessions.has(contextSessionId)) {
      logger.debug(
        `[HTTP Provider Session]: Reusing existing session from context: ${contextSessionId}`,
      );
      return contextSessionId;
    }

    // Otherwise, fetch a new session from the endpoint
    logger.debug('[HTTP Provider Session]: Fetching new session from endpoint');
    const newSessionId = await this.fetchSessionFromEndpoint(vars);
    this.fetchedSessions.add(newSessionId);
    logger.debug(`[HTTP Provider Session]: Fetched new session: ${newSessionId}`);
    return newSessionId;
  }

  /**
   * Fetches a session ID from the configured session endpoint.
   */
  private async fetchSessionFromEndpoint(vars: Record<string, any>): Promise<string> {
    invariant(this.config.session, 'Session config should be defined');
    invariant(this.sessionEndpointParser, 'Session endpoint parser should be defined');

    const sessionConfig = this.config.session;
    const nunjucks = getNunjucksEngine();

    // Render URL with variables
    const url = nunjucks.renderString(sessionConfig.url, vars);

    // Render headers with variables
    const headers: Record<string, string> = {};
    if (sessionConfig.headers) {
      for (const [key, value] of Object.entries(sessionConfig.headers)) {
        headers[key.toLowerCase()] = nunjucks.renderString(value, vars);
      }
    }

    // Prepare request body
    let body: string | undefined;
    if (sessionConfig.body && sessionConfig.method !== 'GET') {
      if (typeof sessionConfig.body === 'string') {
        body = nunjucks.renderString(sessionConfig.body, vars);
      } else {
        // It's an object, render each value and JSON stringify
        const renderedBody = renderVarsInObject(sessionConfig.body, vars);
        body = JSON.stringify(renderedBody);
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }
    }

    const method = sessionConfig.method || 'POST';

    logger.debug(`[HTTP Provider Session]: Calling session endpoint ${method} ${sanitizeUrl(url)}`);

    // Get HTTPS agent if configured
    const httpsAgent = await this.getHttpsAgent();

    const fetchOptions: any = {
      method,
      headers,
    };

    if (body) {
      fetchOptions.body = body;
    }

    if (httpsAgent) {
      fetchOptions.dispatcher = httpsAgent;
    }

    const response = await fetchWithCache(
      url,
      fetchOptions,
      REQUEST_TIMEOUT_MS,
      'text',
      true, // Always bust cache for session requests
      this.config.maxRetries,
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Session endpoint request failed with status ${response.status} ${response.statusText}: ${response.data}`,
      );
    }

    // Parse response
    const rawText = response.data as string;
    let parsedData: any;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }

    // Extract session ID using the parser
    const sessionId = (await this.sessionEndpointParser)({
      headers: response.headers,
      body: parsedData ?? rawText,
    });

    if (!sessionId) {
      throw new Error(
        `Session endpoint did not return a session ID. Response: ${safeJsonStringify(sanitizeObject(parsedData ?? rawText, { context: 'session response' }))}`,
      );
    }

    return sessionId;
  }

  private async getHttpsAgent(): Promise<Agent | undefined> {
    if (!this.config.tls) {
      return undefined;
    }

    // If agent is already created, return it
    if (this.httpsAgent) {
      return this.httpsAgent;
    }

    // If agent creation is in progress, wait for it
    if (this.httpsAgentPromise != null) {
      return this.httpsAgentPromise;
    }

    // Create the agent
    this.httpsAgentPromise = createHttpsAgent(this.config.tls);
    try {
      this.httpsAgent = await this.httpsAgentPromise;
      logger.debug('[HTTP Provider] HTTPS agent created successfully');
      return this.httpsAgent;
    } catch (err) {
      // Clear the promise so we can retry
      this.httpsAgentPromise = undefined;
      throw err;
    }
  }

  private getDefaultHeaders(body: any): Record<string, string> {
    if (this.config.method === 'GET') {
      return {};
    }
    if (typeof body === 'object' && body !== null) {
      return { 'content-type': 'application/json' };
    } else if (typeof body === 'string') {
      return { 'content-type': 'application/x-www-form-urlencoded' };
    }
    return {};
  }

  private validateContentTypeAndBody(headers: Record<string, string>, body: any): void {
    if (body != null) {
      if (typeof body == 'object' && !contentTypeIsJson(headers)) {
        throw new Error(
          'Content-Type is not application/json, but body is an object or array. The body must be a string if the Content-Type is not application/json.',
        );
      }

      try {
        if (typeof body === 'string' && contentTypeIsJson(headers)) {
          JSON.parse(body);
        }
      } catch {
        logger.warn(
          `[HTTP Provider] Content-Type is application/json, but body is a string. This is likely to cause unexpected results. It should be an object or array. Body: ${body} headers: ${safeJsonStringify(headers)}`,
        );
      }
    }
  }

  async getHeaders(
    defaultHeaders: Record<string, string>,
    vars: Record<string, any>,
  ): Promise<Record<string, string>> {
    const configHeaders = this.config.headers || {};
    // Convert all keys in configHeaders to lowercase
    const headers = Object.fromEntries(
      Object.entries(configHeaders).map(([key, value]) => [key.toLowerCase(), value]),
    );

    const nunjucks = getNunjucksEngine();

    const allHeaders = Object.fromEntries(
      Object.entries({ ...defaultHeaders, ...headers }).map(([key, value]) => [
        key,
        nunjucks.renderString(value, vars),
      ]),
    );

    // Add OAuth Bearer token if configured
    if (this.config.auth?.type === 'oauth' && this.lastToken) {
      allHeaders.authorization = `Bearer ${this.lastToken}`;
    }

    // Add Bearer token if configured
    if (this.config.auth?.type === 'bearer') {
      const renderedToken = getNunjucksEngine().renderString(this.config.auth.token, vars);
      allHeaders.authorization = `Bearer ${renderedToken}`;
    }

    // Add Basic Auth credentials if configured
    if (this.config.auth?.type === 'basic') {
      const renderedUsername = getNunjucksEngine().renderString(this.config.auth.username, vars);
      const renderedPassword = getNunjucksEngine().renderString(this.config.auth.password, vars);
      const credentials = Buffer.from(`${renderedUsername}:${renderedPassword}`).toString('base64');
      allHeaders.authorization = `Basic ${credentials}`;
    }

    // Add API Key to header if configured
    if (this.config.auth?.type === 'api_key' && this.config.auth.placement === 'header') {
      const renderedKeyName = getNunjucksEngine().renderString(this.config.auth.keyName, vars);
      const renderedValue = getNunjucksEngine().renderString(this.config.auth.value, vars);
      allHeaders[renderedKeyName.toLowerCase()] = renderedValue;
    }

    return allHeaders;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'http',
      operationName: 'chat',
      model: this.url,
      providerId: this.id(),
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
    };

    // Result extractor to set response attributes on the span
    const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
      const result: GenAISpanResult = {};
      if (response.tokenUsage) {
        result.tokenUsage = {
          prompt: response.tokenUsage.prompt,
          completion: response.tokenUsage.completion,
          total: response.tokenUsage.total,
        };
      }
      return result;
    };

    return withGenAISpan(
      spanContext,
      () => this.callApiInternal(prompt, context, options),
      resultExtractor,
    );
  }

  /**
   * Builds initial vars with tool transforms applied and tools/tool_choice serialized for templates.
   */
  private buildToolVars(prompt: string, context?: CallApiContextParams): Record<string, any> {
    const rawTools = context?.prompt?.config?.tools ?? this.config.tools;
    const rawToolChoice = context?.prompt?.config?.tool_choice ?? this.config.tool_choice;
    const format = this.config.transformToolsFormat as ToolFormat | undefined;

    const transformedTools = format ? transformTools(rawTools, format) : rawTools;
    const transformedToolChoice = format
      ? transformToolChoice(rawToolChoice, format)
      : rawToolChoice;

    if (
      transformedToolChoice &&
      (!transformedTools || (Array.isArray(transformedTools) && transformedTools.length === 0))
    ) {
      logger.warn(
        '[HTTP Provider]: tool_choice is set but tools is empty or undefined. This may cause API errors.',
      );
    }

    // Pre-serialize tools and tool_choice as JSON strings so templates can use
    // {{ tools }} and {{ tool_choice }} without the dump filter. processJsonBody
    // will parse JSON strings starting with { or [ back into objects/arrays.
    // String values (e.g. tool_choice: 'required') are passed through as-is.
    const serializeForTemplate = (value: unknown): unknown =>
      typeof value === 'object' && value !== null ? JSON.stringify(value) : value;

    return {
      ...(context?.vars || {}),
      prompt,
      ...(context?.evaluationId ? { evaluationId: context.evaluationId } : {}),
      ...(transformedTools !== undefined ? { tools: serializeForTemplate(transformedTools) } : {}),
      ...(transformedToolChoice !== undefined
        ? { tool_choice: serializeForTemplate(transformedToolChoice) }
        : {}),
    } as Record<string, any>;
  }

  /**
   * Applies signature auth values to vars, warning on overwrites.
   */
  private async applySignatureToVars(vars: Record<string, any>): Promise<void> {
    await this.refreshSignatureIfNeeded(vars);
    invariant(this.lastSignature, 'Signature should be defined at this point');
    invariant(this.lastSignatureTimestamp, 'Timestamp should be defined at this point');

    if (vars.signature) {
      logger.warn(
        '[HTTP Provider Auth]: `signature` is already defined in vars and will be overwritten',
      );
    }
    if (vars.signatureTimestamp) {
      logger.warn(
        '[HTTP Provider Auth]: `signatureTimestamp` is already defined in vars and will be overwritten',
      );
    }

    vars.signature = this.lastSignature;
    vars.signatureTimestamp = this.lastSignatureTimestamp;
  }

  /**
   * Builds query params object: renders config queryParams + injects api_key query param if needed.
   */
  private buildRenderedQueryParams(vars: Record<string, any>): Record<string, string> | undefined {
    const baseQueryParams = this.config.queryParams
      ? Object.fromEntries(
          Object.entries(this.config.queryParams).map(([key, value]) => [
            key,
            getNunjucksEngine().renderString(value, vars),
          ]),
        )
      : {};

    if (this.config.auth?.type === 'api_key' && this.config.auth.placement === 'query') {
      const renderedKeyName = getNunjucksEngine().renderString(this.config.auth.keyName, vars);
      const renderedValue = getNunjucksEngine().renderString(this.config.auth.value, vars);
      baseQueryParams[renderedKeyName] = renderedValue;
    }

    return Object.keys(baseQueryParams).length > 0 ? baseQueryParams : undefined;
  }

  /**
   * Appends query params to a URL string, falling back to string concatenation on parse failure.
   */
  private buildRenderedUrl(baseUrl: string, queryParams?: Record<string, string>): string {
    if (!queryParams) {
      return baseUrl;
    }
    try {
      const urlObj = new URL(baseUrl);
      Object.entries(queryParams).forEach(([key, value]) => {
        urlObj.searchParams.append(key, value);
      });
      return urlObj.toString();
    } catch (err) {
      logger.warn(`[HTTP Provider]: Failed to construct URL object: ${String(err)}`);
      const queryString = new URLSearchParams(queryParams).toString();
      return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${queryString}`;
    }
  }

  /**
   * Serializes the request body to string based on content type.
   */
  private serializeFetchBody(
    method: string,
    headers: Record<string, string>,
    body: unknown,
  ): string | undefined {
    if (method === 'GET' || body == null) {
      return undefined;
    }
    if (contentTypeIsJson(headers)) {
      return typeof body === 'string' ? body : JSON.stringify(body);
    }
    return typeof body === 'string' ? body.trim() : String(body);
  }

  /**
   * Executes fetchWithCache and validates the response status.
   */
  private async executeFetch(
    url: string,
    fetchOptions: any,
    context?: CallApiContextParams,
  ): Promise<{
    data: unknown;
    cached: boolean;
    status: number;
    statusText: string;
    responseHeaders: Record<string, string> | undefined;
    latencyMs: number | undefined;
  }> {
    const {
      data,
      cached,
      status,
      statusText,
      headers: responseHeaders,
      latencyMs,
    } = await fetchWithCache(
      url,
      fetchOptions,
      REQUEST_TIMEOUT_MS,
      'text',
      context?.bustCache ?? context?.debug,
      this.config.maxRetries,
    );

    if (!(await this.validateStatus)(status)) {
      throw new Error(`HTTP call failed with status ${status} ${statusText}: ${data}`);
    }

    logger.debug(`[HTTP Provider]: Response (HTTP ${status}) received`, {
      length: typeof data === 'string' ? data.length : undefined,
      cached,
    });

    return { data, cached, status, statusText, responseHeaders, latencyMs };
  }

  /**
   * Builds the initial ProviderResponse object with HTTP metadata.
   */
  private buildResponseMeta(
    data: unknown,
    cached: boolean,
    status: number,
    statusText: string,
    responseHeaders: Record<string, string> | undefined,
    latencyMs: number | undefined,
    renderedConfig: Partial<HttpProviderConfig>,
    transformedPrompt: unknown,
    context?: CallApiContextParams,
  ): ProviderResponse {
    const ret: ProviderResponse = {};
    ret.raw = data;
    ret.latencyMs = latencyMs;
    ret.cached = cached;
    ret.metadata = {
      http: {
        status,
        statusText,
        headers: sanitizeObject(responseHeaders, { context: 'response headers' }),
        ...(context?.debug && {
          requestHeaders: sanitizeObject(renderedConfig.headers, { context: 'request headers' }),
        }),
      },
    };
    if (context?.debug) {
      ret.metadata.transformedRequest = transformedPrompt;
      ret.metadata.finalRequestBody = renderedConfig.body;
    }
    return ret;
  }

  /**
   * Resolves session ID from sessionParser and sets it on the response object.
   */
  private async resolveSessionIdIntoRet(
    ret: ProviderResponse,
    vars: Record<string, any>,
    responseHeaders: Record<string, string> | undefined,
    parsedData: unknown,
    rawText: string,
  ): Promise<void> {
    if (vars.sessionId && this.config.session) {
      ret.sessionId = vars.sessionId;
    }

    try {
      const sessionId =
        this.sessionParser == null
          ? undefined
          : (await this.sessionParser)({ headers: responseHeaders, body: parsedData ?? rawText });
      if (sessionId) {
        ret.sessionId = sessionId;
      }
    } catch (err) {
      logger.error(
        `Error parsing session ID: ${String(err)}. Got headers: ${safeJsonStringify(sanitizeObject(responseHeaders, { context: 'response headers' }))} and parsed body: ${safeJsonStringify(sanitizeObject(parsedData, { context: 'response body' }))}`,
      );
      throw err;
    }
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const vars = this.buildToolVars(prompt, context);

    if (this.config.auth?.type === 'oauth') {
      await this.refreshOAuthTokenIfNeeded(vars);
      invariant(this.lastToken, 'OAuth token should be defined at this point');
    }

    if (this.config.signatureAuth) {
      await this.applySignatureToVars(vars);
    }

    if (this.config.session) {
      const resolvedSessionId = await this.resolveSessionId(vars);
      if (resolvedSessionId) {
        vars.sessionId = resolvedSessionId;
      }
    }

    if (this.config.request) {
      return this.callApiWithRawRequest(vars, context, options);
    }

    const defaultHeaders = this.getDefaultHeaders(this.config.body);
    const headers = await this.getHeaders(defaultHeaders, vars);

    if (context?.traceparent) {
      headers.traceparent = context.traceparent;
      logger.debug(`[HTTP Provider]: Adding traceparent header: ${context.traceparent}`);
    }
    if (context?.tracestate) {
      headers.tracestate = context.tracestate;
    }

    this.validateContentTypeAndBody(headers, this.config.body);

    // Transform prompt using request transform
    const transformedPrompt = await (await this.transformRequest)(prompt, vars, context);
    logger.debug(
      `[HTTP Provider]: Transformed prompt: ${safeJsonStringify(transformedPrompt)}. Original prompt: ${safeJsonStringify(prompt)}`,
    );

    const renderedConfig: Partial<HttpProviderConfig> = {
      url: getNunjucksEngine().renderString(this.url, vars),
      method: getNunjucksEngine().renderString(this.config.method || 'GET', vars),
      headers,
      body: determineRequestBody(
        contentTypeIsJson(headers),
        transformedPrompt,
        this.config.body,
        vars,
      ),
      queryParams: this.buildRenderedQueryParams(vars),
      transformResponse: this.config.transformResponse || this.config.responseParser,
    };

    const method = renderedConfig.method || 'POST';
    invariant(typeof method === 'string', 'Expected method to be a string');
    invariant(typeof headers === 'object', 'Expected headers to be an object');

    const url = this.buildRenderedUrl(renderedConfig.url as string, renderedConfig.queryParams);

    logger.debug(`[HTTP Provider]: Calling ${sanitizeUrl(url)} with config.`, {
      config: renderedConfig,
    });

    const httpsAgent = await this.getHttpsAgent();
    const fetchOptions: any = {
      method: renderedConfig.method,
      headers: renderedConfig.headers,
      ...(options?.abortSignal && { signal: options.abortSignal }),
    };
    const serializedBody = this.serializeFetchBody(method, headers, renderedConfig.body);
    if (serializedBody !== undefined) {
      fetchOptions.body = serializedBody;
    }
    if (httpsAgent) {
      fetchOptions.dispatcher = httpsAgent;
      logger.debug('[HTTP Provider]: Using custom HTTPS agent for TLS connection');
    }

    const { data, cached, status, statusText, responseHeaders, latencyMs } =
      await this.executeFetch(url, fetchOptions, context);

    const ret = this.buildResponseMeta(
      data,
      cached,
      status,
      statusText,
      responseHeaders,
      latencyMs,
      renderedConfig,
      transformedPrompt,
      context,
    );

    const rawText = data as string;
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }

    await this.resolveSessionIdIntoRet(ret, vars, responseHeaders, parsedData, rawText);

    const parsedOutput = (await this.transformResponse)(parsedData, rawText, {
      response: { data, status, statusText, headers: responseHeaders, cached, latencyMs },
    });

    return this.processResponseWithTokenEstimation(
      ret,
      parsedOutput,
      rawText,
      transformedPrompt,
      prompt,
    );
  }

  /**
   * Applies W3C Trace Context headers to a raw request's headers object.
   */
  private applyTraceContextToRawRequest(
    parsedRequest: { headers: Record<string, string> },
    context?: CallApiContextParams,
  ): void {
    if (context?.traceparent) {
      parsedRequest.headers.traceparent = context.traceparent;
      logger.debug(`[HTTP Provider]: Adding traceparent header: ${context.traceparent}`);
    }
    if (context?.tracestate) {
      parsedRequest.headers.tracestate = context.tracestate;
    }
  }

  /**
   * Applies OAuth, Bearer, Basic, and api_key header auth to a raw request's headers.
   */
  private applyAuthHeadersToRawRequest(
    parsedRequest: { headers: Record<string, string> },
    vars: Record<string, any>,
  ): void {
    if (this.config.auth?.type === 'oauth' && this.lastToken) {
      parsedRequest.headers.authorization = `Bearer ${this.lastToken}`;
    }
    if (this.config.auth?.type === 'bearer') {
      const renderedToken = getNunjucksEngine().renderString(this.config.auth.token, vars);
      parsedRequest.headers.authorization = `Bearer ${renderedToken}`;
    }
    if (this.config.auth?.type === 'basic') {
      const renderedUsername = getNunjucksEngine().renderString(this.config.auth.username, vars);
      const renderedPassword = getNunjucksEngine().renderString(this.config.auth.password, vars);
      const credentials = Buffer.from(`${renderedUsername}:${renderedPassword}`).toString('base64');
      parsedRequest.headers.authorization = `Basic ${credentials}`;
    }
    if (this.config.auth?.type === 'api_key' && this.config.auth.placement === 'header') {
      const renderedKeyName = getNunjucksEngine().renderString(this.config.auth.keyName, vars);
      const renderedValue = getNunjucksEngine().renderString(this.config.auth.value, vars);
      parsedRequest.headers[renderedKeyName.toLowerCase()] = renderedValue;
    }
  }

  /**
   * Appends an api_key query param to the URL and updates parsedRequest to match.
   * Returns the updated URL string.
   */
  private applyApiKeyQueryParamToRawRequest(
    url: string,
    renderedRequest: string,
    parsedRequest: ReturnType<typeof parseRawRequest>,
    vars: Record<string, any>,
  ): string {
    if (this.config.auth?.type !== 'api_key' || this.config.auth.placement !== 'query') {
      return url;
    }
    try {
      const renderedKeyName = getNunjucksEngine().renderString(this.config.auth.keyName, vars);
      const renderedValue = getNunjucksEngine().renderString(this.config.auth.value, vars);
      const urlObj = new URL(url);
      urlObj.searchParams.append(renderedKeyName, renderedValue);
      const newUrl = urlObj.toString();
      const urlPath = urlObj.pathname + urlObj.search;
      const requestLines = renderedRequest.split('\n');
      const firstLine = requestLines[0];
      const method = firstLine.split(' ')[0];
      const lineProtocol = firstLine.split(' ').slice(-1)[0];
      requestLines[0] = `${method} ${urlPath} ${lineProtocol}`;
      const reParsed = parseRawRequest(requestLines.join('\n').trim());
      Object.assign(parsedRequest, reParsed);
      return newUrl;
    } catch (err) {
      logger.warn(
        `[HTTP Provider]: Failed to add API key to query params in raw request: ${String(err)}`,
      );
      return url;
    }
  }

  /**
   * Populates debug metadata on ret for raw request mode.
   */
  private applyRawDebugMetadata(
    ret: ProviderResponse,
    data: unknown,
    status: number,
    statusText: string,
    responseHeaders: Record<string, string> | undefined,
    parsedRequest: ReturnType<typeof parseRawRequest>,
    renderedRequest: string,
    transformedPrompt: unknown,
  ): void {
    ret.raw = data;
    ret.metadata = {
      headers: sanitizeObject(responseHeaders, { context: 'response headers' }),
      // If no transform was applied, show the final raw request body with nunjucks applied
      // Otherwise show the transformed prompt
      transformedRequest: this.config.transformRequest
        ? transformedPrompt
        : parsedRequest.body?.text || renderedRequest.trim(),
      finalRequestBody: parsedRequest.body?.text,
      http: {
        status,
        statusText,
        headers: sanitizeObject(responseHeaders, { context: 'response headers' }),
        requestHeaders: sanitizeObject(parsedRequest.headers, { context: 'request headers' }),
      },
    };
  }

  private async callApiWithRawRequest(
    vars: Record<string, any>,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(this.config.request, 'Expected request to be set in http provider config');

    const prompt = vars.prompt;
    const transformFn = await this.transformRequest;
    const transformedPrompt = await transformFn(prompt, vars, context);
    logger.debug(
      `[HTTP Provider]: Transformed prompt: ${safeJsonStringify(transformedPrompt)}. Original prompt: ${safeJsonStringify(prompt)}`,
    );

    // JSON-escape all string variables for safe substitution in raw request body
    const escapedVars = escapeJsonVariables({ ...vars, prompt: transformedPrompt });
    const renderedRequest = renderRawRequestWithNunjucks(this.config.request, escapedVars);
    const parsedRequest = parseRawRequest(renderedRequest.trim());

    const protocol = this.url.startsWith('https') || this.config.useHttps ? 'https' : 'http';
    let url = new URL(
      parsedRequest.url,
      `${protocol}://${parsedRequest.headers['host']}`,
    ).toString();

    // Remove content-length header (fetch will add the correct value)
    delete parsedRequest.headers['content-length'];

    this.applyTraceContextToRawRequest(parsedRequest, context);
    this.applyAuthHeadersToRawRequest(parsedRequest, vars);
    url = this.applyApiKeyQueryParamToRawRequest(url, renderedRequest, parsedRequest, vars);

    logger.debug(
      `[HTTP Provider]: Calling ${sanitizeUrl(url)} with raw request: ${parsedRequest.method}`,
      { request: parsedRequest },
    );

    const httpsAgent = await this.getHttpsAgent();

    // Determine body content for the fetch call
    let bodyContent: string | undefined;
    if (parsedRequest.body?.text) {
      bodyContent = parsedRequest.body.text.trim();
    } else if (parsedRequest.body?.params) {
      bodyContent = extractBodyFromRawRequest(renderedRequest);
    }

    const fetchOptions: any = {
      method: parsedRequest.method,
      headers: parsedRequest.headers,
      ...(options?.abortSignal && { signal: options.abortSignal }),
      ...(bodyContent && { body: bodyContent }),
    };
    if (httpsAgent) {
      fetchOptions.dispatcher = httpsAgent;
      logger.debug('[HTTP Provider]: Using custom HTTPS agent for TLS connection');
    }

    const { data, cached, status, statusText, responseHeaders, latencyMs } =
      await this.executeFetch(url, fetchOptions, context);

    logger.debug('[HTTP Provider]: Response received', {
      length: typeof data === 'string' ? data.length : undefined,
      cached,
    });

    const rawText = data as string;
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }

    const ret: ProviderResponse = {};
    ret.latencyMs = latencyMs;
    ret.cached = cached;

    await this.resolveSessionIdIntoRet(ret, vars, responseHeaders, parsedData, rawText);

    if (context?.debug) {
      this.applyRawDebugMetadata(
        ret,
        data,
        status,
        statusText,
        responseHeaders,
        parsedRequest,
        renderedRequest,
        transformedPrompt,
      );
    }

    const parsedOutput = (await this.transformResponse)(parsedData, rawText, {
      response: { data, status, statusText, headers: responseHeaders, cached, latencyMs },
    });

    return this.processResponseWithTokenEstimation(
      ret,
      parsedOutput,
      rawText,
      transformedPrompt,
      prompt,
    );
  }

  /**
   * Extracts completion text from parsed output with fallback to raw text
   */
  private getCompletionText(parsedOutput: any, rawText: string): string {
    if (typeof parsedOutput === 'string') {
      return parsedOutput;
    }
    if (parsedOutput?.output && typeof parsedOutput.output === 'string') {
      return parsedOutput.output;
    }
    return rawText;
  }

  /**
   * Processes response and adds token estimation if enabled
   */
  private async processResponseWithTokenEstimation(
    ret: ProviderResponse,
    parsedOutput: any,
    rawText: string,
    transformedPrompt: any,
    prompt: string,
  ): Promise<ProviderResponse> {
    // Estimate tokens if enabled
    let estimatedTokenUsage: Partial<TokenUsage> | undefined;
    if (this.config.tokenEstimation?.enabled) {
      const promptText = typeof transformedPrompt === 'string' ? transformedPrompt : prompt;
      const completionText = this.getCompletionText(parsedOutput, rawText);
      estimatedTokenUsage = await this.estimateTokenUsage(promptText, completionText);
    }

    if (parsedOutput?.output) {
      const result = {
        ...ret,
        ...parsedOutput,
      };
      // Add estimated token usage if available and not already present
      if (!result.tokenUsage) {
        if (estimatedTokenUsage) {
          result.tokenUsage = estimatedTokenUsage;
        } else {
          result.tokenUsage = { ...createEmptyTokenUsage(), numRequests: 1 };
        }
      }
      return result;
    }

    const result = {
      ...ret,
      output: parsedOutput,
    };
    // Add estimated token usage if available
    if (!result.tokenUsage) {
      if (estimatedTokenUsage) {
        result.tokenUsage = estimatedTokenUsage;
      } else {
        result.tokenUsage = { ...createEmptyTokenUsage(), numRequests: 1 };
      }
    }
    return result;
  }
}
