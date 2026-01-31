import * as path from 'path';

import { ConfigurationError } from './errors';

/**
 * Security utilities for MCP server operations
 */

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
 * Validates provider ID format
 */
export function validateProviderId(providerId: string): void {
  // Allow common provider formats
  const validFormats = [
    /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_.-]+$/, // provider:model format
    /^[a-zA-Z0-9_/-]+\.(js|ts|py|mjs)$/, // file path format
    /^https?:\/\/.+$/, // HTTP provider format
  ];

  if (!validFormats.some((format) => format.test(providerId))) {
    throw new ConfigurationError(
      `Invalid provider ID format: ${providerId}. Expected format like "openai:gpt-4" or path to provider file.`,
    );
  }
}
