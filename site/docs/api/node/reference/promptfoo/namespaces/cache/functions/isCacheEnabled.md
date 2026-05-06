---
title: 'Function: isCacheEnabled()'
---

> **isCacheEnabled**(): `boolean`

Defined in: [cache.ts:774](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L774)

Return whether the shared promptfoo cache is enabled.

## Returns

`boolean`

`true` when cache reads and writes are enabled for the current call.

## Example

```ts
import { cache } from 'promptfoo';

if (cache.isCacheEnabled()) {
  console.log('cache is active');
}
```
