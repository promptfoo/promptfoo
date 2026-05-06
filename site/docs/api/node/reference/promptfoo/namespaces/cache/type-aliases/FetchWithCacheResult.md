[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / FetchWithCacheResult

# Type Alias: FetchWithCacheResult\<T\>

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:291](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L291)

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

Defined in: [cache.ts:295](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L295)

Whether the response was served from cache.

---

### data

> **data**: `T`

Defined in: [cache.ts:293](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L293)

Parsed response payload.

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:305](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L305)

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:301](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L301)

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:303](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L303)

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: [cache.ts:297](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L297)

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:299](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L299)

HTTP response status text.
