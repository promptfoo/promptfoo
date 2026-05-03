[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / fetchWithCache

# Function: fetchWithCache()

> **fetchWithCache**\<`T`\>(`url`, `options?`, `timeout?`, `format?`, `bust?`, `maxRetries?`): `Promise`\<[`FetchWithCacheResult`](../type-aliases/FetchWithCacheResult.md)\<`T`\>\>

Defined in: [cache.ts:535](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L535)

Fetch a URL through promptfoo's retrying cache wrapper.

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
