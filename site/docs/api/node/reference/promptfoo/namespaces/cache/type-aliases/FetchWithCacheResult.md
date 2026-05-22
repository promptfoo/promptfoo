---
title: "Type Alias: FetchWithCacheResult\\<T\\>"
description: 'Metadata returned by fetchWithCache().'
---

## Import

```ts
import { cache } from 'promptfoo';

type Result = cache.FetchWithCacheResult<unknown>;
```

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:319](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L319)

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

Defined in: [cache.ts:323](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L323)

Whether the response was served from cache.

---

### data

> **data**: `T`

Defined in: [cache.ts:321](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L321)

Parsed response payload.

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:333](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L333)

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:329](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L329)

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:331](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L331)

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: [cache.ts:325](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L325)

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:327](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L327)

HTTP response status text.
