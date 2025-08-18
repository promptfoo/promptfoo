# Rate Limit Discovery for Promptfoo Red Team

## Executive Summary

This document outlines a **simplified rate limit discovery feature** for promptfoo's red team testing framework. Instead of building a complex testing plugin, we integrate rate limit discovery into the existing discovery phase to inform subsequent red team testing.

**Key Insight**: Rate limits are API characteristics that should be discovered, not vulnerabilities that should be tested. This information helps configure all other red team tests appropriately.

## 1. Revised Approach: Discovery Integration

Based on engineering review, the original plugin approach was over-engineered. The better solution is to:

1. **Integrate with existing discovery**: Extend `promptfoo redteam discover`
2. **Passive detection first**: Check headers during normal discovery requests (free)
3. **Optional active probing**: Add minimal probing if no headers found (configurable)
4. **Store for reporting**: Include in evaluation metadata for red team reports
5. **Inform other tests**: Use discovered limits to set appropriate delays

This approach is simpler, more valuable, and fits existing patterns.

## 2. Technical Implementation

### 2.1 Data Flow and Storage

Rate limit information needs to be accessible in red team reports. Here's the data flow:

1. **Discovery Phase**: Detect rate limits during `promptfoo redteam discover`
2. **Storage**: Store in evaluation metadata (not individual test metadata)
3. **Access**: Make available to red team report UI and other tests

```typescript
// Extend existing TargetPurposeDiscoveryResult
export type TargetPurposeDiscoveryResult = {
  purpose: string | null;
  limitations: string | null;
  user: string | null;
  tools: Array<any>;
  // ADD: Rate limit information
  rateLimit?: RateLimitInfo;
};

interface RateLimitInfo {
  detected: boolean;
  detectionMethod: 'headers' | 'probing' | 'none';
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  burstCapacity?: number;
  headers?: Record<string, string>;
  confidence: 'high' | 'medium' | 'low';
}
```

### 2.2 Storage Strategy

**Option 1**: Extend `EvaluateSummaryV2` (in `evalsTable.results`)

```typescript
export interface EvaluateSummaryV2 {
  version: number;
  timestamp: string;
  results: EvaluateResult[];
  table: EvaluateTable;
  stats: EvaluateStats;
  // ADD: Discovery metadata
  discovery?: {
    purpose?: string;
    entities?: string[];
    rateLimit?: RateLimitInfo;
  };
}
```

**Option 2**: Store in `UnifiedConfig.metadata` (in `evalsTable.config`)

```typescript
// During redteam config generation
const config: UnifiedConfig = {
  // ... existing config
  metadata: {
    discovery: {
      purpose: discoveryResult.purpose,
      rateLimit: discoveryResult.rateLimit,
    },
  },
};
```

**Recommendation**: Use Option 1 (EvaluateSummaryV2) since it's specifically for evaluation results.

### 2.3 Discovery Integration

```typescript
// Extend existing doTargetPurposeDiscovery function
export async function doTargetPurposeDiscovery(
  target: ApiProvider,
  prompt?: Prompt,
  showProgress: boolean = true,
  options?: { includeRateLimitDiscovery?: boolean },
): Promise<TargetPurposeDiscoveryResult | undefined> {
  // ... existing discovery logic ...

  let rateLimitInfo: RateLimitInfo | undefined;

  if (options?.includeRateLimitDiscovery !== false) {
    if (showProgress) {
      console.log('Discovering rate limits...');
    }
    rateLimitInfo = await discoverRateLimit(target, options);
  }

  return {
    ...discoveryResult,
    rateLimit: rateLimitInfo,
  };
}
```

### 2.4 Rate Limit Discovery Implementation

```typescript
// New file: src/redteam/extraction/rateLimit.ts
export async function discoverRateLimit(
  provider: ApiProvider,
  options?: { activeProbing?: boolean },
): Promise<RateLimitInfo> {
  // Step 1: Passive detection (always run - it's free)
  const headerInfo = await checkRateLimitHeaders(provider);
  if (headerInfo.detected) {
    return headerInfo;
  }

  // Step 2: Active probing (optional)
  if (options?.activeProbing) {
    return await probeRateLimit(provider);
  }

  return { detected: false, detectionMethod: 'none', confidence: 'high' };
}

async function checkRateLimitHeaders(provider: ApiProvider): Promise<RateLimitInfo> {
  try {
    const response = await provider.callApi('test');
    const headers = response.headers || {};

    // Check common rate limit headers
    const rateLimitHeaders = {
      limit:
        headers['x-ratelimit-limit'] || headers['x-rate-limit-limit'] || headers['ratelimit-limit'],
      remaining: headers['x-ratelimit-remaining'] || headers['x-rate-limit-remaining'],
      reset: headers['x-ratelimit-reset'] || headers['x-rate-limit-reset'],
      retryAfter: headers['retry-after'],
    };

    if (rateLimitHeaders.limit) {
      return parseRateLimitHeaders(rateLimitHeaders);
    }

    return { detected: false, detectionMethod: 'headers', confidence: 'high' };
  } catch (error) {
    return { detected: false, detectionMethod: 'headers', confidence: 'low' };
  }
}

// Optional active probing (minimal implementation)
async function probeRateLimit(provider: ApiProvider): Promise<RateLimitInfo> {
  const requests = 5;
  const timeWindow = 10; // seconds

  try {
    const startTime = Date.now();
    const results = [];

    for (let i = 0; i < requests; i++) {
      const requestStart = Date.now();
      const response = await provider.callApi('test');
      const requestEnd = Date.now();

      results.push({
        statusCode: response.error ? 429 : 200, // Assume 429 on error
        responseTime: requestEnd - requestStart,
        hasError: !!response.error,
      });

      // Small delay to avoid immediate blocking
      await sleep(100);
    }

    // Simple analysis
    const errorCount = results.filter((r) => r.hasError).length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

    if (errorCount > 0) {
      return {
        detected: true,
        detectionMethod: 'probing',
        confidence: errorCount > 2 ? 'high' : 'medium',
        // Rough estimate based on successful requests
        requestsPerSecond: Math.floor((requests - errorCount) / (timeWindow / 1000)),
      };
    }

    return { detected: false, detectionMethod: 'probing', confidence: 'medium' };
  } catch (error) {
    return { detected: false, detectionMethod: 'probing', confidence: 'low' };
  }
}
```

## 3. User Interface and Reporting

### 3.1 Discovery Console Output

```typescript
// Enhanced console output in discover.ts
if (discoveryResult?.rateLimit) {
  if (discoveryResult.rateLimit.detected) {
    logger.info(chalk.bold(chalk.green('\n5. Rate limiting information:\n')));

    if (discoveryResult.rateLimit.requestsPerSecond) {
      logger.info(`  • Limit: ${discoveryResult.rateLimit.requestsPerSecond} requests/second`);
    }
    if (discoveryResult.rateLimit.requestsPerMinute) {
      logger.info(`  • Limit: ${discoveryResult.rateLimit.requestsPerMinute} requests/minute`);
    }
    if (discoveryResult.rateLimit.burstCapacity) {
      logger.info(`  • Burst capacity: ${discoveryResult.rateLimit.burstCapacity} requests`);
    }

    logger.info(`  • Detection method: ${discoveryResult.rateLimit.detectionMethod}`);
    logger.info(`  • Confidence: ${discoveryResult.rateLimit.confidence}`);

    if (
      discoveryResult.rateLimit.headers &&
      Object.keys(discoveryResult.rateLimit.headers).length > 0
    ) {
      logger.info('  • Headers found:');
      Object.entries(discoveryResult.rateLimit.headers).forEach(([key, value]) => {
        logger.info(`    - ${key}: ${value}`);
      });
    }
  } else {
    logger.info(chalk.bold(chalk.yellow('\n5. Rate limiting information:\n')));
    logger.info('  • No rate limits detected');
    logger.info('  • Consider enabling active probing with --rate-limit-probing');
  }
}
```

### 3.2 Red Team Report UI

Add rate limit information to the red team report overview:

```typescript
// In src/app/src/pages/redteam/report/components/Overview.tsx
// Add new section for infrastructure information

interface InfrastructureInfo {
  rateLimit?: RateLimitInfo;
  // Future: other infrastructure characteristics
}

const InfrastructureOverview: React.FC<{ infrastructure?: InfrastructureInfo }> = ({
  infrastructure
}) => {
  if (!infrastructure?.rateLimit?.detected) return null;

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Infrastructure Characteristics
        </Typography>

        {infrastructure.rateLimit.detected && (
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Rate Limiting
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip
                label={`${infrastructure.rateLimit.requestsPerSecond || infrastructure.rateLimit.requestsPerMinute}/sec`}
                color="info"
                size="small"
              />
              <Typography variant="body2" color="text.secondary">
                Detected via {infrastructure.rateLimit.detectionMethod}
              </Typography>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
```

### 3.3 Test Configuration Integration

Use discovered rate limits to configure other red team tests:

```typescript
// When generating redteam config, include rate limit info
export async function generateRedTeamConfig(
  target: ApiProvider,
  options: RedTeamOptions,
): Promise<UnifiedConfig> {
  // Run discovery
  const discovery = await doTargetPurposeDiscovery(target, undefined, true, {
    includeRateLimitDiscovery: true,
  });

  // Calculate appropriate delays for other tests
  let delayBetweenTests = 0;
  if (discovery?.rateLimit?.detected) {
    const rps =
      discovery.rateLimit.requestsPerSecond ||
      (discovery.rateLimit.requestsPerMinute
        ? discovery.rateLimit.requestsPerMinute / 60
        : undefined);

    if (rps) {
      // Leave 50% headroom to avoid hitting limits during testing
      delayBetweenTests = Math.max(1000 / (rps * 0.5), 100); // minimum 100ms
    }
  }

  return {
    // ... existing config generation
    defaultTest: {
      metadata: {
        purpose: discovery?.purpose,
        entities: discovery?.entities || [],
        rateLimit: discovery?.rateLimit,
      },
      options: {
        // Apply rate limit-aware delays
        ...(delayBetweenTests > 0 && {
          delay: delayBetweenTests,
          // Reduce concurrency if rate limits detected
          concurrency: discovery?.rateLimit?.detected ? 1 : undefined,
        }),
      },
    },
  };
}
```

## 4. CLI Integration

### 4.1 Discovery Command Options

```typescript
// Add CLI options for rate limit discovery
export function discoverCommand(program: Command) {
  program
    .command('discover')
    .description('...')
    .option('-c, --config <path>', 'Path to promptfooconfig.yaml')
    .option('-t, --target <id>', 'Target ID from Promptfoo Cloud')
    // ADD: Rate limit options
    .option(
      '--rate-limit-probing',
      'Enable active rate limit probing (may send additional requests)',
    )
    .option('--skip-rate-limits', 'Skip rate limit discovery entirely')
    .action(async (options) => {
      // ... existing logic

      const discoveryOptions = {
        includeRateLimitDiscovery: !options.skipRateLimits,
        activeProbing: options.rateLimitProbing,
      };

      const discoveryResult = await doTargetPurposeDiscovery(
        target,
        undefined,
        true,
        discoveryOptions,
      );

      // ... existing output logic
    });
}
```

### 4.2 Red Team Setup Integration

```typescript
// In redteam setup, automatically include rate limit discovery
export async function setupRedTeam(options: SetupOptions) {
  logger.info('Discovering target characteristics...');

  const discovery = await doTargetPurposeDiscovery(options.target, undefined, true, {
    includeRateLimitDiscovery: true,
    activeProbing: options.rateLimitProbing,
  });

  if (discovery?.rateLimit?.detected) {
    logger.info(chalk.green('✓ Rate limits detected - will configure appropriate delays'));
  }

  // Generate config with rate limit awareness
  const config = await generateRedTeamConfig(options.target, {
    discovery,
    ...options,
  });

  // ... rest of setup logic
}
```

## 5. Configuration and Documentation

### 5.1 User Configuration Options

```yaml
# promptfooconfig.yaml
redteam:
  purpose: 'Customer service API'

  # Discovery options
  discovery:
    rateLimit:
      enabled: true # Default: true
      activeProbing: false # Default: false (requires explicit opt-in)
      confidence: medium # Minimum confidence level to use results

  # Other red team tests will automatically use discovered rate limits
  plugins:
    - harmful:self-harm
    - politics
```

### 5.2 Environment Variables

```bash
# Skip rate limit discovery entirely
PROMPTFOO_SKIP_RATE_LIMIT_DISCOVERY=true

# Enable active probing by default (not recommended for production)
PROMPTFOO_ENABLE_RATE_LIMIT_PROBING=true
```

### 5.3 Documentation Updates

**New documentation sections needed**:

1. **Discovery Documentation** (`docs/redteam/discovery.md`):
   - Rate limit detection capabilities
   - Active vs passive detection trade-offs
   - Interpreting rate limit results

2. **Configuration Documentation** (`docs/redteam/configuration.md`):
   - How discovered rate limits affect test configuration
   - Manual rate limit specification
   - Debugging rate limit issues

3. **Best Practices** (`docs/redteam/best-practices.md`):
   - When to use active probing
   - Production vs staging considerations
   - Ethical testing guidelines

## 6. Implementation Plan

### 6.1 Phase 1: Core Discovery (Week 1-2)

- [ ] Extend `TargetPurposeDiscoveryResult` type
- [ ] Implement `checkRateLimitHeaders()` function
- [ ] Integrate into existing discovery command
- [ ] Add console output for discovered rate limits
- [ ] Basic unit tests

### 6.2 Phase 2: Storage and Reporting (Week 3)

- [ ] Extend `EvaluateSummaryV2` schema
- [ ] Store discovery results in evaluation metadata
- [ ] Add basic UI display in red team reports
- [ ] Integration tests with sample APIs

### 6.3 Phase 3: Test Integration (Week 4)

- [ ] Use discovered rate limits in test configuration
- [ ] Add delays and concurrency adjustments
- [ ] CLI options for rate limit discovery
- [ ] Documentation updates

### 6.4 Phase 4: Active Probing (Week 5) - Optional

- [ ] Implement `probeRateLimit()` function with safety limits
- [ ] Add CLI flags and configuration options
- [ ] Enhanced reporting with probing results
- [ ] Safety and ethical guidelines

### 6.5 Phase 5: Polish (Week 6)

- [ ] Enhanced UI components
- [ ] Error handling and edge cases
- [ ] Performance optimization
- [ ] Comprehensive testing

## 7. Safety and Ethics

### 7.1 Active Probing Safeguards

Active probing is **optional** and includes safety measures:

1. **Minimal Load**: Maximum 5 requests over 10 seconds
2. **Respectful Delays**: 100ms minimum between requests
3. **Circuit Breaker**: Stop immediately if 429/503 responses
4. **Clear Opt-in**: Requires explicit `--rate-limit-probing` flag
5. **Documentation**: Clear warnings about production usage

### 7.2 Production Safety

```typescript
// Safety checks before probing
async function probeRateLimit(provider: ApiProvider): Promise<RateLimitInfo> {
  // Warn user about active probing
  logger.warn('Active rate limit probing enabled - this will send additional test requests');

  // Check if this looks like a production environment
  const providerId = provider.id();
  if (providerId.includes('prod') || providerId.includes('production')) {
    logger.warn('WARNING: This appears to be a production API. Consider using --skip-rate-limits');
  }

  // ... probing logic with conservative limits
}
```

## 8. Success Criteria

### 8.1 Technical Success

- [ ] Reliably detects rate limits from common header patterns
- [ ] Integrates seamlessly with existing discovery workflow
- [ ] Results are accessible in red team reports
- [ ] Other tests respect discovered rate limits
- [ ] Zero false positives from header detection

### 8.2 User Experience Success

- [ ] Users can discover rate limits with zero configuration
- [ ] Active probing is clearly opt-in with appropriate warnings
- [ ] Results are displayed clearly in both CLI and web UI
- [ ] Rate limit info helps users configure better tests
- [ ] Documentation is clear about when/how to use features

### 8.3 Safety Success

- [ ] No accidental DoS attacks from discovery
- [ ] Clear warnings for production usage
- [ ] Respectful request patterns even with active probing
- [ ] Users understand the impact of their choices

This revised plan focuses on practical value while maintaining engineering rigor. It integrates naturally with existing workflows and provides immediate benefits without over-engineering.
