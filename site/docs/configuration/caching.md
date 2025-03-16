---
sidebar_position: 40
---

# Caching

promptfoo caches the results of API calls to LLM providers to help save time and cost.

The cache is managed by [`cache-manager`](https://www.npmjs.com/package/cache-manager/) with the [`cache-manager-fs-hash`](https://www.npmjs.com/package/cache-manager-fs-hash) store for disk-based caching. By default, promptfoo uses disk-based storage (`~/.promptfoo/cache`).

## How Caching Works

### Cache Keys

Cache entries are stored using composite keys that include:

- Provider identifier
- Prompt content
- Provider configuration
- Context variables (when applicable)

For example:

```js
// OpenAI - model, messages, settings
`openai:gpt-4:${JSON.stringify({
  "messages": [...],
  "temperature": 0
})}`

// HTTP - URL and request details
`fetch:v2:https://api.example.com/v1/chat:${JSON.stringify({
  "method": "POST",
  "body": {...}
})}`
```

### Cache Behavior

- Successful API responses are cached with their complete response data
- Error responses are not cached to allow for retry attempts
- Cache is automatically invalidated when:
  - TTL expires (default: 14 days)
  - Cache size exceeds limit (default: 10MB)
  - Cache file count exceeds limit (default: 10,000)
  - Cache is manually cleared
- Memory storage is used automatically when `NODE_ENV=test`

## Command Line

If you're using the command line, call `promptfoo eval` with `--no-cache` to disable the cache, or set `{ evaluateOptions: { cache: false }}` in your config file.

Use `promptfoo cache clear` command to clear the cache.

## Node package

Set `EvaluateOptions.cache` to false to disable cache:

```js
promptfoo.evaluate(testSuite, {
  cache: false,
});
```

## Tests

If you're integrating with [jest or vitest](/docs/integrations/jest), [mocha](/docs/integrations/mocha-chai), or any other external framework, you'll probably want to set the following for CI:

```sh
PROMPTFOO_CACHE_TYPE=disk
PROMPTFOO_CACHE_PATH=...
```

## Configuration

The cache is configurable through environment variables:

| Environment Variable           | Description                               | Default Value                                      |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------- |
| PROMPTFOO_CACHE_ENABLED        | Enable or disable the cache               | true                                               |
| PROMPTFOO_CACHE_TYPE           | `disk` or `memory`                        | `memory` if `NODE_ENV` is `test`, otherwise `disk` |
| PROMPTFOO_CACHE_MAX_FILE_COUNT | Maximum number of files in the cache      | 10,000                                             |
| PROMPTFOO_CACHE_PATH           | Path to the cache directory               | `~/.promptfoo/cache`                               |
| PROMPTFOO_CACHE_TTL            | Time to live for cache entries in seconds | 14 days                                            |
| PROMPTFOO_CACHE_MAX_SIZE       | Maximum size of the cache in bytes        | 10 MB                                              |

#### Additional Cache Details

- Rate limit responses (HTTP 429) are automatically handled with exponential backoff
- Empty responses are not cached
- HTTP 500 responses can be retried by setting `PROMPTFOO_RETRY_5XX=true`

## Managing the Cache

### Clearing the Cache

You can clear the cache in several ways:

1. Using the CLI command:

```bash
promptfoo cache clear
```

2. Through the Node.js API:

```javascript
const promptfoo = require('promptfoo');
await promptfoo.cache.clearCache();
```

3. Manually delete the cache directory:

```bash
rm -rf ~/.promptfoo/cache
```

### Cache Busting

You can force a cache miss in two ways:

1. Pass `--no-cache` to the CLI:

```bash
promptfoo eval --no-cache
```

2. Set cache busting in code:

```javascript
const result = await fetchWithCache(url, options, timeout, 'json', true); // Last param forces cache miss
```
