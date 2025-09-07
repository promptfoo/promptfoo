import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';

import httpZ from 'http-z';
import { Agent } from 'undici';
import { z } from 'zod';
import { type FetchWithCacheResult, fetchWithCache } from '../cache';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';
import { renderVarsInObject } from '../util';
import { sanitizeUrl } from '../util/fetch';
import { maybeLoadConfigFromExternalFile, maybeLoadFromExternalFile } from '../util/file';
import { isJavascriptFile } from '../util/fileExtensions';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import { createEmptyTokenUsage } from '../util/tokenUsageUtils';
import { REQUEST_TIMEOUT_MS } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
  TokenUsage,
} from '../types';

/**
 * Escapes string values in variables for safe JSON template substitution.
 * Converts { key: "value\nwith\nnewlines" } to { key: "value\\nwith\\nnewlines" }
 */
function escapeJsonVariables(vars: Record<string, any>): Record<string, any> {
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
 * Sanitizes configuration objects by redacting sensitive fields before logging.
 * Prevents passwords and other secrets from appearing in debug logs.
 */
function sanitizeConfigForLogging(config: any): any {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const sanitized = { ...config };

  // Sanitize signature authentication credentials
  if (sanitized.signatureAuth) {
    sanitized.signatureAuth = { ...sanitized.signatureAuth };

    // Redact sensitive fields
    if (sanitized.signatureAuth.pfxPassword) {
      sanitized.signatureAuth.pfxPassword = '[REDACTED]';
    }
    if (sanitized.signatureAuth.keystorePassword) {
      sanitized.signatureAuth.keystorePassword = '[REDACTED]';
    }
    if (sanitized.signatureAuth.privateKey) {
      sanitized.signatureAuth.privateKey = '[REDACTED]';
    }
    // Redact certificate fields
    if (sanitized.signatureAuth.certificateContent) {
      sanitized.signatureAuth.certificateContent = '[REDACTED]';
    }
    if (sanitized.signatureAuth.certificatePassword) {
      sanitized.signatureAuth.certificatePassword = '[REDACTED]';
    }
    if (sanitized.signatureAuth.pfxContent) {
      sanitized.signatureAuth.pfxContent = '[REDACTED]';
    }
    if (sanitized.signatureAuth.keystoreContent) {
      sanitized.signatureAuth.keystoreContent = '[REDACTED]';
    }
    if (sanitized.signatureAuth.keyContent) {
      sanitized.signatureAuth.keyContent = '[REDACTED]';
    }
    if (sanitized.signatureAuth.certContent) {
      sanitized.signatureAuth.certContent = '[REDACTED]';
    }
  }

  // Sanitize other potential sensitive fields
  if (sanitized.password) {
    sanitized.password = '[REDACTED]';
  }
  if (sanitized.apiKey) {
    sanitized.apiKey = '[REDACTED]';
  }
  if (sanitized.token) {
    sanitized.token = '[REDACTED]';
  }
  // Sanitize certificate fields at root level
  if (sanitized.certificateContent) {
    sanitized.certificateContent = '[REDACTED]';
  }
  if (sanitized.certificatePassword) {
    sanitized.certificatePassword = '[REDACTED]';
  }

  // Sanitize headers that might contain sensitive information
  if (sanitized.headers) {
    sanitized.headers = { ...sanitized.headers };
    for (const [key, _value] of Object.entries(sanitized.headers)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('authorization') ||
        lowerKey.includes('api-key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password')
      ) {
        sanitized.headers[key] = '[REDACTED]';
      }
    }
  }

  return sanitized;
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
 * Helper function to resolve file paths relative to basePath if they are relative,
 * otherwise use them as-is if they are absolute
 */
function resolveFilePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cliState.basePath || '', filePath);
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
          const resolvedPath = resolveFilePath(signatureAuth.privateKeyPath);
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
          const resolvedPath = resolveFilePath(signatureAuth.keystorePath);
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
              const resolvedPath = resolveFilePath(signatureAuth.pfxPath);
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
                const resolvedPath = resolveFilePath(signatureAuth.pfxPath);
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
              const resolvedCertPath = resolveFilePath(signatureAuth.certPath);
              const resolvedKeyPath = resolveFilePath(signatureAuth.keyPath);
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
  enabled: z.boolean().default(false),
  multiplier: z.number().min(0.01).default(1.3),
});

// Base signature auth fields
const BaseSignatureAuthSchema = z.object({
  signatureValidityMs: z.number().default(300000),
  signatureDataTemplate: z.string().default('{{signatureTimestamp}}'),
  signatureAlgorithm: z.string().default('SHA256'),
  signatureRefreshBufferMs: z.number().optional(),
});

// PEM signature auth schema
const PemSignatureAuthSchema = BaseSignatureAuthSchema.extend({
  type: z.literal('pem'),
  privateKeyPath: z.string().optional(),
  privateKey: z.string().optional(),
}).refine((data) => data.privateKeyPath !== undefined || data.privateKey !== undefined, {
  message: 'Either privateKeyPath or privateKey must be provided for PEM type',
});

// JKS signature auth schema
const JksSignatureAuthSchema = BaseSignatureAuthSchema.extend({
  type: z.literal('jks'),
  keystorePath: z.string().optional(),
  keystoreContent: z.string().optional(), // Base64 encoded JKS content
  keystorePassword: z.string().optional(),
  keyAlias: z.string().optional(),
}).refine((data) => data.keystorePath !== undefined || data.keystoreContent !== undefined, {
  message: 'Either keystorePath or keystoreContent must be provided for JKS type',
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
    message:
      'Either pfxPath, pfxContent, both certPath and keyPath, or both certContent and keyContent must be provided for PFX type',
  },
);

// Legacy signature auth schema (for backward compatibility)
const LegacySignatureAuthSchema = BaseSignatureAuthSchema.extend({
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
}).passthrough();

// Generic certificate auth schema (for UI-based certificate uploads)
const GenericCertificateAuthSchema = BaseSignatureAuthSchema.extend({
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
}).passthrough();

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
    rejectUnauthorized: z.boolean().default(true),
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
      message:
        'Both certificate and key must be provided for client certificate authentication (unless using PFX)',
    },
  );

export const HttpProviderConfigSchema = z.object({
  body: z.union([z.record(z.any()), z.string(), z.array(z.any())]).optional(),
  headers: z.record(z.string()).optional(),
  maxRetries: z.number().min(0).optional(),
  method: z.string().optional(),
  queryParams: z.record(z.string()).optional(),
  request: z.string().optional(),
  useHttps: z
    .boolean()
    .optional()
    .describe('Use HTTPS for the request. This only works with the raw request option'),
  sessionParser: z.union([z.string(), z.function()]).optional(),
  transformRequest: z.union([z.string(), z.function()]).optional(),
  transformResponse: z.union([z.string(), z.function()]).optional(),
  url: z.string().optional(),
  validateStatus: z
    .union([z.string(), z.function().returns(z.boolean()).args(z.number())])
    .optional(),
  /**
   * @deprecated use transformResponse instead
   */
  responseParser: z.union([z.string(), z.function()]).optional(),
  // Token estimation configuration
  tokenEstimation: TokenEstimationConfigSchema.optional(),
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

type HttpProviderConfig = z.infer<typeof HttpProviderConfigSchema>;

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

interface TransformResponseContext {
  response: FetchWithCacheResult<any>;
}

export async function createTransformResponse(
  parser: string | Function | undefined,
): Promise<(data: any, text: string, context?: TransformResponseContext) => ProviderResponse> {
  if (!parser) {
    return (data, text) => ({ output: data || text });
  }

  if (typeof parser === 'function') {
    return (data, text, context) => {
      try {
        const result = parser(data, text, context);
        if (typeof result === 'object') {
          return result;
        } else {
          return { output: result };
        }
      } catch (err) {
        logger.error(
          `[Http Provider] Error in response transform function: ${String(err)}. Data: ${safeJsonStringify(data)}. Text: ${text}. Context: ${safeJsonStringify(context)}.`,
        );
        throw err;
      }
    };
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
    return (data, text, context) => {
      try {
        const trimmedParser = parser.trim();
        // Check if it's a function expression (either arrow or regular)
        const isFunctionExpression = /^(\(.*?\)\s*=>|function\s*\(.*?\))/.test(trimmedParser);
        const transformFn = new Function(
          'json',
          'text',
          'context',
          isFunctionExpression
            ? `try { return (${trimmedParser})(json, text, context); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + text + ' : ' + JSON.stringify(json) + ' : ' + JSON.stringify(context)); }`
            : `try { return (${trimmedParser}); } catch(e) { throw new Error('Transform failed: ' + e.message + ' : ' + text + ' : ' + JSON.stringify(json) + ' : ' + JSON.stringify(context)); }`,
        );
        let resp: ProviderResponse | string;
        if (context) {
          resp = transformFn(data || null, text, context);
        } else {
          resp = transformFn(data || null, text);
        }

        if (typeof resp === 'string') {
          return { output: resp };
        }
        return resp;
      } catch (err) {
        logger.error(
          `[Http Provider] Error in response transform: ${String(err)}. Data: ${safeJsonStringify(data)}. Text: ${text}. Context: ${safeJsonStringify(context)}.`,
        );
        throw new Error(`Failed to transform response: ${String(err)}`);
      }
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
        try {
          return JSON.parse(obj);
        } catch {
          return obj;
        }
      }
      return obj;
    };

    return processNestedValues(rendered);
  }

  // If it's a string, attempt to parse as JSON
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

function parseRawRequest(input: string) {
  const normalized = input.replace(/\r\n/g, '\n').trim();
  const adjusted = normalized.replace(/\n/g, '\r\n') + '\r\n\r\n';
  // If the injectVar is in a query param, we need to encode the URL in the first line
  const encoded = urlEncodeRawRequestPath(adjusted);
  try {
    const messageModel = httpZ.parse(encoded) as httpZ.HttpZRequestModel;
    return {
      method: messageModel.method,
      url: messageModel.target,
      headers: messageModel.headers.reduce(
        (acc, header) => {
          acc[header.name.toLowerCase()] = header.value;
          return acc;
        },
        {} as Record<string, string>,
      ),
      body: messageModel.body,
    };
  } catch (err) {
    throw new Error(`Error parsing raw HTTP request: ${String(err)}`);
  }
}

export async function createTransformRequest(
  transform: string | Function | undefined,
): Promise<(prompt: string, vars: Record<string, any>, context?: CallApiContextParams) => any> {
  if (!transform) {
    return (prompt) => prompt;
  }

  if (typeof transform === 'function') {
    return async (prompt, vars, context) => {
      try {
        // Pass prompt, vars, and context to user-provided function (extra args are safe)
        return await (transform as any)(prompt, vars, context);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const wrappedError = new Error(`Error in request transform function: ${errorMessage}`);
        logger.error(wrappedError.message);
        throw wrappedError;
      }
    };
  }

  if (typeof transform === 'string') {
    if (transform.startsWith('file://')) {
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
        return async (prompt, vars, context) => {
          try {
            return await requiredModule(prompt, vars, context);
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const wrappedError = new Error(
              `Error in request transform function from ${filename}: ${errorMessage}`,
            );
            logger.error(wrappedError.message);
            throw wrappedError;
          }
        };
      }
      throw new Error(
        `Request transform malformed: ${filename} must export a function or have a default export as a function`,
      );
    }
    // Handle string template
    return async (prompt, vars, context) => {
      try {
        const rendered = getNunjucksEngine().renderString(transform, { prompt, vars, context });
        return await new Function('prompt', 'vars', 'context', `${rendered}`)(
          prompt,
          vars,
          context,
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const wrappedError = new Error(
          `Error in request transform string template: ${errorMessage}`,
        );
        logger.error(wrappedError.message);
        throw wrappedError;
      }
    };
  }

  throw new Error(
    `Unsupported request transform type: ${typeof transform}. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.`,
  );
}

export function determineRequestBody(
  contentType: boolean,
  parsedPrompt: any,
  configBody: Record<string, any> | any[] | string | undefined,
  vars: Record<string, any>,
): Record<string, any> | any[] | string {
  if (contentType) {
    // For JSON content type
    if (typeof parsedPrompt === 'object' && parsedPrompt !== null) {
      // If parser returned an object, merge it with config body
      return Object.assign({}, configBody || {}, parsedPrompt);
    }
    // Otherwise process the config body with parsed prompt
    return processJsonBody(configBody as Record<string, any> | any[], {
      ...vars,
      prompt: parsedPrompt,
    });
  }
  // For non-JSON content type, process as text
  return processTextBody(configBody as string, {
    ...vars,
    prompt: parsedPrompt,
  });
}

export async function createValidateStatus(
  validator: string | ((status: number) => boolean) | undefined,
): Promise<(status: number) => boolean> {
  if (!validator) {
    return (status: number) => true;
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
    const resolvedPath = resolveFilePath(tlsConfig.caPath);
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
        const resolvedPath = resolveFilePath((tlsConfig as any).jksPath);
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
      const resolvedPath = resolveFilePath(tlsConfig.certPath);
      tlsOptions.cert = fs.readFileSync(resolvedPath, 'utf8');
      logger.debug(`[HTTP Provider] Loaded client certificate from ${resolvedPath}`);
    }

    // Load private key (non-JKS)
    if (tlsConfig.key) {
      tlsOptions.key = tlsConfig.key;
    } else if (tlsConfig.keyPath) {
      const resolvedPath = resolveFilePath(tlsConfig.keyPath);
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
    const resolvedPath = resolveFilePath(tlsConfig.pfxPath);
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
  private httpsAgent?: Agent;
  private httpsAgentPromise?: Promise<Agent>;

  constructor(url: string, options: ProviderOptions) {
    this.config = HttpProviderConfigSchema.parse(options.config);
    if (!this.config.tokenEstimation && cliState.config?.redteam) {
      this.config.tokenEstimation = { enabled: true, multiplier: 1.3 };
    }
    this.url = this.config.url || url;
    this.transformResponse = createTransformResponse(
      this.config.transformResponse || this.config.responseParser,
    );
    this.sessionParser = createSessionParser(this.config.sessionParser);
    this.transformRequest = createTransformRequest(this.config.transformRequest);
    this.validateStatus = createValidateStatus(this.config.validateStatus);

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

  private async refreshSignatureIfNeeded(): Promise<void> {
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

      // Determine the signature auth type for legacy configurations
      let authConfig = signatureAuth;
      if (!('type' in signatureAuth)) {
        authConfig = { ...signatureAuth, type: 'pem' };
      }

      this.lastSignature = await generateSignature(authConfig, this.lastSignatureTimestamp);
      logger.debug('[HTTP Provider Auth]: Generated new signature successfully');
    } else {
      logger.debug('[HTTP Provider Auth]: Using cached signature');
    }

    invariant(this.lastSignature, 'Signature should be defined at this point');
    invariant(this.lastSignatureTimestamp, 'Timestamp should be defined at this point');
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
    if (this.httpsAgentPromise) {
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

    return Object.fromEntries(
      Object.entries({ ...defaultHeaders, ...headers }).map(([key, value]) => [
        key,
        nunjucks.renderString(value, vars),
      ]),
    );
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = {
      ...(context?.vars || {}),
      prompt,
    } as Record<string, any>;

    // Add signature values to vars if signature auth is enabled
    if (this.config.signatureAuth) {
      await this.refreshSignatureIfNeeded();
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

    if (this.config.request) {
      return this.callApiWithRawRequest(vars, context);
    }

    const defaultHeaders = this.getDefaultHeaders(this.config.body);
    const headers = await this.getHeaders(defaultHeaders, vars);
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
      queryParams: this.config.queryParams
        ? Object.fromEntries(
            Object.entries(this.config.queryParams).map(([key, value]) => [
              key,
              getNunjucksEngine().renderString(value, vars),
            ]),
          )
        : undefined,
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
        logger.warn(`[HTTP Provider]: Failed to construct URL object: ${String(err)}`);
        const queryString = new URLSearchParams(renderedConfig.queryParams).toString();
        url = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
      }
    }

    logger.debug(
      `[HTTP Provider]: Calling ${sanitizeUrl(url)} with config: ${safeJsonStringify(sanitizeConfigForLogging(renderedConfig))}`,
    );

    // Prepare fetch options with dispatcher if HTTPS agent is configured
    const httpsAgent = await this.getHttpsAgent();
    const fetchOptions: any = {
      method: renderedConfig.method,
      headers: renderedConfig.headers,
      ...(method !== 'GET' && {
        body: contentTypeIsJson(headers)
          ? typeof renderedConfig.body === 'string'
            ? renderedConfig.body // Already a JSON string, use as-is
            : JSON.stringify(renderedConfig.body) // Object, needs stringifying
          : String(renderedConfig.body)?.trim(),
      }),
    };

    // Add HTTPS agent as dispatcher if configured
    if (httpsAgent) {
      fetchOptions.dispatcher = httpsAgent;
      logger.debug('[HTTP Provider]: Using custom HTTPS agent for TLS connection');
    }

    const response = await fetchWithCache(
      url,
      fetchOptions,
      REQUEST_TIMEOUT_MS,
      'text',
      context?.bustCache ?? context?.debug,
      this.config.maxRetries,
    );

    logger.debug(`[HTTP Provider]: Response: ${safeJsonStringify(response.data)}`);

    if (!(await this.validateStatus)(response.status)) {
      throw new Error(
        `HTTP call failed with status ${response.status} ${response.statusText}: ${response.data}`,
      );
    }
    logger.debug(
      `[HTTP Provider]: Response (HTTP ${response.status}): ${safeJsonStringify(response.data)}`,
    );

    const ret: ProviderResponse = {};
    ret.raw = response.data;
    ret.metadata = {
      http: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers || {},
      },
    };

    const rawText = response.data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }

    try {
      const sessionId =
        this.sessionParser == null
          ? undefined
          : (await this.sessionParser)({ headers: response.headers, body: parsedData ?? rawText });
      if (sessionId) {
        ret.sessionId = sessionId;
      }
    } catch (err) {
      logger.error(
        `Error parsing session ID: ${String(err)}. Got headers: ${safeJsonStringify(response.headers)} and parsed body: ${safeJsonStringify(parsedData)}`,
      );
      throw err;
    }
    const parsedOutput = (await this.transformResponse)(parsedData, rawText, { response });

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
  ): Promise<ProviderResponse> {
    invariant(this.config.request, 'Expected request to be set in http provider config');

    // Transform prompt using request transform
    const prompt = vars.prompt;
    const transformFn = await this.transformRequest;
    const transformedPrompt = await transformFn(prompt, vars, context);
    logger.debug(
      `[HTTP Provider]: Transformed prompt: ${safeJsonStringify(transformedPrompt)}. Original prompt: ${safeJsonStringify(prompt)}`,
    );

    const renderedRequest = renderRawRequestWithNunjucks(this.config.request, {
      ...vars,
      prompt: transformedPrompt,
    });
    const parsedRequest = parseRawRequest(renderedRequest.trim());

    const protocol = this.url.startsWith('https') || this.config.useHttps ? 'https' : 'http';
    const url = new URL(
      parsedRequest.url,
      `${protocol}://${parsedRequest.headers['host']}`,
    ).toString();

    // Remove content-length header from raw request if the user added it, it will be added by fetch with the correct value
    delete parsedRequest.headers['content-length'];

    logger.debug(
      `[HTTP Provider]: Calling ${sanitizeUrl(url)} with raw request: ${parsedRequest.method}  ${safeJsonStringify(parsedRequest.body)} \n headers: ${safeJsonStringify(sanitizeConfigForLogging({ headers: parsedRequest.headers }).headers)}`,
    );

    // Prepare fetch options with dispatcher if HTTPS agent is configured
    const httpsAgent = await this.getHttpsAgent();
    const fetchOptions: any = {
      method: parsedRequest.method,
      headers: parsedRequest.headers,
      ...(parsedRequest.body && { body: parsedRequest.body.text.trim() }),
    };

    // Add HTTPS agent as dispatcher if configured
    if (httpsAgent) {
      fetchOptions.dispatcher = httpsAgent;
      logger.debug('[HTTP Provider]: Using custom HTTPS agent for TLS connection');
    }

    const response = await fetchWithCache(
      url,
      fetchOptions,
      REQUEST_TIMEOUT_MS,
      'text',
      context?.debug,
      this.config.maxRetries,
    );

    logger.debug(`[HTTP Provider]: Response: ${safeJsonStringify(response.data)}`);

    if (!(await this.validateStatus)(response.status)) {
      throw new Error(
        `HTTP call failed with status ${response.status} ${response.statusText}: ${response.data}`,
      );
    }

    const rawText = response.data as string;
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = null;
    }
    const ret: ProviderResponse = {};
    if (context?.debug) {
      ret.raw = response.data;
      ret.metadata = {
        headers: response.headers,
      };
    }

    const parsedOutput = (await this.transformResponse)(parsedData, rawText, { response });

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
