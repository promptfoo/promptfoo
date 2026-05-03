[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / FetchWithCacheResult

# Type Alias: FetchWithCacheResult\<T\>

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:249](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L249)

Metadata returned by `fetchWithCache()`.

## Type Parameters

### T

`T`

## Properties

### cached

> **cached**: `boolean`

Defined in: [cache.ts:251](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L251)

---

### data

> **data**: `T`

Defined in: [cache.ts:250](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L250)

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:256](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L256)

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:254](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L254)

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:255](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L255)

---

### status

> **status**: `number`

Defined in: [cache.ts:252](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L252)

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:253](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L253)
