import { z } from 'zod';
import logger from '../../logger';

import type { ApiProvider, RateLimitInfo } from '../../types';

// Rate limit information schema for validation (type defined in types/index.ts to avoid circular dependency)
export const RateLimitInfoSchema = z.object({
  detected: z.boolean(),
  detectionMethod: z.enum(['headers', 'none']), // Removed 'probing' - feature removed
  requestsPerSecond: z.number().min(0).max(10000).optional(), // Reasonable bounds
  requestsPerMinute: z.number().min(0).max(600000).optional(), // Reasonable bounds
  requestsPerHour: z.number().min(0).max(36000000).optional(), // Support hourly limits
  timeWindow: z.string().optional(), // e.g., "1m", "1h", "15m"
  headers: z.record(z.string()).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  warnings: z.array(z.string()).optional(), // Any parsing warnings
});

/**
 * Discovers rate limiting information for an API provider via passive header detection only.
 * This is a safe, non-intrusive method that checks for standard rate limit headers.
 *
 * @param provider - The API provider to test
 * @returns Rate limit information detected from headers
 */
export async function discoverRateLimit(provider: ApiProvider): Promise<RateLimitInfo> {
  logger.debug('[RateLimit] Starting passive rate limit discovery');

  // Only passive detection - removed active probing due to safety and reliability concerns
  return await checkRateLimitHeaders(provider);
}

/**
 * Checks for rate limit information in response headers using standard patterns.
 * Supports multiple rate limiting header standards used by major APIs.
 *
 * @param provider - The API provider to test
 * @returns Rate limit information from headers
 */
async function checkRateLimitHeaders(provider: ApiProvider): Promise<RateLimitInfo> {
  try {
    logger.debug('[RateLimit] Checking headers during discovery request');
    const response = await provider.callApi('test');
    const headers = response.metadata?.http?.headers;

    if (!headers || typeof headers !== 'object') {
      logger.debug('[RateLimit] No headers available from provider');
      return { detected: false, detectionMethod: 'none', confidence: 'high' };
    }

    // Safely convert headers to lowercase for case-insensitive matching
    const lowerHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      if (typeof key === 'string' && (typeof value === 'string' || typeof value === 'number')) {
        lowerHeaders[key.toLowerCase()] = String(value);
      }
    });

    // Detect rate limit headers using multiple standards
    const rateLimitDetection = detectRateLimitHeaders(lowerHeaders);

    if (rateLimitDetection.detected) {
      logger.debug(
        `[RateLimit] Rate limits detected: ${JSON.stringify(rateLimitDetection, null, 2)}`,
      );
      return rateLimitDetection;
    }

    return { detected: false, detectionMethod: 'headers', confidence: 'high' };
  } catch (error) {
    logger.warn(`[RateLimit] Error during header check: ${error}`);
    return { detected: false, detectionMethod: 'none', confidence: 'low' };
  }
}

/**
 * Detects and parses rate limit information from headers using multiple standards.
 * Supports RFC 6585, GitHub, Twitter, Cloudflare, and other common patterns.
 *
 * @param lowerHeaders - Lowercase header keys with original values
 * @returns Parsed rate limit information with warnings for ambiguous cases
 */
function detectRateLimitHeaders(lowerHeaders: Record<string, string>): RateLimitInfo {
  const warnings: string[] = [];
  const foundHeaders: Record<string, string> = {};

  // Standard 1: RFC 6585 and X-RateLimit-* (most common)
  const standardHeaders = {
    limit: lowerHeaders['x-ratelimit-limit'] || lowerHeaders['x-rate-limit-limit'],
    remaining: lowerHeaders['x-ratelimit-remaining'] || lowerHeaders['x-rate-limit-remaining'],
    reset: lowerHeaders['x-ratelimit-reset'] || lowerHeaders['x-rate-limit-reset'],
    window: lowerHeaders['x-ratelimit-window'] || lowerHeaders['x-rate-limit-window'],
  };

  // Standard 2: GitHub API style
  const githubHeaders = {
    limit: lowerHeaders['x-ratelimit-limit'],
    remaining: lowerHeaders['x-ratelimit-remaining'],
    reset: lowerHeaders['x-ratelimit-reset'],
    used: lowerHeaders['x-ratelimit-used'],
  };

  // Standard 3: Twitter API style
  const twitterHeaders = {
    limit: lowerHeaders['x-rate-limit-limit'],
    remaining: lowerHeaders['x-rate-limit-remaining'],
    reset: lowerHeaders['x-rate-limit-reset'],
  };

  // Standard 4: Generic rate limit headers
  const genericHeaders = {
    limit: lowerHeaders['ratelimit-limit'],
    remaining: lowerHeaders['ratelimit-remaining'],
    reset: lowerHeaders['ratelimit-reset'],
  };

  // Standard 5: Retry-After (HTTP standard)
  const retryAfter = lowerHeaders['retry-after'];

  // Collect all found rate limit headers
  [standardHeaders, githubHeaders, twitterHeaders, genericHeaders].forEach((headerSet) => {
    Object.entries(headerSet).forEach(([key, value]) => {
      if (value) {
        foundHeaders[key] = value;
      }
    });
  });

  if (retryAfter) {
    foundHeaders['retry-after'] = retryAfter;
  }

  // If no rate limit headers found
  if (Object.keys(foundHeaders).length === 0) {
    return {
      detected: false,
      detectionMethod: 'headers',
      confidence: 'high', // High confidence that we checked properly
    };
  }

  // Parse the found headers
  return parseRateLimitHeaders(foundHeaders, warnings);
}

/**
 * Parses rate limit values with proper validation and multiple time window support
 */
function parseRateLimitHeaders(headers: Record<string, string>, warnings: string[]): RateLimitInfo {
  const result: RateLimitInfo = {
    detected: true,
    detectionMethod: 'headers',
    confidence: 'medium', // Start with medium, increase based on quality of data
    headers,
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  // Parse limit values with validation
  const limitValue = headers.limit;
  if (limitValue) {
    const parsedLimit = parsePositiveInteger(limitValue);
    if (parsedLimit !== null) {
      // Determine time window - default to per-minute if not specified
      const timeWindow = headers.window || headers.reset || 'unknown';

      if (timeWindow.includes('3600') || timeWindow.includes('hour') || timeWindow.includes('h')) {
        result.requestsPerHour = parsedLimit;
        result.requestsPerMinute = Math.floor(parsedLimit / 60);
        result.requestsPerSecond = Math.floor(parsedLimit / 3600);
        result.timeWindow = '1h';
        result.confidence = 'high';
      } else if (timeWindow.includes('900') || timeWindow.includes('15m')) {
        // Twitter-style 15-minute windows
        result.requestsPerMinute = Math.floor(parsedLimit / 15);
        result.requestsPerSecond = Math.floor(parsedLimit / 900);
        result.timeWindow = '15m';
        result.confidence = 'high';
      } else if (
        timeWindow.includes('60') ||
        timeWindow.includes('minute') ||
        timeWindow.includes('m')
      ) {
        result.requestsPerMinute = parsedLimit;
        result.requestsPerSecond = Math.floor(parsedLimit / 60);
        result.timeWindow = '1m';
        result.confidence = 'high';
      } else {
        // Unknown time window - assume per-minute but warn
        result.requestsPerMinute = parsedLimit;
        result.requestsPerSecond = Math.floor(parsedLimit / 60);
        result.timeWindow = 'unknown';
        warnings.push(
          `Unable to determine time window for rate limit ${parsedLimit}, assuming per-minute`,
        );
        result.confidence = 'medium';
      }
    } else {
      warnings.push(`Invalid rate limit value: ${limitValue}`);
    }
  }

  // Validate parsed values make sense
  if (result.requestsPerSecond && result.requestsPerSecond > 1000) {
    warnings.push(`Unusually high rate limit detected: ${result.requestsPerSecond} RPS`);
  }

  if (result.requestsPerMinute && result.requestsPerMinute > 60000) {
    warnings.push(`Unusually high rate limit detected: ${result.requestsPerMinute} RPM`);
  }

  // Sanity check: per-second should be <= per-minute/60
  if (result.requestsPerSecond && result.requestsPerMinute) {
    const expectedPerSecond = Math.floor(result.requestsPerMinute / 60);
    if (Math.abs(result.requestsPerSecond - expectedPerSecond) > 1) {
      warnings.push('Inconsistent rate limit calculations detected');
    }
  }

  // Update warnings if any were added
  if (warnings.length > 0) {
    result.warnings = warnings;
    if (result.confidence === 'high') {
      result.confidence = 'medium';
    }
  }

  return result;
}

/**
 * Safely parses a positive integer from a string
 */
function parsePositiveInteger(value: string): number | null {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0 || parsed > 1000000000) {
    // Reasonable upper bound
    return null;
  }
  return parsed;
}
