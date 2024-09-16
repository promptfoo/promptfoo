---
sidebar_position: 40
---

# Caching

promptfoo caches the results of API calls to LLM providers. This helps save time and cost.

## Command line

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
