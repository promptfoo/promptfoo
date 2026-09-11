---
title: 'Type Alias: PromptFunction'
description: "<!-- prettier-ignore --> > PromptFunction = (context) => Promise\\<PromptContent \\| PromptFunctionResult\\> See supported imports and signatures for this symbol."
sidebar_position: 7
---

## Import

```ts
import type { PromptFunction } from 'promptfoo';
```

<!-- prettier-ignore -->
> **PromptFunction** = (`context`) => `Promise`\<[`PromptContent`](PromptContent.md) \| [`PromptFunctionResult`](../interfaces/PromptFunctionResult.md)\>

Defined in: contracts/prompts.ts:122

Function form accepted anywhere the Node.js API accepts a prompt.

Use prompt functions when the prompt must be assembled from runtime vars or
when each prompt needs provider-specific config.

## Parameters

### context

Rendered vars and the selected provider when one is available.

#### provider?

`MinimalApiProvider`

Provider selected for this invocation when one is available.

#### vars

`Record`\<`string`, `string` \| `any`\>

Rendered variables for the current test case.

## Returns

`Promise`\<[`PromptContent`](PromptContent.md) \| [`PromptFunctionResult`](../interfaces/PromptFunctionResult.md)\>

## Example

```ts
const prompt: PromptFunction = async ({ vars }) => ({
  prompt: `Summarize ${vars.topic}`,
  config: { temperature: 0.2 },
});
```
