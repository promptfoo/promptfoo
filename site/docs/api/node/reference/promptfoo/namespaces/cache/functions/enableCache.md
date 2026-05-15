---
title: 'Function: enableCache()'
description: 'Enable the shared promptfoo cache.'
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **enableCache**(): `void`

Defined in: [cache.ts:744](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L744)

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
