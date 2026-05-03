[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptFunction

# Interface: PromptFunction()

Defined in: [types/prompts.ts:70](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L70)

Function form accepted anywhere the Node.js API accepts a prompt.

Use prompt functions when the prompt must be assembled from runtime vars or
when each prompt needs provider-specific config.

## Example

```ts
const prompt: PromptFunction = async ({ vars }) => ({
  prompt: `Summarize ${vars.topic}`,
  config: { temperature: 0.2 },
});
```

> **PromptFunction**(`context`): `Promise`\<[`PromptContent`](../type-aliases/PromptContent.md) \| [`PromptFunctionResult`](PromptFunctionResult.md)\>

Defined in: [types/prompts.ts:71](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L71)

Function form accepted anywhere the Node.js API accepts a prompt.

Use prompt functions when the prompt must be assembled from runtime vars or
when each prompt needs provider-specific config.

## Parameters

### context

#### provider?

`ApiProvider`

#### vars

`Record`\<`string`, `VarValue`\>

## Returns

`Promise`\<[`PromptContent`](../type-aliases/PromptContent.md) \| [`PromptFunctionResult`](PromptFunctionResult.md)\>

## Example

```ts
const prompt: PromptFunction = async ({ vars }) => ({
  prompt: `Summarize ${vars.topic}`,
  config: { temperature: 0.2 },
});
```
