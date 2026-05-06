[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / getCache

# Function: getCache()

> **getCache**(): `Cache`

Defined in: [cache.ts:67](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L67)

Return the active promptfoo cache instance.

Most callers should prefer the higher-level cache helpers. Reach for the raw
cache only when a custom provider needs to manage its own cached values.

## Returns

`Cache`

The active cache instance for the current namespace.

## Example

```ts
import { cache } from 'promptfoo';

const value = await cache.getCache().get('provider:last-response');
```
