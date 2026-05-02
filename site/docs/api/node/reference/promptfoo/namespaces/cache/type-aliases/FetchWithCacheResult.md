[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / FetchWithCacheResult

# Type Alias: FetchWithCacheResult\<T\>

> **FetchWithCacheResult**\<`T`\> = `object`

Defined in: [cache.ts:223](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L223)

Metadata returned by `fetchWithCache()`.

## Type Parameters

### T

`T`

## Properties

### cached

> **cached**: `boolean`

Defined in: [cache.ts:225](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L225)

---

### data

> **data**: `T`

Defined in: [cache.ts:224](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L224)

---

### deleteFromCache?

> `optional` **deleteFromCache?**: () => `Promise`\<`void`\>

Defined in: [cache.ts:230](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L230)

#### Returns

`Promise`\<`void`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [cache.ts:228](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L228)

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [cache.ts:229](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L229)

---

### status

> **status**: `number`

Defined in: [cache.ts:226](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L226)

---

### statusText

> **statusText**: `string`

Defined in: [cache.ts:227](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/cache.ts#L227)
