---
title: 'Interface: AtomicTestCase'
description: 'Fully materialized test case used during evaluation.'
---

## Import

```ts
import type { AtomicTestCase } from 'promptfoo';
```

Defined in: [types/index.ts:1544](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1544)

Fully materialized test case used during evaluation.

`AtomicTestCase` has the same author-facing fields as `TestCase`, but `vars`
has already been flattened into the exact values used for one eval row.

## Example

```ts
const test: AtomicTestCase = {
  description: 'Greets the named user',
  vars: { name: 'Ada' },
  assert: [{ type: 'contains', value: 'Ada' }],
};
```

## Extends

- [`TestCase`](TestCase.md)

## Extended by

- [`AssertionTestContext`](AssertionTestContext.md)

## Properties

### assert?

> `optional` **assert?**: [`AssertionOrSet`](../type-aliases/AssertionOrSet.md)[]

Defined in: [types/index.ts:1479](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1479)

Assertions to run against the provider output.

#### Inherited from

[`TestCase`](TestCase.md).[`assert`](TestCase.md#assert)

---

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Defined in: [types/index.ts:1481](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1481)

Optional custom scoring function for aggregating assertion results.

#### Inherited from

[`TestCase`](TestCase.md).[`assertScoringFunction`](TestCase.md#assertscoringfunction)

---

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:1467](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1467)

Optional human-readable description of what the test covers.

#### Inherited from

[`TestCase`](TestCase.md).[`description`](TestCase.md#description)

---

### metadata?

> `optional` **metadata?**: [`TestCaseMetadata`](TestCaseMetadata.md)

Defined in: [types/index.ts:1487](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1487)

Arbitrary metadata attached to the test case.

#### Inherited from

[`TestCase`](TestCase.md).[`metadata`](TestCase.md#metadata)

---

### options?

> `optional` **options?**: [`TestCaseOptions`](TestCaseOptions.md)

Defined in: [types/index.ts:1483](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1483)

Additional configuration settings for the prompt and grader.

#### Inherited from

[`TestCase`](TestCase.md).[`options`](TestCase.md#options)

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/index.ts:1475](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1475)

Prompt labels or ids this test should run against; omitted means all prompts.

#### Inherited from

[`TestCase`](TestCase.md).[`prompts`](TestCase.md#prompts)

---

### provider?

> `optional` **provider?**: `string` \| [`ProviderOptions`](ProviderOptions.md) \| [`ApiProvider`](ApiProvider.md)

Defined in: [types/index.ts:1471](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1471)

Provider override for this specific test case.

#### Inherited from

[`TestCase`](TestCase.md).[`provider`](TestCase.md#provider)

---

### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Defined in: [types/index.ts:1477](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1477)

Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly.

#### Inherited from

[`TestCase`](TestCase.md).[`providerOutput`](TestCase.md#provideroutput)

---

### providers?

> `optional` **providers?**: `string`[]

Defined in: [types/index.ts:1473](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1473)

Provider labels or ids this test should run against; supports wildcards such as `openai:*`.

#### Inherited from

[`TestCase`](TestCase.md).[`providers`](TestCase.md#providers)

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1485](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1485)

Required aggregate score for the test case; without one, the case is graded pass/fail.

#### Inherited from

[`TestCase`](TestCase.md).[`threshold`](TestCase.md#threshold)

---

### vars?

> `optional` **vars?**: `Vars`

Defined in: [types/index.ts:1546](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1546)

Flattened variables used for this exact eval row.

#### Overrides

[`TestCase`](TestCase.md).[`vars`](TestCase.md#vars)
