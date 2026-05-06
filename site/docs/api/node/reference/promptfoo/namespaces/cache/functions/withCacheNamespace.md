[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / withCacheNamespace

# Function: withCacheNamespace()

> **withCacheNamespace**\<`T`\>(`namespace`, `fn`): `Promise`\<`T`\>

Defined in: [cache.ts:245](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L245)

Run an async operation inside an isolated cache namespace.

Namespaces are useful when two related runs should not reuse each other's
cached responses, such as baseline and candidate comparisons.

## Type Parameters

### T

`T`

## Parameters

### namespace

`string` \| `undefined`

Namespace suffix to apply for the duration of the call.
Pass `undefined` to reuse the current namespace unchanged.

### fn

() => `Promise`\<`T`\>

Async operation to run inside the scoped namespace.

## Returns

`Promise`\<`T`\>

The value returned by `fn`.

## Example

```ts
import { cache, evaluate } from 'promptfoo';

const baseline = await cache.withCacheNamespace('baseline', () => evaluate(baselineSuite));
const candidate = await cache.withCacheNamespace('candidate', () => evaluate(candidateSuite));
```
