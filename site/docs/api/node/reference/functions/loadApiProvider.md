---
title: 'Function: loadApiProvider()'
description: 'Load one provider by id or config-file reference.'
sidebar_position: 4
---

## Import

```ts
import { loadApiProvider } from 'promptfoo';
```

> **loadApiProvider**(`providerPath`, `context?`): `Promise`\<[`ApiProvider`](../interfaces/ApiProvider.md)\>

Defined in: [providers/index.ts:103](https://github.com/promptfoo/promptfoo/blob/main/src/providers/index.ts#L103)

Load one provider by id or config-file reference.

Use this when you need to construct a provider before passing it into another
public API. For ordinary evals, passing provider refs directly to `evaluate()`
is usually simpler.

## Parameters

### providerPath

`string`

Provider id or supported provider config file reference.

### context?

[`LoadApiProviderContext`](../interfaces/LoadApiProviderContext.md) = `{}`

Optional base path, environment overrides, and provider
options.

## Returns

`Promise`\<[`ApiProvider`](../interfaces/ApiProvider.md)\>

A resolved provider instance.

## Example

```ts
const provider = await loadApiProvider('openai:chat:gpt-5.5');
const response = await provider.callApi('Hello');
```
