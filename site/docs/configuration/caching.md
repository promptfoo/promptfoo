---
sidebar_position: 40
---

# Caching

promptfoo's caching system stores API responses from LLM providers locally, reducing costs and latency by reusing identical requests.

## Quick Start

```bash
# Disable cache for a single run
$ promptfoo eval --no-cache
# Or in promptfooconfig.yaml:
# evaluateOptions:
#   cache: false

# Clear the cache
$ promptfoo cache clear
```

```js
// Disable cache in code
promptfoo.evaluate(testSuite, {
  cache: false,
});
```

For CI environments and testing frameworks ([jest](/docs/integrations/jest), [mocha](/docs/integrations/mocha-chai)):

```env
PROMPTFOO_CACHE_TYPE=disk
PROMPTFOO_CACHE_PATH=/path/to/cache
```

## Important Notes

Caching is enabled by default but should be disabled when:

- Testing prompt changes
- Using dynamic content (e.g., signed URLs, timestamps)
- Working with non-deterministic responses
- Debugging provider-specific issues

You can disable caching with `--no-cache` flag or `PROMPTFOO_CACHE_ENABLED=false`.

## Cache Keys

Each provider uses different cache keys:

```js
// OpenAI - model, messages, settings
openai:gpt-4:{
  "messages": [...],
  "temperature": 0
}

// Python - script hash, prompt, options
python:script.py:call_api:{fileHash}:{prompt}:{options}

// HTTP - URL and request details
fetch:v2:https://api.example.com/v1/chat:{
  "method": "POST",
  "body": {...}
}
```

Note: Only successful responses are cached. Error responses, failed requests, and malformed responses are not cached to prevent caching transient errors.

## Configuration

Default configuration works well for most cases. If needed:

| Environment Variable           | Description                               | Default Value                        |
| ------------------------------ | ----------------------------------------- | ------------------------------------ |
| PROMPTFOO_CACHE_ENABLED        | Enable or disable the cache               | true                                 |
| PROMPTFOO_CACHE_TYPE           | `disk` or `memory`                        | `disk` (`memory` if `NODE_ENV=test`) |
| PROMPTFOO_CACHE_PATH           | Path to the cache directory               | `~/.promptfoo/cache`                 |
| PROMPTFOO_CACHE_TTL            | Time to live for cache entries in seconds | 14 days                              |
| PROMPTFOO_CACHE_MAX_SIZE       | Maximum size of the cache in bytes        | 10 MB                                |
| PROMPTFOO_CACHE_MAX_FILE_COUNT | Maximum number of files in the cache      | 10,000                               |

Cache entries are invalidated when:

- TTL expires (default: 14 days)
- Cache size exceeds limit (default: 10MB)
- Cache file count exceeds limit (default: 10,000)
- Cache is manually cleared
- For Python providers: when script content changes
- For HTTP providers: when request parameters change
