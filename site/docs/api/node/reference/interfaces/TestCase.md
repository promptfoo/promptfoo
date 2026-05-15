---
title: 'Interface: TestCase'
description: 'Author-facing test case configuration accepted by eval suites.'
---

## Import

```ts
import type { TestCase } from 'promptfoo';
```

Defined in: [types/index.ts:1466](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1466)

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

Defined in: [types/index.ts:1480](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1480)

Assertions to run against the provider output.

---

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Defined in: [types/index.ts:1482](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1482)

Optional custom scoring function for aggregating assertion results.

---

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:1468](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1468)

Optional human-readable description of what the test covers.

---

### metadata?

> `optional` **metadata?**: [`TestCaseMetadata`](TestCaseMetadata.md)

Defined in: [types/index.ts:1488](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1488)

Arbitrary metadata attached to the test case.

---

### options?

> `optional` **options?**: [`TestCaseOptions`](TestCaseOptions.md)

Defined in: [types/index.ts:1484](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1484)

Additional configuration settings for the prompt and grader.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/index.ts:1476](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1476)

Prompt labels or ids this test should run against; omitted means all prompts.

---

### provider?

> `optional` **provider?**: `string` \| [`ProviderOptions`](ProviderOptions.md) \| [`ApiProvider`](ApiProvider.md)

Defined in: [types/index.ts:1472](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1472)

Provider override for this specific test case.

---

### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Defined in: [types/index.ts:1478](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1478)

Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly.

---

### providers?

> `optional` **providers?**: `string`[]

Defined in: [types/index.ts:1474](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1474)

Provider labels or ids this test should run against; supports wildcards such as `openai:*`.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1486](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1486)

Required aggregate score for the test case; without one, the case is graded pass/fail.

---

### vars?

> `optional` **vars?**: `Vars`

Defined in: [types/index.ts:1470](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1470)

Key-value pairs substituted into prompts for this test case.
