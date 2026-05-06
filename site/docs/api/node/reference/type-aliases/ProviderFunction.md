---
title: 'Type Alias: ProviderFunction'
---

> **ProviderFunction** = [`CallApiFunction`](../interfaces/CallApiFunction.md)

Defined in: [types/providers.ts:24](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L24)

Function form accepted anywhere the Node.js API accepts a provider.

## Example

```ts
const provider: ProviderFunction = async (prompt) => ({
  output: `Echo: ${prompt}`,
});
```
