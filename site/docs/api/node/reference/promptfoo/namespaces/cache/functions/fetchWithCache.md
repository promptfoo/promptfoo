---
title: 'Function: fetchWithCache()'
description: "Fetch a URL through promptfoo's retrying cache wrapper."
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **fetchWithCache**\<`T`\>(`url`, `options?`, `timeout?`, `format?`, `bustOrOptions?`, `maxRetries?`): `Promise`\<[`FetchWithCacheResult`](../type-aliases/FetchWithCacheResult.md)\<`T`\>\>

Defined in: [cache.ts:648](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L648)

Fetch a URL through promptfoo's retrying cache wrapper.

Use this in custom providers when you want the same retry and response-cache
behavior as built-in HTTP-backed providers.

## Type Parameters

### T

`T` = `unknown`

Parsed response payload type returned from JSON mode.

## Parameters

### url

`RequestInfo`

Target URL or `Request` to fetch.

### options?

`RequestInit` = `{}`

Fetch options (method, headers, body) passed through to the
underlying request.

### timeout?

`number` = `...`

Request timeout in milliseconds. Defaults to the value of the
`REQUEST_TIMEOUT_MS` environment variable.

### format?

`"text"` \| `"json"`

`'json'` (default) parses the response body as JSON;
`'text'` returns the raw response body unchanged.

### bustOrOptions?

`boolean` \| `CacheOptions` \| `undefined`

Skip the cache, or provide per-request cache options.

### maxRetries?

`number`

Maximum retry attempts on transient errors. Defaults to
the value of `PROMPTFOO_REQUEST_BACKOFF_MS` / built-in retry policy.

## Returns

`Promise`\<[`FetchWithCacheResult`](../type-aliases/FetchWithCacheResult.md)\<`T`\>\>

Parsed response data plus cache and HTTP metadata.

## Throws

When `format` is `'json'` and the response body is not valid JSON.

## Example

```ts
import { cache } from 'promptfoo';

type Echo = { args: Record<string, string> };
const { data, cached } = await cache.fetchWithCache<Echo>(
  'https://httpbin.org/get?model=gpt-4o-mini',
);
console.log(cached, data.args.model);
```
