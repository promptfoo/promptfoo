[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / FetchWithCacheResult

# Type Alias: FetchWithCacheResult\<T\>

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:274](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L274)

Metadata returned by `fetchWithCache()`.

## Example

```ts
const result: FetchWithCacheResult<{ ok: boolean }> = {
  data: { ok: true },
  cached: false,
  status: 200,
  statusText: 'OK',
};
```

## Type Parameters

### T

`T`

## Properties

### cached

> **cached**: `boolean`

Defined in: [cache.ts:278](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L278)

Whether the response was served from cache.

---

### data

> **data**: `T`

Defined in: [cache.ts:276](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L276)

Parsed response payload.

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:288](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L288)

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:284](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L284)

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:286](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L286)

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: [cache.ts:280](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L280)

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:282](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L282)

HTTP response status text.
