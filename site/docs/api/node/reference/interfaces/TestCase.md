---
title: 'Interface: TestCase'
description: 'Author-facing test case configuration accepted by eval suites.'
---

## Import

```ts
import type { TestCase } from 'promptfoo';
```

Defined in: [types/index.ts:1461](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1461)

Author-facing test case configuration accepted by eval suites.

## Example

```ts
const test: TestCase = {
  description: 'Greets the named user',
  vars: { name: 'Ada' },
  assert: [{ type: 'contains', value: 'Ada' }],
};
```

## Extended by

- [`AtomicTestCase`](AtomicTestCase.md)

## Properties

### assert?

> `optional` **assert?**: [`AssertionOrSet`](../type-aliases/AssertionOrSet.md)[]

Defined in: [types/index.ts:1475](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1475)

Assertions to run against the provider output.

---

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Defined in: [types/index.ts:1477](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1477)

Optional custom scoring function for aggregating assertion results.

---

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:1463](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1463)

Optional human-readable description of what the test covers.

---

### metadata?

> `optional` **metadata?**: [`TestCaseMetadata`](TestCaseMetadata.md)

Defined in: [types/index.ts:1483](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1483)

Arbitrary metadata attached to the test case.

---

### options?

> `optional` **options?**: [`TestCaseOptions`](TestCaseOptions.md)

Defined in: [types/index.ts:1479](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1479)

Additional configuration settings for the prompt and grader.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/index.ts:1471](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1471)

Prompt labels or ids this test should run against; omitted means all prompts.

---

### provider?

> `optional` **provider?**: `string` \| [`ProviderOptions`](ProviderOptions.md) \| [`ApiProvider`](ApiProvider.md)

Defined in: [types/index.ts:1467](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1467)

Provider override for this specific test case.

---

### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Defined in: [types/index.ts:1473](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1473)

Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly.

---

### providers?

> `optional` **providers?**: `string`[]

Defined in: [types/index.ts:1469](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1469)

Provider labels or ids this test should run against; supports wildcards such as `openai:*`.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1481](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1481)

Required aggregate score for the test case; without one, the case is graded pass/fail.

---

### vars?

> `optional` **vars?**: `Vars`

Defined in: [types/index.ts:1465](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1465)

Key-value pairs substituted into prompts for this test case.
