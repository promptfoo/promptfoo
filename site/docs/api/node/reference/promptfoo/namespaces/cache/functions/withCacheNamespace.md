[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / withCacheNamespace

# Function: withCacheNamespace()

> **withCacheNamespace**\<`T`\>(`namespace`, `fn`): `Promise`\<`T`\>

Defined in: [cache.ts:228](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L228)

Run an async operation inside an isolated cache namespace.

Namespaces are useful when two related runs should not reuse each other's
cached responses, such as baseline and candidate comparisons.

## Type Parameters

### T

`T`

## Parameters

### namespace

`string` \| `undefined`

### fn

() => `Promise`\<`T`\>

## Returns

`Promise`\<`T`\>

## Example

```ts
import { cache, evaluate } from 'promptfoo';

const baseline = await cache.withCacheNamespace('baseline', () => evaluate(baselineSuite));
const candidate = await cache.withCacheNamespace('candidate', () => evaluate(candidateSuite));
```
