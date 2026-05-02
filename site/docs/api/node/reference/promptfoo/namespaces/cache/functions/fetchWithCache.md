[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / fetchWithCache

# Function: fetchWithCache()

> **fetchWithCache**\<`T`\>(`url`, `options?`, `timeout?`, `format?`, `bust?`, `maxRetries?`): `Promise`\<[`FetchWithCacheResult`](../type-aliases/FetchWithCacheResult.md)\<`T`\>\>

Defined in: [cache.ts:517](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L517)

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
