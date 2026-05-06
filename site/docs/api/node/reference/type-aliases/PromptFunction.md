[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptFunction

# Type Alias: PromptFunction

> **PromptFunction** = (`context`) => `Promise`\<[`PromptContent`](PromptContent.md) \| [`PromptFunctionResult`](../interfaces/PromptFunctionResult.md)\>

Defined in: [types/prompts.ts:99](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L99)

Function form accepted anywhere the Node.js API accepts a prompt.

Use prompt functions when the prompt must be assembled from runtime vars or
when each prompt needs provider-specific config.

## Parameters

### context

Rendered vars and the selected provider when one is available.

#### provider?

`ApiProvider`

#### vars

`Record`\<`string`, `VarValue`\>

## Returns

`Promise`\<[`PromptContent`](PromptContent.md) \| [`PromptFunctionResult`](../interfaces/PromptFunctionResult.md)\>

## Example

```ts
const prompt: PromptFunction = async ({ vars }) => ({
  prompt: `Summarize ${vars.topic}`,
  config: { temperature: 0.2 },
});
```
