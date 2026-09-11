---
title: 'Type Alias: FetchWithCacheResult<T>'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 1
---

## Import

```ts
import { cache } from 'promptfoo';

type Result = cache.FetchWithCacheResult<unknown>;
```

<!-- prettier-ignore -->
> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [src/cache.ts:338](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L338)

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

Defined in: [src/cache.ts:342](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L342)

Whether the response was served from cache.

---

### coalesced?

> `optional` **coalesced?**: `boolean`

Defined in: [src/cache.ts:344](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L344)

Another concurrent caller owns the upstream request that produced this response.

---

### data

> **data**: `T`

Defined in: [src/cache.ts:340](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L340)

Parsed response payload.

---

### deleteFromCache?

<!-- prettier-ignore -->
> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [src/cache.ts:354](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L354)

Delete this response from cache when it was cache-backed.

#### Returns

`Promise`\<`void`\>

---

### headers?

<!-- prettier-ignore -->
> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [src/cache.ts:350](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L350)

Response headers normalized to string values.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [src/cache.ts:352](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L352)

End-to-end fetch latency in milliseconds.

---

### status

> **status**: `number`

Defined in: [src/cache.ts:346](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L346)

HTTP response status code.

---

### statusText

> **statusText**: `string`

Defined in: [src/cache.ts:348](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L348)

HTTP response status text.

---

### updateCache?

<!-- prettier-ignore -->
> `optional` **updateCache?**: (`data`, `status`, `statusText`, `headers?`) => `Promise`\<`void`\>

Defined in: [src/cache.ts:355](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L355)

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
