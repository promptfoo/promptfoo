---
title: 'Type Alias: PromptFunction'
---

> **PromptFunction** = (`context`) => `Promise`\<[`PromptContent`](PromptContent.md) \| [`PromptFunctionResult`](../interfaces/PromptFunctionResult.md)\>

Defined in: [types/prompts.ts:115](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L115)

Function form accepted anywhere the Node.js API accepts a prompt.

Use prompt functions when the prompt must be assembled from runtime vars or
when each prompt needs provider-specific config.

## Parameters

### context

Rendered vars and the selected provider when one is available.

#### provider?

`ApiProvider`

Provider selected for this invocation when one is available.

#### vars

`Record`\<`string`, `VarValue`\>

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
