import * as fs from 'fs';
import * as path from 'path';

import { ConfigurationError } from './errors';

/**
 * Security utilities for MCP server operations
 */

const SIMPLE_PROVIDER_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const PROVIDER_MODEL_SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.\\/-]*$/;
const PROVIDER_FILE_REFERENCE_PATTERN =
  /^(.+\.(?:cjs|cts|go|js|json|mjs|mts|py|rb|ts|ya?ml))(?::[A-Za-z_$][\w$]*(?:(?:::|\.)[A-Za-z_$][\w$]*)*)?$/i;

/**
 * Validates that a file path is safe and within allowed boundaries.
 *
 * @param filePath - The file path to validate
 * @param basePath - Optional base directory to constrain paths within
 */
export function validateFilePath(filePath: string, basePath?: string): void {
  // Check for path traversal attempts BEFORE normalization
  // This prevents bypasses like "/tmp/../etc/passwd" which normalizes to "/etc/passwd"
  if (filePath.includes('..') || filePath.includes('~')) {
    throw new ConfigurationError(
      'Path traversal detected. Paths cannot contain ".." or "~"',
      filePath,
    );
  }

  // Normalize the path after traversal check
  const normalizedPath = path.normalize(filePath);

  // If a base path is provided, ensure the resolved path stays within it
  if (basePath) {
    const resolvedBase = path.resolve(basePath);
    const resolvedPath = path.resolve(basePath, filePath);
    if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
      throw new ConfigurationError(`Path must be within base directory: ${basePath}`, filePath);
    }
  }

  // Check absolute paths - only allow if they don't target system directories
  const isAbsolute = path.isAbsolute(normalizedPath);

  // Check for suspicious system directory patterns
  const suspiciousPatterns = [
    /^\/etc\//,
    /^\/sys\//,
    /^\/proc\//,
    /^\/var\/run\//,
    /^\/dev\//,
    /^C:\\Windows\\/i,
    /^C:\\Program Files\\/i,
    /^C:\\ProgramData\\/i,
  ];

  if (isAbsolute && suspiciousPatterns.some((pattern) => pattern.test(normalizedPath))) {
    throw new ConfigurationError('Access to system directories is not allowed', filePath);
  }
}

/**
 * Validates a caller-supplied MCP file path against the current working directory.
 *
 * MCP clients run as separate local processes, so tools should not read or write
 * arbitrary host paths outside the project the user selected when starting the
 * MCP server.
 */
export function validateMcpFilePath(filePath: string): void {
  const basePath = process.cwd();
  validateFilePath(filePath);

  const resolvedBase = fs.realpathSync(basePath);
  const resolvedPath = path.resolve(basePath, filePath);
  let existingPath = resolvedPath;

  while (!fs.existsSync(existingPath)) {
    const parentPath = path.dirname(existingPath);
    if (parentPath === existingPath) {
      break;
    }
    existingPath = parentPath;
  }

  const realExistingPath = fs.realpathSync(existingPath);
  const relativePath = path.relative(resolvedBase, realExistingPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new ConfigurationError(`Path must be within base directory: ${basePath}`, filePath);
  }
}

function getProviderFilePath(providerId: string): string | undefined {
  const providerPath = providerId.startsWith('file://')
    ? providerId.slice('file://'.length)
    : providerId;
  return providerPath.match(PROVIDER_FILE_REFERENCE_PATTERN)?.[1];
}

/**
 * Validates provider ID format
 */
export function validateProviderId(providerId: string): void {
  if (!providerId || /[\0\r\n]/.test(providerId)) {
    throw new ConfigurationError('Invalid provider ID format: provider ID cannot be empty');
  }

  if (providerId.includes('..') || providerId.includes('~')) {
    throw new ConfigurationError(
      'Invalid provider ID format: provider IDs cannot contain ".." or "~"',
    );
  }

  if (/^https?:\/\//i.test(providerId)) {
    try {
      const url = new URL(providerId);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return;
      }
    } catch {
      throw new ConfigurationError(`Invalid provider URL: ${providerId}`);
    }
  }

  const providerFilePath = getProviderFilePath(providerId);
  if (providerFilePath) {
    validateMcpFilePath(providerFilePath);
    return;
  }

  const [providerPrefix, ...modelSegments] = providerId.split(':');
  const isSimpleProviderId =
    modelSegments.length === 0 && SIMPLE_PROVIDER_ID_PATTERN.test(providerPrefix);
  const isProviderModelId =
    modelSegments.length > 0 &&
    SIMPLE_PROVIDER_ID_PATTERN.test(providerPrefix) &&
    modelSegments.every((segment) => PROVIDER_MODEL_SEGMENT_PATTERN.test(segment));

  if (!isSimpleProviderId && !isProviderModelId) {
    throw new ConfigurationError(
      `Invalid provider ID format: ${providerId}. Expected format like "openai:gpt-4" or path to provider file.`,
    );
  }
}
