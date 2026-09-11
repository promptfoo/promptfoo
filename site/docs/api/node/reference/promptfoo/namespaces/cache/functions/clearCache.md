---
title: 'Function: clearCache()'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 1
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **clearCache**(): `Promise`\<`boolean`>>\>

Defined in: cache.ts:1046

Clear the shared promptfoo cache.

Use this when tests or scripts need to remove existing shared entries before
running a fresh request path.

## Returns

`Promise`\<`boolean`\>

`true` after the active cache store has been cleared.

## Example

```ts
import { cache } from 'promptfoo';

await cache.clearCache();
```
