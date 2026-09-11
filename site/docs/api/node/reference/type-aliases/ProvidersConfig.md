---
title: 'Type Alias: ProvidersConfig'
description: 'Provider input accepted by evaluate() and loadApiProviders(). See supported Node.js imports, exact signatures, fields, and application examples for this symbol.'
sidebar_position: 10
---

## Import

```ts
import type { ProvidersConfig } from 'promptfoo';
```

> **ProvidersConfig** = `ProviderId` \| [`ProviderFunction`](ProviderFunction.md) \| [`ApiProvider`](../interfaces/ApiProvider.md) \| [`ProviderConfig`](ProviderConfig.md)[]

Defined in: types/providers.ts:89

Provider input accepted by `evaluate()` and `loadApiProviders()`.

Pass one provider id, provider function, provider object, or an array that
mixes the supported provider config forms.

## Example

```ts
const providers: ProvidersConfig = [
  'openai:chat:gpt-5.5',
  async (prompt) => ({ output: `Echo: ${prompt}` }),
];
```
