---
title: 'Function: isCacheEnabled()'
description: 'Return whether the shared promptfoo cache is enabled. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 6
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **isCacheEnabled**(): `boolean`

Defined in: cache.ts:1078

Return whether the shared promptfoo cache is enabled.

This reports the effective state for the current call context, including any
scoped override applied by internal helpers.

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
