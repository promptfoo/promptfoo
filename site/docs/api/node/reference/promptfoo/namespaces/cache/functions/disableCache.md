---
title: 'Function: disableCache()'
description: 'Disable the shared promptfoo cache for future calls.'
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **disableCache**(): `void`

Defined in: [cache.ts:886](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L886)

Disable the shared promptfoo cache for future calls.

This changes process-level cache behavior for subsequent calls; it does not
delete entries that are already stored.

## Returns

`void`

## Example

```ts
import { cache } from 'promptfoo';

cache.disableCache();
```
