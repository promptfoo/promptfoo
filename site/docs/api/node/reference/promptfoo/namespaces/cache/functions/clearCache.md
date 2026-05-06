[**promptfoo**](../../../../README.md)

---

[promptfoo](../../../../README.md) / [cache](../README.md) / clearCache

# Function: clearCache()

> **clearCache**(): `Promise`\<`boolean`\>

Defined in: [cache.ts:740](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L740)

Clear the shared promptfoo cache.

## Returns

`Promise`\<`boolean`\>

`true` after the active cache store has been cleared.

## Example

```ts
import { cache } from 'promptfoo';

await cache.clearCache();
```
