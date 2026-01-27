---
title: Rate Limits
description: Configure automatic rate limit handling with exponential backoff, header-aware delays, and adaptive concurrency for LLM provider APIs.
sidebar_label: Rate Limits
sidebar_position: 15
---

# Rate Limits

Promptfoo automatically handles rate limits from LLM providers. When a provider returns HTTP 429 or similar rate limit errors, requests are automatically retried with exponential backoff.

## Automatic Handling

Rate limit handling is built into the evaluator and requires no configuration:

- **Automatic retry**: Failed requests are retried up to 3 times with exponential backoff
- **Header-aware delays**: Respects `retry-after` headers from providers
- **Adaptive concurrency**: Reduces concurrent requests when rate limits are hit
- **Per-provider isolation**: Each provider and API key has separate rate limit tracking

### Supported Headers

Promptfoo parses rate limit headers from major providers:

| Provider     | Headers                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| OpenAI       | `x-ratelimit-remaining-requests`, `x-ratelimit-limit-requests`, `x-ratelimit-remaining-tokens`, `retry-after-ms` |
| Anthropic    | `anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-tokens-remaining`, `retry-after`                  |
| Azure OpenAI | `x-ratelimit-remaining-requests`, `retry-after-ms`, `retry-after`                                                |
| Generic      | `retry-after`, `ratelimit-remaining`, `ratelimit-reset`                                                          |

### How Adaptive Concurrency Works

The scheduler uses AIMD (Additive Increase, Multiplicative Decrease) to optimize throughput:

1. When a rate limit is hit, concurrency is reduced by 50%
2. After sustained successful requests, concurrency increases by 1
3. When remaining quota drops below 10% (from headers), concurrency is proactively reduced

This allows you to set a higher `maxConcurrency` and let promptfoo find the optimal rate automatically.

## Configuration

### Concurrency

Control the maximum number of concurrent requests:

```yaml
evaluateOptions:
  maxConcurrency: 10
```

Or via CLI:

```bash
promptfoo eval --max-concurrency 10
```

The adaptive scheduler will reduce this if rate limits are encountered, but cannot exceed your configured maximum.

### Fixed Delay

Add a fixed delay between requests (in addition to any rate limit backoff):

```yaml
evaluateOptions:
  delay: 1000 # milliseconds
```

Or via CLI:

```bash
promptfoo eval --delay 1000
```

Or via environment variable:

```bash
PROMPTFOO_DELAY_MS=1000 promptfoo eval
```

### Backoff Configuration

Promptfoo has two retry layers:

1. **Provider-level retry** (scheduler): Retries `callApi()` with 1-second base backoff, up to 3 times
2. **HTTP-level retry**: Retries failed HTTP requests with configurable backoff

Environment variables for the scheduler:

| Environment Variable                   | Description                                | Default  |
| -------------------------------------- | ------------------------------------------ | -------- |
| `PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER` | Disable adaptive concurrency (use fixed)   | false    |
| `PROMPTFOO_MIN_CONCURRENCY`            | Minimum concurrency (floor for adaptive)   | 1        |
| `PROMPTFOO_SCHEDULER_QUEUE_TIMEOUT_MS` | Timeout for queued requests (0 to disable) | 300000ms |

Environment variables for HTTP-level retry:

| Environment Variable           | Description                       | Default |
| ------------------------------ | --------------------------------- | ------- |
| `PROMPTFOO_REQUEST_BACKOFF_MS` | Base delay for HTTP retry backoff | 5000ms  |
| `PROMPTFOO_RETRY_5XX`          | Retry on HTTP 500 errors          | false   |

Example:

```bash
PROMPTFOO_REQUEST_BACKOFF_MS=10000 PROMPTFOO_RETRY_5XX=true promptfoo eval
```

The scheduler's retry handles most rate limiting automatically. The HTTP-level retry provides additional resilience for network issues.

## Provider-Specific Notes

### OpenAI

OpenAI has separate rate limits for requests and tokens. The scheduler tracks both. For high-volume evaluations:

```yaml
evaluateOptions:
  maxConcurrency: 20 # Scheduler will adapt down if needed
```

See [OpenAI troubleshooting](/docs/providers/openai#troubleshooting) for additional options.

### Anthropic

Anthropic rate limits are typically per-minute. The scheduler respects `retry-after` headers from the API.

### Custom Providers

Custom providers trigger automatic retry when errors contain:

- "429"
- "rate limit"
- "too many requests"

To provide retry timing, include headers in your response metadata:

```javascript
return {
  output: 'response',
  metadata: {
    headers: {
      'retry-after': '60', // seconds
    },
  },
};
```

## Debugging

To see rate limit events, enable debug logging:

```bash
LOG_LEVEL=debug promptfoo eval -c config.yaml
```

Events logged:

- `ratelimit:hit` - Rate limit encountered
- `ratelimit:learned` - Provider limits discovered from headers
- `ratelimit:warning` - Approaching rate limit threshold
- `concurrency:decreased` / `concurrency:increased` - Adaptive concurrency changes
- `request:retrying` - Retry in progress

## Best Practices

1. **Start with higher concurrency** - Set `maxConcurrency` to your desired throughput; the scheduler will adapt down if needed

2. **Use caching** - Enable [caching](/docs/configuration/caching) to avoid re-running identical requests

3. **Monitor debug logs** - If evaluations are slow, check for frequent `ratelimit:hit` events

4. **Consider provider tiers** - Higher API tiers typically have higher rate limits; the scheduler will automatically use whatever limits the provider allows

## Disabling Automatic Handling

The scheduler is always active but has minimal overhead. For fully deterministic behavior (e.g., in tests), use:

```yaml
evaluateOptions:
  maxConcurrency: 1
  delay: 1000
```

This ensures sequential execution with fixed delays between requests.
