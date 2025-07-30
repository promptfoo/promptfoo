import * as path from 'path';
import { ConfigurationError } from './errors';

/**
 * Security utilities for MCP server operations
 */

/**
 * Validates that a file path is safe and within allowed boundaries
 */
export function validateFilePath(filePath: string, allowedPaths?: string[]): void {
  // Normalize the path
  const normalizedPath = path.normalize(filePath);

  // Check for path traversal attempts
  if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
    throw new ConfigurationError(
      'Path traversal detected. Paths cannot contain ".." or "~"',
      filePath,
    );
  }

  // Check absolute paths on different platforms
  const isAbsolute = path.isAbsolute(normalizedPath);
  if (isAbsolute && !allowedPaths?.some((allowed) => normalizedPath.startsWith(allowed))) {
    throw new ConfigurationError(
      'Absolute paths are not allowed unless explicitly permitted',
      filePath,
    );
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /^\/etc\//,
    /^\/sys\//,
    /^\/proc\//,
    /^C:\\Windows\\/i,
    /^C:\\Program Files\\/i,
  ];

  if (suspiciousPatterns.some((pattern) => pattern.test(normalizedPath))) {
    throw new ConfigurationError('Access to system directories is not allowed', filePath);
  }
}

/**
 * Sanitizes a command or provider ID to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  // Remove any shell metacharacters
  const sanitized = input.replace(/[;&|`$()<>\\]/g, '');

  // Limit length to prevent DoS
  if (sanitized.length > 1000) {
    throw new ConfigurationError('Input exceeds maximum allowed length');
  }

  return sanitized;
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

/**
 * Rate limiting tracker for preventing abuse
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(
    private maxRequests: number = 100,
    private windowMs: number = 60000, // 1 minute
  ) {}

  /**
   * Check if a request should be allowed
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove old requests outside the window
    const validRequests = requests.filter((time) => now - time < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);

    // Cleanup old entries periodically
    if (this.requests.size > 1000) {
      this.cleanup();
    }

    return true;
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string): number {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    const validRequests = requests.filter((time) => now - time < this.windowMs);
    return Math.max(0, this.maxRequests - validRequests.length);
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, requests] of this.requests.entries()) {
      const validRequests = requests.filter((time) => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }
}

/**
 * Default rate limiter instance
 */
export const defaultRateLimiter = new RateLimiter();
