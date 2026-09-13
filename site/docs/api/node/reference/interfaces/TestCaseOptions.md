---
title: 'Interface: TestCaseOptions'
description: 'Additional per-test options merged with prompt, output, and grading behavior. See supported imports, signatures, fields, and examples for this symbol.'
sidebar_position: 43
---

## Import

```ts
import type { TestCaseOptions } from 'promptfoo';
```

Defined in: [src/types/index.ts:1371](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1371)

Additional per-test options merged with prompt, output, and grading behavior.

Unknown keys are preserved so provider-specific config can travel with a test.

## Example

```ts
const options: TestCaseOptions = {
  prefix: 'System: ',
  transform: (output) => String(output).trim(),
  disableVarExpansion: true,
};
```

## Indexable

> \[`key`: `string`\]: `any`

## Properties

### disableConversationVar?

> `optional` **disableConversationVar?**: `boolean`

Defined in: [src/types/index.ts:1321](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1321)

Do not include the implicit `_conversation` variable.

---

### disableDefaultAsserts?

> `optional` **disableDefaultAsserts?**: `boolean`

Defined in: [src/types/index.ts:1323](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1323)

Skip `defaultTest` assertions while still inheriting other defaults.

---

### disableVarExpansion?

> `optional` **disableVarExpansion?**: `boolean`

Defined in: [src/types/index.ts:1319](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1319)

Do not expand array-valued vars into multiple eval cases.

---

### factuality?

> `optional` **factuality?**: `object`

Defined in: [src/types/index.ts:185](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L185)

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

---

### ~~postprocess?~~

> `optional` **postprocess?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [src/types/index.ts:207](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L207)

#### Deprecated

in > 0.38.0. Use `transform` instead.

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: [src/contracts/validators/prompts.ts:7](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L7)

---

### provider?

> `optional` **provider?**: `any`

Defined in: [src/types/index.ts:181](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L181)

Provider override used by model-graded assertions.

---

### repeat?

> `optional` **repeat?**: `number`

Defined in: [src/types/index.ts:1328](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1328)

---

### rubricPrompt?

> `optional` **rubricPrompt?**: `string` \| `string`[] \| `object`[]

Defined in: [src/types/index.ts:168](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L168)

Rubric prompt override used by model-graded assertions.

---

### runSerially?

> `optional` **runSerially?**: `boolean`

Defined in: [src/types/index.ts:1325](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1325)

Run this test serially even when the eval otherwise uses concurrency.

---

### storeOutputAs?

> `optional` **storeOutputAs?**: `string`

Defined in: [src/types/index.ts:214](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L214)

Name of the variable that should receive this test case's output.

---

### suffix?

> `optional` **suffix?**: `string`

Defined in: [src/contracts/validators/prompts.ts:8](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/validators/prompts.ts#L8)

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [src/types/index.ts:209](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L209)

Transform provider output before assertions run.

---

### transformVars?

> `optional` **transformVars?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [src/types/index.ts:211](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L211)

Transform vars before prompt rendering.
