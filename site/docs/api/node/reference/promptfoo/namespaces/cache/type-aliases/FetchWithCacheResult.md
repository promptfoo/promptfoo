---
title: "Type Alias: FetchWithCacheResult\\<T\\>"
description: 'Metadata returned by fetchWithCache().'
sidebar_position: 1
---

## Import

```ts
import { cache } from 'promptfoo';

type Result = cache.FetchWithCacheResult<unknown>;
```

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:318](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L318)

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

Defined in: [cache.ts:322](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L322)

Whether the response was served from cache.

---

### data

> **data**: `T`

Defined in: [cache.ts:320](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L320)

Parsed response payload.

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:332](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L332)

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:328](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L328)

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:330](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L330)

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: [cache.ts:324](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L324)

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:326](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L326)

HTTP response status text.
