---
title: 'Type Alias: ProviderConfig'
description: 'Provider override accepted anywhere a single provider configuration is allowed.'
sidebar_position: 8
---

## Import

```ts
import type { ProviderConfig } from 'promptfoo';
```

> **ProviderConfig** = `ProviderId` \| [`ProviderFunction`](ProviderFunction.md) \| [`ApiProvider`](../interfaces/ApiProvider.md) \| [`ProviderOptions`](../interfaces/ProviderOptions.md) \| `ProviderOptionsMap`

Defined in: [types/providers.ts:67](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L67)

Provider override accepted anywhere a single provider configuration is allowed.

Use a string for a built-in provider id, a function for a small custom
provider, or an object when you need labels, env overrides, transforms, or
other provider options.

## Example

```ts
const provider: ProviderConfig = {
  id: 'openai:chat:gpt-5.5',
  label: 'primary',
};
```
