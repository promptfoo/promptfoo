---
title: 'Type Alias: EvaluateTestSuite'
---

> **EvaluateTestSuite** = `object` & `Omit`\<`TestSuiteConfig`, `"prompts"` \| `"providers"`\>

Defined in: [types/index.ts:1873](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1873)

Test-suite shape accepted by the Node.js `evaluate()` API.

In addition to the Node-specific `prompts`, `providers`, `author`, and
`writeLatestResults` fields listed below, this type accepts the same shared
suite fields as the YAML config model, including `tests`, `defaultTest`,
`env`, and scenarios.

## Type Declaration

### author?

> `optional` **author?**: `string`

Author to attribute the evaluation to.
When the user is logged into cloud with a stored email, that identity
takes precedence and this option is ignored. Otherwise resolution is:
this option > stored user email > PROMPTFOO_AUTHOR env var > null.

### prompts

> **prompts**: (`string` \| `object` \| [`PromptFunction`](PromptFunction.md))[]

Prompt strings, prompt objects, or inline prompt functions to evaluate.

### providers

> **providers**: [`ProvidersConfig`](ProvidersConfig.md)

Provider ids, provider functions, provider objects, or arrays of those forms.

### writeLatestResults?

> `optional` **writeLatestResults?**: `boolean`

Persist the eval so it is available to local result storage and the web UI.

## Example

```ts
const suite: EvaluateTestSuite = {
  prompts: ['Say hello to {{name}}'],
  providers: ['openai:chat:gpt-5.5'],
  tests: [{ vars: { name: 'Ada' } }],
};
```
