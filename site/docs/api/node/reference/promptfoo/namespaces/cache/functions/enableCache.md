---
title: 'Function: enableCache()'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 3
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **enableCache**(): `void`

Defined in: [src/cache.ts:1006](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L1006)

Enable the shared promptfoo cache.

Call this after a previous `disableCache()` when later work in the same
process should resume normal cache reads and writes.

## Returns

`void`

## Example

```ts
import { cache } from 'promptfoo';

cache.enableCache();
```
