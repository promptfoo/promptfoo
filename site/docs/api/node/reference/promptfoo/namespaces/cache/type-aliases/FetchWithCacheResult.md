---
title: "Type Alias: FetchWithCacheResult\\<T\\>"
---

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:302](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L302)

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

Parsed response payload type.

## Properties

### cached

> **cached**: `boolean`

Defined in: [cache.ts:306](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L306)

Whether the response was served from cache.

---

### data

> **data**: `T`

Defined in: [cache.ts:304](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L304)

Parsed response payload.

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:316](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L316)

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:312](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L312)

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:314](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L314)

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: [cache.ts:308](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L308)

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:310](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L310)

HTTP response status text.
