[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / FetchWithCacheResult

# Type Alias: FetchWithCacheResult\<T\>

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:264](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L264)

Metadata returned by `fetchWithCache()`.

## Type Parameters

### T

`T`

## Properties

### cached

> **cached**: `boolean`

Defined in: [cache.ts:268](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L268)

Whether the response was served from cache.

---

### data

> **data**: `T`

Defined in: [cache.ts:266](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L266)

Parsed response payload.

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:278](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L278)

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:274](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L274)

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:276](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L276)

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: [cache.ts:270](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L270)

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:272](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L272)

HTTP response status text.
