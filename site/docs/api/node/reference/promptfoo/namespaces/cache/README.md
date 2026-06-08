---
title: 'cache'
description: 'Cache helpers exposed through the Node.js package.'
sidebar_position: 1
---

## Import

```ts
import { cache } from 'promptfoo';
```

Cache helpers exposed through the Node.js package.

Use this namespace when custom providers need shared cache access or when
related evals need isolated cache namespaces.

## Example

```ts
import { cache } from 'promptfoo';

await cache.withCacheNamespace('preview', async () => {
  await cache.getCache().set('last-provider', 'openai:chat:gpt-5.5');
});
```

## Type Aliases

- [FetchWithCacheResult](type-aliases/FetchWithCacheResult.md)

## Functions

- [clearCache](functions/clearCache.md)
- [disableCache](functions/disableCache.md)
- [enableCache](functions/enableCache.md)
- [fetchWithCache](functions/fetchWithCache.md)
- [getCache](functions/getCache.md)
- [isCacheEnabled](functions/isCacheEnabled.md)
- [withCacheNamespace](functions/withCacheNamespace.md)
