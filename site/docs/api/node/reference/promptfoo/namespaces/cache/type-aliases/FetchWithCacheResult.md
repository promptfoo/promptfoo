[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / FetchWithCacheResult

# Type Alias: FetchWithCacheResult\<T\>

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:257](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L257)

Metadata returned by `fetchWithCache()`.

## Type Parameters

### T

`T`

## Properties

### cached

> **cached**: `boolean`

Defined in: [cache.ts:261](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L261)

Whether the response was served from cache.

---

### data

> **data**: `T`

Defined in: [cache.ts:259](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L259)

Parsed response payload.

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:271](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L271)

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:267](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L267)

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:269](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L269)

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: [cache.ts:263](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L263)

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:265](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L265)

HTTP response status text.
