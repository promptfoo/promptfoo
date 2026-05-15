---
title: 'Interface: TestCaseOptions'
description: 'Additional per-test options merged with prompt, output, and grading behavior.'
---

## Import

```ts
import type { TestCaseOptions } from 'promptfoo';
```

Defined in: [types/index.ts:1416](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1416)

Additional per-test options merged with prompt, output, and grading behavior.

Unknown keys are preserved so provider-specific config can travel with a test.

## Example

```ts
const options: TestCaseOptions = {
  prefix: 'System: ',
  transform: (output) => output.trim(),
  disableVarExpansion: true,
};
```

## Extends

- [`PromptConfig`](PromptConfig.md).`OutputConfig`.`GradingConfig`

## Indexable

> \[`key`: `string`\]: `any`

## Properties

### disableConversationVar?

> `optional` **disableConversationVar?**: `boolean`

Defined in: [types/index.ts:1420](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1420)

Do not include the implicit `_conversation` variable.

---

### disableDefaultAsserts?

> `optional` **disableDefaultAsserts?**: `boolean`

Defined in: [types/index.ts:1422](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1422)

Skip `defaultTest` assertions while still inheriting other defaults.

---

### disableVarExpansion?

> `optional` **disableVarExpansion?**: `boolean`

Defined in: [types/index.ts:1418](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1418)

Do not expand array-valued vars into multiple eval cases.

---

### factuality?

> `optional` **factuality?**: `object`

Defined in: [types/index.ts:187](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L187)

Score mapping used by factuality-oriented graders.

#### agree?

> `optional` **agree?**: `number`

Score awarded when answer and reference agree factually.

#### differButFactual?

> `optional` **differButFactual?**: `number`

Score awarded when wording differs but remains factual.

#### disagree?

> `optional` **disagree?**: `number`

Score awarded when answer and reference disagree factually.

#### subset?

> `optional` **subset?**: `number`

Score awarded when the answer is a factual subset of the expected answer.

#### superset?

> `optional` **superset?**: `number`

Score awarded when the answer is a factual superset of the expected answer.

#### Inherited from

`GradingConfig.factuality`

---

### ~~postprocess?~~

> `optional` **postprocess?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:209](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L209)

#### Deprecated

in > 0.38.0. Use `transform` instead.

#### Inherited from

`OutputConfig.postprocess`

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: [contracts/prompts.ts:45](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L45)

Text prepended to the rendered prompt before it is sent to the provider.

#### Inherited from

[`PromptConfig`](PromptConfig.md).[`prefix`](PromptConfig.md#prefix)

---

### provider?

> `optional` **provider?**: `any`

Defined in: [types/index.ts:183](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L183)

Provider override used by model-graded assertions.

#### Inherited from

`GradingConfig.provider`

---

### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Defined in: [types/index.ts:170](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L170)

Rubric prompt override used by model-graded assertions.

#### Inherited from

`GradingConfig.rubricPrompt`

---

### runSerially?

> `optional` **runSerially?**: `boolean`

Defined in: [types/index.ts:1424](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1424)

Run this test serially even when the eval otherwise uses concurrency.

---

### storeOutputAs?

> `optional` **storeOutputAs?**: `string`

Defined in: [types/index.ts:216](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L216)

Name of the variable that should receive this test case's output.

#### Inherited from

`OutputConfig.storeOutputAs`

---

### suffix?

> `optional` **suffix?**: `string`

Defined in: [contracts/prompts.ts:47](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/prompts.ts#L47)

Text appended to the rendered prompt before it is sent to the provider.

#### Inherited from

[`PromptConfig`](PromptConfig.md).[`suffix`](PromptConfig.md#suffix)

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:211](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L211)

Transform provider output before assertions run.

#### Inherited from

`OutputConfig.transform`

---

### transformVars?

> `optional` **transformVars?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:213](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L213)

Transform vars before prompt rendering.

#### Inherited from

`OutputConfig.transformVars`
