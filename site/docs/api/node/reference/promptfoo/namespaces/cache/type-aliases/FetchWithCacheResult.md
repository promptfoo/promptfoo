[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / FetchWithCacheResult

# Type Alias: FetchWithCacheResult\<T\>

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:241](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L241)

Metadata returned by `fetchWithCache()`.

## Type Parameters

### T

`T`

## Properties

### cached

> **cached**: `boolean`

Defined in: [cache.ts:243](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L243)

---

### data

> **data**: `T`

Defined in: [cache.ts:242](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L242)

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:248](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L248)

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:246](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L246)

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:247](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L247)

---

### status

> **status**: `number`

Defined in: [cache.ts:244](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L244)

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:245](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L245)
