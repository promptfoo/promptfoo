---
title: 'Function: clearCache()'
description: 'Clear the shared promptfoo cache. This generated page documents the supported promptfoo Node.js API contract, import form, and relevant fields for application.'
sidebar_position: 1
---

## Import

```ts
import { cache } from 'promptfoo';
```

> **clearCache**(): `Promise`\<`boolean`\>

Defined in: [cache.ts:916](https://github.com/promptfoo/promptfoo/blob/main/src/cache.ts#L916)

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
