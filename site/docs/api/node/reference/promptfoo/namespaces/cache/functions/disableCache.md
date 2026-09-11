---
title: 'Function: disableCache()'
description: 'Disable the shared promptfoo cache for future calls. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 2
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **disableCache**(): `void`

Defined in: [src/cache.ts:1025](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L1025)

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
