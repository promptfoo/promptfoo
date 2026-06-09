---
title: 'Function: loadApiProviders()'
description: 'Load one or more providers from provider config input.'
sidebar_position: 5
---

## Import

```ts
import { loadApiProviders } from 'promptfoo';
```

> **loadApiProviders**(`providerPaths`, `options?`): `Promise`\<[`ApiProvider`](../interfaces/ApiProvider.md)[]\>

Defined in: [providers/index.ts:433](https://github.com/promptfoo/promptfoo/blob/main/src/providers/index.ts#L433)

Load one or more providers from provider config input.

Accepts the same provider forms supported by `evaluate()`: provider ids,
provider functions, provider objects, `file://` config references, or arrays
that mix those forms. The returned array preserves the input order after any
file-backed provider lists are expanded.

## Parameters

### providerPaths

[`ProvidersConfig`](../type-aliases/ProvidersConfig.md)

Provider config input to normalize into provider instances.

### options?

[`LoadApiProvidersOptions`](../interfaces/LoadApiProvidersOptions.md) = `{}`

Optional base path and environment overrides used while
loading providers.

## Returns

`Promise`\<[`ApiProvider`](../interfaces/ApiProvider.md)[]\>

Resolved provider instances ready for direct calls or reuse in an eval.

## Example

```ts
const providers = await loadApiProviders([
  'openai:chat:gpt-5.5',
  async (prompt) => ({ output: `Echo: ${prompt}` }),
]);
```
