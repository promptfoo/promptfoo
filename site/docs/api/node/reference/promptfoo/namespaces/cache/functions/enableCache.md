---
title: 'Function: enableCache()'
description: 'Enable the shared promptfoo cache. This generated page documents the supported promptfoo Node.js API contract, import form, and relevant fields for API.'
sidebar_position: 3
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **enableCache**(): `void`

Defined in: [cache.ts:876](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L876)

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
