---
title: "Type Alias: FetchWithCacheResult\\<T\\>"
description: "<!-- prettier-ignore --> > FetchWithCacheResult\\<T\\> = object See supported Node.js imports, exact signatures, fields, and application examples for this symbol."
sidebar_position: 1
---

## Import

```ts
import { cache } from 'promptfoo';

type Result = cache.FetchWithCacheResult<unknown>;
```

<!-- prettier-ignore -->
> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: cache.ts:338

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

Defined in: cache.ts:342

Whether the response was served from cache.

---

### coalesced?

> `optional` **coalesced?**: `boolean`

Defined in: cache.ts:344

Another concurrent caller owns the upstream request that produced this response.

---

### data

> **data**: `T`

Defined in: cache.ts:340

Parsed response payload.

---

### deleteFromCache?

<!-- prettier-ignore -->
> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: cache.ts:354

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

<!-- prettier-ignore -->
> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: cache.ts:350

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: cache.ts:352

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: cache.ts:346

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: cache.ts:348

HTTP response status text.

---

### updateCache?

<!-- prettier-ignore -->
> `optional` **updateCache?**: (`data`, `status`, `statusText`, `headers?`) => `Promise`\<`void`\>

Defined in: cache.ts:355

#### Parameters

##### data

`unknown`

##### status

`number`

##### statusText

`string`

##### headers?

`Record`\<`string`, `string`\>

#### Returns

`Promise`\<`void`\>
