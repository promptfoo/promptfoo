---
title: 'Interface: TestCaseOptions'
description: 'Additional per-test options merged with prompt, output, and grading behavior.'
---

## Import

```ts
import type { TestCaseOptions } from 'promptfoo';
```

Defined in: [types/index.ts:1411](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1411)

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

Defined in: [types/index.ts:1415](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1415)

Do not include the implicit `_conversation` variable.

---

### disableDefaultAsserts?

> `optional` **disableDefaultAsserts?**: `boolean`

Defined in: [types/index.ts:1417](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1417)

Skip `defaultTest` assertions while still inheriting other defaults.

---

### disableVarExpansion?

> `optional` **disableVarExpansion?**: `boolean`

Defined in: [types/index.ts:1413](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1413)

Do not expand array-valued vars into multiple eval cases.

---

### factuality?

> `optional` **factuality?**: `object`

Defined in: [types/index.ts:182](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L182)

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

Defined in: [types/index.ts:204](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L204)

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

Defined in: [types/index.ts:178](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L178)

Provider override used by model-graded assertions.

#### Inherited from

`GradingConfig.provider`

---

### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Defined in: [types/index.ts:165](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L165)

Rubric prompt override used by model-graded assertions.

#### Inherited from

`GradingConfig.rubricPrompt`

---

### runSerially?

> `optional` **runSerially?**: `boolean`

Defined in: [types/index.ts:1419](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1419)

Run this test serially even when the eval otherwise uses concurrency.

---

### storeOutputAs?

> `optional` **storeOutputAs?**: `string`

Defined in: [types/index.ts:211](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L211)

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

Defined in: [types/index.ts:206](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L206)

Transform provider output before assertions run.

#### Inherited from

`OutputConfig.transform`

---

### transformVars?

> `optional` **transformVars?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/index.ts:208](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L208)

Transform vars before prompt rendering.

#### Inherited from

`OutputConfig.transformVars`
