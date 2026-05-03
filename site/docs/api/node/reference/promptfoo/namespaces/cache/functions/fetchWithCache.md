[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / fetchWithCache

# Function: fetchWithCache()

> **fetchWithCache**\<`T`\>(`url`, `options?`, `timeout?`, `format?`, `bust?`, `maxRetries?`): `Promise`\<[`FetchWithCacheResult`](../type-aliases/FetchWithCacheResult.md)\<`T`\>\>

Defined in: [cache.ts:553](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L553)

Fetch a URL through promptfoo's retrying cache wrapper.

Use this in custom providers when you want the same retry and response-cache
behavior as built-in HTTP-backed providers.

## Type Parameters

### T

`T` = `unknown`

## Parameters

### url

`RequestInfo`

### options?

`RequestInit` = `{}`

### timeout?

`number` = `...`

### format?

`"text"` \| `"json"`

### bust?

`boolean` = `false`

### maxRetries?

`number`

## Returns

`Promise`\<[`FetchWithCacheResult`](../type-aliases/FetchWithCacheResult.md)\<`T`\>\>

## Example

```ts
const { data, cached } = await fetchWithCache<{ ok: boolean }>('https://example.com/status');
```
