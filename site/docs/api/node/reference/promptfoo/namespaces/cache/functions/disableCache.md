---
title: 'Function: disableCache()'
description: 'Disable the shared promptfoo cache for future calls.'
sidebar_position: 2
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **disableCache**(): `void`

Defined in: [cache.ts:894](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L894)

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
