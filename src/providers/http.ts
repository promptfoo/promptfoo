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

  // If generic certificate fields are present, map them to type-specific fields
  const { certificateContent, certificatePassword, certificateFilename, type, ...rest } =
    signatureAuth;

  let detectedType = type;
  if (!detectedType) {
    // Try to detect from certificateFilename first
    if (certificateFilename) {
      const ext = certificateFilename.toLowerCase();
      if (ext.endsWith('.pfx') || ext.endsWith('.p12')) {
        detectedType = 'pfx';
      } else if (ext.endsWith('.jks')) {
        detectedType = 'jks';
      } else if (ext.endsWith('.pem') || ext.endsWith('.key')) {
        detectedType = 'pem';
      }
    }

    // If still no type, try to detect from legacy fields
    if (!detectedType) {
      if (signatureAuth.privateKeyPath || signatureAuth.privateKey) {
        detectedType = 'pem';
      } else if (signatureAuth.keystorePath || signatureAuth.keystoreContent) {
        detectedType = 'jks';
      } else if (
        signatureAuth.pfxPath ||
        signatureAuth.pfxContent ||
        (signatureAuth.certPath && signatureAuth.keyPath)
      ) {
        detectedType = 'pfx';
      }
    }
  }

  // Check if we have any generic fields to process
  const hasGenericFields = certificateContent || certificatePassword || certificateFilename;

  // If no generic fields and no type needs to be detected, return as-is
  if (!hasGenericFields && !detectedType) {
    return signatureAuth;
  }

  const processedAuth = { ...rest };

  // Always preserve the type if it was detected or provided
  if (detectedType) {
    processedAuth.type = detectedType;
  }

  // Only process if we have a determined type or generic fields
  if (detectedType) {
    switch (detectedType) {
      case 'pfx':
        if (certificateContent && !processedAuth.pfxContent) {
          processedAuth.pfxContent = certificateContent;
        }
        if (certificatePassword && !processedAuth.pfxPassword) {
          processedAuth.pfxPassword = certificatePassword;
        }
        if (certificateFilename && !processedAuth.pfxPath) {
          // Store filename for reference, though content takes precedence
          processedAuth.certificateFilename = certificateFilename;
        }
        break;

      case 'jks':
        // Map generic fields to JKS-specific fields
        if (certificateContent && !processedAuth.keystoreContent) {
          processedAuth.keystoreContent = certificateContent;
        }
        if (certificatePassword && !processedAuth.keystorePassword) {
          processedAuth.keystorePassword = certificatePassword;
        }
        if (certificateFilename && !processedAuth.keystorePath) {
          processedAuth.certificateFilename = certificateFilename;
        }
        break;

      case 'pem':
        // Map generic fields to PEM-specific fields
        if (certificateContent && !processedAuth.privateKey) {
          // For PEM, the certificate content is the private key
          processedAuth.privateKey = Buffer.from(certificateContent, 'base64').toString('utf8');
        }
        // PEM doesn't typically have a password, but store it if provided
        if (certificatePassword) {
          processedAuth.certificatePassword = certificatePassword;
        }
        if (certificateFilename) {
          processedAuth.certificateFilename = certificateFilename;
        }
        break;

      default:
        // Unknown type - this is an error if we have generic fields that need mapping
        if (hasGenericFields) {
          throw new Error(`[Http Provider] Unknown certificate type: ${detectedType}`);
        }
        // Even without generic fields, an unknown type is invalid
        throw new Error(`[Http Provider] Unknown certificate type: ${detectedType}`);
    }
  } else if (hasGenericFields) {
    // We have generic fields but couldn't determine the type
    throw new Error(
      `[Http Provider] Cannot determine certificate type from filename: ${certificateFilename || 'no filename provided'}`,
    );
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
 * Generate signature using different certificate types
 */
export async function generateSignature(
  signatureAuth: any,
  signatureTimestamp: number,
): Promise<string> {
  try {
    let privateKey: string;

    // For backward compatibility, detect type from legacy fields if not explicitly set
    let authType = signatureAuth.type;
    if (!authType) {
      if (signatureAuth.privateKeyPath || signatureAuth.privateKey) {
        authType = 'pem';
      } else if (signatureAuth.keystorePath || signatureAuth.keystoreContent) {
        authType = 'jks';
      } else if (
        signatureAuth.pfxPath ||
        signatureAuth.pfxContent ||
        (signatureAuth.certPath && signatureAuth.keyPath)
      ) {
        authType = 'pfx';
      }
    }
    switch (authType) {
      case 'pem': {
        if (signatureAuth.privateKeyPath) {
          const resolvedPath = safeResolve(cliState.basePath || '', signatureAuth.privateKeyPath);
          privateKey = fs.readFileSync(resolvedPath, 'utf8');
        } else if (signatureAuth.privateKey) {
          privateKey = signatureAuth.privateKey;
        } else if (signatureAuth.certificateContent) {
          logger.debug(`[Signature Auth] Loading PEM from remote certificate content`);
          privateKey = Buffer.from(signatureAuth.certificateContent, 'base64').toString('utf8');
        } else {
          throw new Error(
            'PEM private key is required. Provide privateKey, privateKeyPath, or certificateContent',
          );
        }
        break;
      }
      case 'jks': {
        // Check for keystore password in config first, then fallback to environment variable
        const keystorePassword =
          signatureAuth.keystorePassword ||
          signatureAuth.certificatePassword ||
          getEnvString('PROMPTFOO_JKS_PASSWORD');

        if (!keystorePassword) {
          throw new Error(
            'JKS keystore password is required. Provide it via config keystorePassword/certificatePassword or PROMPTFOO_JKS_PASSWORD environment variable',
          );
        }

        // Use eval to avoid TypeScript static analysis of the dynamic import
        const jksModule = await import('jks-js').catch(() => {
          throw new Error(
            'JKS certificate support requires the "jks-js" package. Install it with: npm install jks-js',
          );
        });

        const jks = jksModule as any;
        let keystoreData: Buffer;

        if (signatureAuth.keystoreContent || signatureAuth.certificateContent) {
          // Use base64 encoded content from database
          const content = signatureAuth.keystoreContent || signatureAuth.certificateContent;
          logger.debug(`[Signature Auth] Loading JKS from base64 content`);
          keystoreData = Buffer.from(content, 'base64');
        } else if (signatureAuth.keystorePath) {
          // Use file path (existing behavior)
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

        privateKey = entry.key;
        break;
      }
      case 'pfx': {
        // Check for PFX-specific fields first, then fallback to generic fields
        const hasPfxContent = signatureAuth.pfxContent || signatureAuth.certificateContent;
        const hasPfxPath = signatureAuth.pfxPath;
        const hasCertAndKey =
          (signatureAuth.certPath && signatureAuth.keyPath) ||
          (signatureAuth.certContent && signatureAuth.keyContent);

        // Add detailed, safe debug logging for PFX configuration sources
        logger.debug(
          `[Signature Auth][PFX] Source detection: hasPfxContent=${Boolean(hasPfxContent)}, hasPfxPath=${Boolean(
            hasPfxPath,
          )}, hasCertAndKey=${Boolean(hasCertAndKey)}; filename=${
            signatureAuth.certificateFilename || signatureAuth.pfxPath || 'n/a'
          }`,
        );

        if (hasPfxPath || hasPfxContent) {
          // Check for PFX password in config first, then fallback to environment variable
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
            // Use eval to avoid TypeScript static analysis of the dynamic import
            const pemModule = await import('pem').catch(() => {
              throw new Error(
                'PFX certificate support requires the "pem" package. Install it with: npm install pem',
              );
            });

            const pem = pemModule.default as any;

            let result: { key: string; cert: string };

            if (signatureAuth.pfxContent || signatureAuth.certificateContent) {
              // Use base64 encoded content from database
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
              // Use file path (existing behavior)
              const resolvedPath = safeResolve(cliState.basePath || '', signatureAuth.pfxPath);
              logger.debug(`[Signature Auth] Loading PFX file: ${resolvedPath}`);
              try {
                const stat = await fs.promises.stat(resolvedPath);
                logger.debug(`[Signature Auth][PFX] PFX file size: ${stat.size} bytes`);
              } catch (e) {
                logger.debug(`[Signature Auth][PFX] Could not stat PFX file: ${String(e)}`);
              }

              result = await new Promise<{ key: string; cert: string }>((resolve, reject) => {
                pem.readPkcs12(
                  resolvedPath,
                  { p12Password: pfxPassword },
                  (err: any, data: any) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve(data);
                    }
                  },
                );
              });
            }

            if (!result.key) {
              logger.error('[Signature Auth][PFX] No private key extracted from PFX');
              throw new Error('No private key found in PFX file');
            }

            privateKey = result.key;
            logger.debug(
              `[Signature Auth] Successfully extracted private key from PFX using pem library`,
            );
          } catch (err) {
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
            throw new Error(
              `Failed to load PFX certificate. Make sure the ${signatureAuth.pfxContent || signatureAuth.certificateContent ? 'content is valid' : 'file exists'} and the password is correct: ${String(err)}`,
            );
          }
        } else if (hasCertAndKey) {
          try {
            if (signatureAuth.keyContent) {
              // Use base64 encoded content from database
              logger.debug(`[Signature Auth] Loading private key from base64 content`);
              privateKey = Buffer.from(signatureAuth.keyContent, 'base64').toString('utf8');
              logger.debug(
                `[Signature Auth][PFX] Decoded keyContent length: ${privateKey.length} characters`,
              );
            } else {
              // Use file paths (existing behavior)
              const resolvedCertPath = safeResolve(cliState.basePath || '', signatureAuth.certPath);
              const resolvedKeyPath = safeResolve(cliState.basePath || '', signatureAuth.keyPath);
              logger.debug(
                `[Signature Auth] Loading separate CRT and KEY files: ${resolvedCertPath}, ${resolvedKeyPath}`,
              );

              // Read the private key directly from the key file
              if (!fs.existsSync(resolvedKeyPath)) {
                throw new Error(`Key file not found: ${resolvedKeyPath}`);
              }
              if (!fs.existsSync(resolvedCertPath)) {
                throw new Error(`Certificate file not found: ${resolvedCertPath}`);
              }

              privateKey = fs.readFileSync(resolvedKeyPath, 'utf8');
              logger.debug(
                `[Signature Auth][PFX] Loaded key file characters: ${privateKey.length}`,
              );
            }
            logger.debug(`[Signature Auth] Successfully loaded private key from separate key file`);
          } catch (err) {
            logger.error(`Error loading certificate/key files: ${String(err)}`);
            throw new Error(
              `Failed to load certificate/key files. Make sure both files exist and are readable: ${String(err)}`,
            );
          }
        } else {
          throw new Error(
            'PFX type requires either pfxPath, pfxContent, both certPath and keyPath, or both certContent and keyContent',
          );
        }
        break;
      }
      default:
        throw new Error(`Unsupported signature auth type: ${signatureAuth.type}`);
    }

    const data = getNunjucksEngine()
      .renderString(signatureAuth.signatureDataTemplate, {
        signatureTimestamp,
      })
      .replace(/\\n/g, '\n');

    // Pre-sign validation logging
    logger.debug(
      `[Signature Auth] Preparing to sign with algorithm=${signatureAuth.signatureAlgorithm}, dataLength=${data.length}, keyProvided=${Boolean(
        privateKey,
      )}`,
    );

    const sign = crypto.createSign(signatureAuth.signatureAlgorithm);
    sign.update(data);
    sign.end();
    try {
      const signature = sign.sign(privateKey);
      return signature.toString('base64');
    } catch (e) {
      logger.error(
        `[Signature Auth] Signing failed: ${String(e)}; keyLength=${privateKey?.length || 0}, algorithm=${signatureAuth.signatureAlgorithm}`,
      );
      throw e;
    }
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
      const jksModule = await import('jks-js').catch(() => {
        throw new Error(
          'JKS certificate support requires the "jks-js" package. Install it with: npm install jks-js',
        );
      });
      const jks = jksModule as any;

      let keystoreData: Buffer;
      const keystorePassword =
        (tlsConfig as any).keystorePassword ||
        tlsConfig.passphrase ||
        getEnvString('PROMPTFOO_JKS_PASSWORD');

      if (!keystorePassword) {
        throw new Error(
          'JKS keystore password is required for TLS. Provide it via passphrase or PROMPTFOO_JKS_PASSWORD environment variable',
        );
      }

      if ((tlsConfig as any).jksContent) {
        // Use base64 encoded content
        logger.debug(`[HTTP Provider] Loading JKS from base64 content for TLS`);
        keystoreData = Buffer.from((tlsConfig as any).jksContent, 'base64');
      } else if ((tlsConfig as any).jksPath) {
        // Use file path
        const resolvedPath = safeResolve(cliState.basePath || '', (tlsConfig as any).jksPath);
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

      const targetAlias = (tlsConfig as any).keyAlias || aliases[0];
      const entry = keystore[targetAlias];

      if (!entry) {
        throw new Error(
          `Alias '${targetAlias}' not found in JKS file. Available aliases: ${aliases.join(', ')}`,
        );
      }

      // Extract certificate and key from JKS entry
      if (entry.cert) {
        tlsOptions.cert = entry.cert;
        logger.debug(
          `[HTTP Provider] Extracted certificate from JKS for TLS (alias: ${targetAlias})`,
        );
      }

      if (entry.key) {
        tlsOptions.key = entry.key;
        logger.debug(
          `[HTTP Provider] Extracted private key from JKS for TLS (alias: ${targetAlias})`,
        );
      }

      if (!tlsOptions.cert || !tlsOptions.key) {
        throw new Error('Failed to extract both certificate and key from JKS file');
      }
    } catch (err) {
      logger.error(`[HTTP Provider] Failed to load JKS certificate for TLS: ${String(err)}`);
      throw new Error(`Failed to load JKS certificate: ${String(err)}`);
    }
  } else {
    // Load client certificate (non-JKS)
    if (tlsConfig.cert) {
      tlsOptions.cert = tlsConfig.cert;
    } else if (tlsConfig.certPath) {
      const resolvedPath = safeResolve(cliState.basePath || '', tlsConfig.certPath);
      tlsOptions.cert = fs.readFileSync(resolvedPath, 'utf8');
      logger.debug(`[HTTP Provider] Loaded client certificate from ${resolvedPath}`);
    }

    // Load private key (non-JKS)
    if (tlsConfig.key) {
      tlsOptions.key = tlsConfig.key;
    } else if (tlsConfig.keyPath) {
      const resolvedPath = safeResolve(cliState.basePath || '', tlsConfig.keyPath);
      tlsOptions.key = fs.readFileSync(resolvedPath, 'utf8');
      logger.debug(`[HTTP Provider] Loaded private key from ${resolvedPath}`);
    }
  }

  // Load PFX certificate
  if (tlsConfig.pfx) {
    // Handle inline PFX content
    if (typeof tlsConfig.pfx === 'string') {
      // Check if it's base64-encoded (common for embedding binary data in config files)
      if (isBase64(tlsConfig.pfx)) {
        tlsOptions.pfx = Buffer.from(tlsConfig.pfx, 'base64');
        logger.debug(`[HTTP Provider] Using base64-encoded inline PFX certificate`);
      } else {
        // Assume it's already in the correct format
        tlsOptions.pfx = tlsConfig.pfx;
        logger.debug(`[HTTP Provider] Using inline PFX certificate`);
      }
    } else {
      // It's already a Buffer
      tlsOptions.pfx = tlsConfig.pfx;
      logger.debug(`[HTTP Provider] Using inline PFX certificate buffer`);
    }
  } else if (tlsConfig.pfxPath) {
    const resolvedPath = safeResolve(cliState.basePath || '', tlsConfig.pfxPath);
    tlsOptions.pfx = fs.readFileSync(resolvedPath);
    logger.debug(`[HTTP Provider] Loaded PFX certificate from ${resolvedPath}`);
  }

  // Set passphrase if provided
  if (tlsConfig.passphrase) {
    tlsOptions.passphrase = tlsConfig.passphrase;
  }

  // Set security options
  tlsOptions.rejectUnauthorized = tlsConfig.rejectUnauthorized !== false;

  if (tlsConfig.servername) {
    tlsOptions.servername = tlsConfig.servername;
  }

  // Set cipher configuration
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

  logger.debug(`[HTTP Provider] Creating HTTPS agent with TLS configuration`);

  // Create an undici Agent with the TLS options
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

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Use test-scoped logger if available, fallback to global logger
    const log = context?.logger ?? logger;

    // Transform tools and tool_choice if transformToolsFormat is specified
    // Merge prompt.config with this.config (prompt.config takes precedence)
    const rawTools = context?.prompt?.config?.tools ?? this.config.tools;
    const rawToolChoice = context?.prompt?.config?.tool_choice ?? this.config.tool_choice;
    const format = this.config.transformToolsFormat as ToolFormat | undefined;

    const transformedTools = format ? transformTools(rawTools, format) : rawTools;
    const transformedToolChoice = format
      ? transformToolChoice(rawToolChoice, format)
      : rawToolChoice;

    // Warn if tool_choice is set but tools is empty or undefined
    if (
      transformedToolChoice &&
      (!transformedTools || (Array.isArray(transformedTools) && transformedTools.length === 0))
    ) {
      log.warn(
        '[HTTP Provider]: tool_choice is set but tools is empty or undefined. This may cause API errors.',
      );
    }

    // Pre-serialize tools and tool_choice as JSON strings so templates can use
    // {{ tools }} and {{ tool_choice }} without the dump filter. processJsonBody
    // will parse JSON strings starting with { or [ back into objects/arrays.
    // String values (e.g. tool_choice: 'required') are passed through as-is.
    const serializeForTemplate = (value: unknown): unknown =>
      typeof value === 'object' && value !== null ? JSON.stringify(value) : value;

    const vars = {
      ...(context?.vars || {}),
      prompt,
      // Only set tools/tool_choice if defined in config, to avoid overwriting user vars
      ...(transformedTools !== undefined ? { tools: serializeForTemplate(transformedTools) } : {}),
      ...(transformedToolChoice !== undefined
        ? { tool_choice: serializeForTemplate(transformedToolChoice) }
        : {}),
    } as Record<string, any>;
    log.error(`[HTTP Provider]: callApi invoked`);

    if (this.config.auth?.type === 'oauth') {
      await this.refreshOAuthTokenIfNeeded(vars);
      invariant(this.lastToken, 'OAuth token should be defined at this point');
    }

    // Add signature values to vars if signature auth is enabled
    if (this.config.signatureAuth) {
      await this.refreshSignatureIfNeeded(vars);
      invariant(this.lastSignature, 'Signature should be defined at this point');
      invariant(this.lastSignatureTimestamp, 'Timestamp should be defined at this point');

      if (vars.signature) {
        log.warn(
          '[HTTP Provider Auth]: `signature` is already defined in vars and will be overwritten',
        );
      }
      if (vars.signatureTimestamp) {
        log.warn(
          '[HTTP Provider Auth]: `signatureTimestamp` is already defined in vars and will be overwritten',
        );
      }

      vars.signature = this.lastSignature;
      vars.signatureTimestamp = this.lastSignatureTimestamp;
    }

    // Resolve session ID from session endpoint if configured
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

    // Add W3C Trace Context headers if provided
    if (context?.traceparent) {
      headers.traceparent = context.traceparent;
      log.debug(`[HTTP Provider]: Adding traceparent header: ${context.traceparent}`);
    }
    if (context?.tracestate) {
      headers.tracestate = context.tracestate;
    }

    this.validateContentTypeAndBody(headers, this.config.body);

    // Transform prompt using request transform
    const transformedPrompt = await (await this.transformRequest)(prompt, vars, context);
    log.debug(
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
      queryParams: (() => {
        const baseQueryParams = this.config.queryParams
          ? Object.fromEntries(
              Object.entries(this.config.queryParams).map(([key, value]) => [
                key,
                getNunjucksEngine().renderString(value, vars),
              ]),
            )
          : {};

        // Add API Key to query params if configured
        if (this.config.auth?.type === 'api_key' && this.config.auth.placement === 'query') {
          const renderedKeyName = getNunjucksEngine().renderString(this.config.auth.keyName, vars);
          const renderedValue = getNunjucksEngine().renderString(this.config.auth.value, vars);
          baseQueryParams[renderedKeyName] = renderedValue;
        }

        return Object.keys(baseQueryParams).length > 0 ? baseQueryParams : undefined;
      })(),
      transformResponse: this.config.transformResponse || this.config.responseParser,
    };

    const method = renderedConfig.method || 'POST';

    invariant(typeof method === 'string', 'Expected method to be a string');
    invariant(typeof headers === 'object', 'Expected headers to be an object');

    // Template the base URL first, then construct URL with query parameters
    let url = renderedConfig.url as string;
    if (renderedConfig.queryParams) {
      try {
        const urlObj = new URL(url);
        // Add each query parameter to the URL object
        Object.entries(renderedConfig.queryParams).forEach(([key, value]) => {
          urlObj.searchParams.append(key, value);
        });
        url = urlObj.toString();
      } catch (err) {
        // Fallback for potentially malformed URLs
        log.warn(`[HTTP Provider]: Failed to construct URL object: ${String(err)}`);
        const queryString = new URLSearchParams(renderedConfig.queryParams).toString();
        url = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
      }
    }

    log.debug(`[HTTP Provider]: Calling ${sanitizeUrl(url)} with config.`, {
      config: renderedConfig,
    });

    // Prepare fetch options with dispatcher if HTTPS agent is configured
    const httpsAgent = await this.getHttpsAgent();
    const fetchOptions: any = {
      method: renderedConfig.method,
      headers: renderedConfig.headers,
      ...(options?.abortSignal && { signal: options.abortSignal }),
      ...(method !== 'GET' &&
        renderedConfig.body != null && {
          body: contentTypeIsJson(headers)
            ? typeof renderedConfig.body === 'string'
              ? renderedConfig.body // Already a JSON string, use as-is
              : JSON.stringify(renderedConfig.body) // Object, needs stringifying
            : typeof renderedConfig.body === 'string'
              ? renderedConfig.body.trim()
              : String(renderedConfig.body),
        }),
    };

    // Add HTTPS agent as dispatcher if configured
    if (httpsAgent) {
      fetchOptions.dispatcher = httpsAgent;
      log.debug('[HTTP Provider]: Using custom HTTPS agent for TLS connection');
    }

    let data,
      cached = false,
      status,
      statusText,
      responseHeaders,
      latencyMs: number | undefined;
    try {
      ({
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
      ));
    } catch (err) {
      throw err;
    }

    if (!(await this.validateStatus)(status)) {
      throw new Error(`HTTP call failed with status ${status} ${statusText}: ${data}`);
    }
    log.debug(`[HTTP Provider]: Response (HTTP ${status}) received`, {
      length: typeof data === 'string' ? data.length : undefined,
      cached,
    });

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

    const rawText = data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }

    // If we used a session endpoint, set the sessionId we used
    // This can be overridden by sessionParser if the server returns a different session
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
      log.error(
        `Error parsing session ID: ${String(err)}. Got headers: ${safeJsonStringify(sanitizeObject(responseHeaders, { context: 'response headers' }))} and parsed body: ${safeJsonStringify(sanitizeObject(parsedData, { context: 'response body' }))}`,
      );
      throw err;
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

  private async callApiWithRawRequest(
    vars: Record<string, any>,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Use test-scoped logger if available, fallback to global logger
    const log = context?.logger ?? logger;

    invariant(this.config.request, 'Expected request to be set in http provider config');

    // Transform prompt using request transform
    const prompt = vars.prompt;
    const transformFn = await this.transformRequest;
    const transformedPrompt = await transformFn(prompt, vars, context);
    log.debug(
      `[HTTP Provider]: Transformed prompt: ${safeJsonStringify(transformedPrompt)}. Original prompt: ${safeJsonStringify(prompt)}`,
    );

    // JSON-escape all string variables for safe substitution in raw request body
    // This prevents control characters and quotes from breaking JSON strings
    const escapedVars = escapeJsonVariables({
      ...vars,
      prompt: transformedPrompt,
    });

    const renderedRequest = renderRawRequestWithNunjucks(this.config.request, escapedVars);
    const parsedRequest = parseRawRequest(renderedRequest.trim());

    const protocol = this.url.startsWith('https') || this.config.useHttps ? 'https' : 'http';
    let url = new URL(
      parsedRequest.url,
      `${protocol}://${parsedRequest.headers['host']}`,
    ).toString();

    // Remove content-length header from raw request if the user added it, it will be added by fetch with the correct value
    delete parsedRequest.headers['content-length'];

    // Add W3C Trace Context headers if provided
    if (context?.traceparent) {
      parsedRequest.headers.traceparent = context.traceparent;
      log.debug(`[HTTP Provider]: Adding traceparent header: ${context.traceparent}`);
    }
    if (context?.tracestate) {
      parsedRequest.headers.tracestate = context.tracestate;
    }

    // Add OAuth Bearer token if configured
    if (this.config.auth?.type === 'oauth' && this.lastToken) {
      parsedRequest.headers.authorization = `Bearer ${this.lastToken}`;
    }

    // Add Bearer token if configured
    if (this.config.auth?.type === 'bearer') {
      const renderedToken = getNunjucksEngine().renderString(this.config.auth.token, vars);
      parsedRequest.headers.authorization = `Bearer ${renderedToken}`;
    }

    // Add Basic Auth credentials if configured
    if (this.config.auth?.type === 'basic') {
      const renderedUsername = getNunjucksEngine().renderString(this.config.auth.username, vars);
      const renderedPassword = getNunjucksEngine().renderString(this.config.auth.password, vars);
      const credentials = Buffer.from(`${renderedUsername}:${renderedPassword}`).toString('base64');
      parsedRequest.headers.authorization = `Basic ${credentials}`;
    }

    // Add API Key to header if configured
    if (this.config.auth?.type === 'api_key' && this.config.auth.placement === 'header') {
      const renderedKeyName = getNunjucksEngine().renderString(this.config.auth.keyName, vars);
      const renderedValue = getNunjucksEngine().renderString(this.config.auth.value, vars);
      parsedRequest.headers[renderedKeyName.toLowerCase()] = renderedValue;
    }

    // Add API Key to query params if configured
    if (this.config.auth?.type === 'api_key' && this.config.auth.placement === 'query') {
      try {
        const renderedKeyName = getNunjucksEngine().renderString(this.config.auth.keyName, vars);
        const renderedValue = getNunjucksEngine().renderString(this.config.auth.value, vars);
        const urlObj = new URL(url);
        urlObj.searchParams.append(renderedKeyName, renderedValue);
        url = urlObj.toString();
        // Extract the path and query from the full URL
        const urlPath = urlObj.pathname + urlObj.search;
        // Update the request line with the new URL path
        const requestLines = renderedRequest.split('\n');
        const firstLine = requestLines[0];
        const method = firstLine.split(' ')[0];
        const protocol = firstLine.split(' ').slice(-1)[0];
        requestLines[0] = `${method} ${urlPath} ${protocol}`;
        // Re-parse with updated URL
        const updatedRequest = requestLines.join('\n');
        const reParsed = parseRawRequest(updatedRequest.trim());
        Object.assign(parsedRequest, reParsed);
      } catch (err) {
        log.warn(
          `[HTTP Provider]: Failed to add API key to query params in raw request: ${String(err)}`,
        );
      }
    }

    log.debug(
      `[HTTP Provider]: Calling ${sanitizeUrl(url)} with raw request: ${parsedRequest.method}`,
      {
        request: parsedRequest,
      },
    );

    // Prepare fetch options with dispatcher if HTTPS agent is configured
    const httpsAgent = await this.getHttpsAgent();

    // Determine body content:
    // - For JSON/text bodies, http-z provides body.text
    // - For multipart/form-data and x-www-form-urlencoded, http-z parses into body.params
    //   but we need the raw body text, so extract it from the rendered request
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

    // Add HTTPS agent as dispatcher if configured
    if (httpsAgent) {
      fetchOptions.dispatcher = httpsAgent;
      log.debug('[HTTP Provider]: Using custom HTTPS agent for TLS connection');
    }

    let data,
      cached = false,
      status,
      statusText,
      responseHeaders,
      latencyMs: number | undefined;
    try {
      ({
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
      ));
    } catch (err) {
      throw err;
    }

    log.debug('[HTTP Provider]: Response received', {
      length: typeof data === 'string' ? data.length : undefined,
      cached,
    });

    if (!(await this.validateStatus)(status)) {
      throw new Error(`HTTP call failed with status ${status} ${statusText}: ${data}`);
    }

    const rawText = data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }
    const ret: ProviderResponse = {};
    ret.latencyMs = latencyMs;
    ret.cached = cached;

    // If we used a session endpoint, set the sessionId we used
    if (vars.sessionId && this.config.session) {
      ret.sessionId = vars.sessionId;
    }

    // Also check sessionParser for raw request mode
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

    if (context?.debug) {
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
