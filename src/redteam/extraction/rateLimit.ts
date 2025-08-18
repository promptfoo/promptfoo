import { z } from 'zod';
import logger from '../../logger';
import { sleep } from '../../util/time';

import type { ApiProvider } from '../../types';

// Rate limit information schema and types
export const RateLimitInfoSchema = z.object({
  detected: z.boolean(),
  detectionMethod: z.enum(['headers', 'probing', 'none']),
  requestsPerSecond: z.number().optional(),
  requestsPerMinute: z.number().optional(), 
  burstCapacity: z.number().optional(),
  headers: z.record(z.string()).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type RateLimitInfo = z.infer<typeof RateLimitInfoSchema>;

/**
 * Discovers rate limiting information for an API provider
 * @param provider - The API provider to test
 * @param options - Discovery options
 * @returns Rate limit information
 */
export async function discoverRateLimit(
  provider: ApiProvider,
  options?: { activeProbing?: boolean }
): Promise<RateLimitInfo> {
  logger.debug('[RateLimit] Starting rate limit discovery');
  
  // Step 1: Passive detection (always run - it's free)
  const headerInfo = await checkRateLimitHeaders(provider);
  if (headerInfo.detected) {
    logger.debug('[RateLimit] Rate limits detected via headers');
    return headerInfo;
  }
  
  // Step 2: Active probing (optional)
  if (options?.activeProbing) {
    logger.debug('[RateLimit] Starting active probing');
    return await probeRateLimit(provider);
  }
  
  logger.debug('[RateLimit] No rate limits detected');
  return headerInfo; // Return header check result (which has detected: false, detectionMethod: 'headers')
}

/**
 * Checks for rate limit information in response headers
 * @param provider - The API provider to test
 * @returns Rate limit information from headers
 */
async function checkRateLimitHeaders(provider: ApiProvider): Promise<RateLimitInfo> {
  try {
    logger.debug('[RateLimit] Checking headers during test request');
    const response = await provider.callApi('test');
    const headers = response.metadata?.http?.headers || {};
    
    // Convert headers to lowercase for case-insensitive matching
    const lowerHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      lowerHeaders[key.toLowerCase()] = String(value);
    });
    
    // Check common rate limit headers
    const rateLimitHeaders = {
      limit: lowerHeaders['x-ratelimit-limit'] || 
             lowerHeaders['x-rate-limit-limit'] || 
             lowerHeaders['ratelimit-limit'],
      remaining: lowerHeaders['x-ratelimit-remaining'] || 
                lowerHeaders['x-rate-limit-remaining'] ||
                lowerHeaders['ratelimit-remaining'],
      reset: lowerHeaders['x-ratelimit-reset'] || 
             lowerHeaders['x-rate-limit-reset'] ||
             lowerHeaders['ratelimit-reset'],
      retryAfter: lowerHeaders['retry-after']
    };
    
    // Filter out undefined values
    const foundHeaders: Record<string, string> = {};
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      if (value) {
        foundHeaders[key] = value;
      }
    });
    
    if (Object.keys(foundHeaders).length > 0) {
      logger.debug(`[RateLimit] Found rate limit headers: ${JSON.stringify(foundHeaders)}`);
      return parseRateLimitHeaders(foundHeaders);
    }
    
    return { detected: false, detectionMethod: 'headers', confidence: 'high' };
  } catch (error) {
    logger.debug(`[RateLimit] Error checking headers: ${error}`);
    return { detected: false, detectionMethod: 'headers', confidence: 'low' };
  }
}

/**
 * Parses rate limit information from headers
 * @param headers - Rate limit headers found in response
 * @returns Parsed rate limit information
 */
function parseRateLimitHeaders(headers: Record<string, string>): RateLimitInfo {
  const result: RateLimitInfo = {
    detected: true,
    detectionMethod: 'headers',
    confidence: 'high',
    headers
  };
  
  // Parse limit values
  if (headers.limit) {
    const limit = parseInt(headers.limit, 10);
    if (!isNaN(limit)) {
      // Most rate limit headers specify per-minute limits
      result.requestsPerMinute = limit;
      result.requestsPerSecond = Math.floor(limit / 60);
    }
  }
  
  // Parse remaining requests (indicates current usage)
  if (headers.remaining) {
    const remaining = parseInt(headers.remaining, 10);
    if (!isNaN(remaining)) {
      // Could use this to calculate current usage, but not needed for basic discovery
      logger.debug(`[RateLimit] Remaining requests: ${remaining}`);
    }
  }
  
  return result;
}

/**
 * Actively probes the API to discover rate limits (minimal implementation)
 * @param provider - The API provider to test
 * @returns Rate limit information from probing
 */
async function probeRateLimit(provider: ApiProvider): Promise<RateLimitInfo> {
  const requests = 5;
  const timeWindow = 10; // seconds
  
  // Safety check - warn user about active probing
  logger.warn('[RateLimit] Active rate limit probing enabled - this will send additional test requests');
  
  // Check if this looks like a production environment
  const providerId = provider.id();
  if (providerId.toLowerCase().includes('prod') || providerId.toLowerCase().includes('production')) {
    logger.warn('[RateLimit] WARNING: This appears to be a production API. Consider using --skip-rate-limits');
  }
  
  try {
    const startTime = Date.now();
    const results = [];
    
    for (let i = 0; i < requests; i++) {
      const requestStart = Date.now();
      const response = await provider.callApi('test');
      const requestEnd = Date.now();
      
      results.push({
        statusCode: response.error ? 429 : 200, // Assume 429 on error for simplicity
        responseTime: requestEnd - requestStart,
        hasError: !!response.error,
        errorMessage: response.error || ''
      });
      
      // Small delay to avoid immediate blocking
      await sleep(100);
    }
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000; // Convert to seconds
    
    // Simple analysis
    const errorCount = results.filter(r => r.hasError).length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    
    logger.debug(`[RateLimit] Probing results: ${errorCount}/${requests} errors, avg response time: ${avgResponseTime.toFixed(2)}ms`);
    
    if (errorCount > 0) {
      // Check if errors look like rate limiting
      const rateLimitErrors = results.filter(r => 
        r.hasError && (
          r.errorMessage.toLowerCase().includes('rate') ||
          r.errorMessage.toLowerCase().includes('limit') ||
          r.errorMessage.toLowerCase().includes('429') ||
          r.errorMessage.toLowerCase().includes('too many')
        )
      ).length;
      
      const confidence = rateLimitErrors > 2 ? 'high' : 
                        rateLimitErrors > 0 ? 'medium' : 'low';
      
      return {
        detected: rateLimitErrors > 0,
        detectionMethod: 'probing',
        confidence,
        // Rough estimate based on successful requests
        requestsPerSecond: Math.max(1, Math.floor((requests - errorCount) / totalTime))
      };
    }
    
    return { detected: false, detectionMethod: 'probing', confidence: 'medium' };
  } catch (error) {
    logger.error(`[RateLimit] Error during probing: ${error}`);
    return { detected: false, detectionMethod: 'probing', confidence: 'low' };
  }
}