---
title: 'Type Alias: ProviderFunction'
description: 'Function form accepted anywhere the Node.js API accepts a provider.'
---

## Import

```ts
import type { ProviderFunction } from 'promptfoo';
```

> **ProviderFunction** = [`CallApiFunction`](../interfaces/CallApiFunction.md)

Defined in: [types/providers.ts:48](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L48)

Function form accepted anywhere the Node.js API accepts a provider.

Use a function when the provider is easiest to express inline. Use an
`ApiProvider` object instead when you need additional capabilities such as
embeddings, similarity, or classification methods.

## Example

```ts
const provider: ProviderFunction = async (prompt) => ({
  output: `Echo: ${prompt}`,
});
```
