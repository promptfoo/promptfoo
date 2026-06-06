---
title: 'Type Alias: ProvidersConfig'
description: 'Provider input accepted by evaluate() and loadApiProviders().'
---

## Import

```ts
import type { ProvidersConfig } from 'promptfoo';
```

> **ProvidersConfig** = `ProviderId` \| [`ProviderFunction`](ProviderFunction.md) \| [`ApiProvider`](../interfaces/ApiProvider.md) \| [`ProviderConfig`](ProviderConfig.md)[]

Defined in: [types/providers.ts:89](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L89)

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
