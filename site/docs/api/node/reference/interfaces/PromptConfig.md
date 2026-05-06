[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptConfig

# Interface: PromptConfig

Defined in: [types/prompts.ts:39](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L39)

Prompt-local text decoration applied before provider execution.

## Example

```ts
const config: PromptConfig = {
  prefix: 'System: ',
  suffix: '\nAnswer briefly.',
};
```

## Extended by

- [`TestCaseOptions`](TestCaseOptions.md)

## Properties

### prefix?

> `optional` **prefix?**: `string`

Defined in: [types/prompts.ts:41](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L41)

Text prepended to the rendered prompt before it is sent to the provider.

---

### suffix?

> `optional` **suffix?**: `string`

Defined in: [types/prompts.ts:43](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L43)

Text appended to the rendered prompt before it is sent to the provider.
