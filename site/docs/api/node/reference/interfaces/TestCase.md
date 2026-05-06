---
title: 'Interface: TestCase'
---

Defined in: [types/index.ts:1394](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1394)

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

Defined in: [types/index.ts:1408](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1408)

Assertions to run against the provider output.

---

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Defined in: [types/index.ts:1410](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1410)

Optional custom scoring function for aggregating assertion results.

---

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:1396](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1396)

Optional human-readable description of what the test covers.

---

### metadata?

> `optional` **metadata?**: [`TestCaseMetadata`](TestCaseMetadata.md)

Defined in: [types/index.ts:1416](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1416)

Arbitrary metadata attached to the test case.

---

### options?

> `optional` **options?**: [`TestCaseOptions`](TestCaseOptions.md)

Defined in: [types/index.ts:1412](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1412)

Additional configuration settings for the prompt and grader.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/index.ts:1404](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1404)

Prompt labels or ids this test should run against; omitted means all prompts.

---

### provider?

> `optional` **provider?**: `string` \| [`ProviderOptions`](ProviderOptions.md) \| [`ApiProvider`](ApiProvider.md)

Defined in: [types/index.ts:1400](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1400)

Provider override for this specific test case.

---

### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Defined in: [types/index.ts:1406](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1406)

Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly.

---

### providers?

> `optional` **providers?**: `string`[]

Defined in: [types/index.ts:1402](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1402)

Provider labels or ids this test should run against; supports wildcards such as `openai:*`.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1414](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1414)

Required aggregate score for the test case; without one, the case is graded pass/fail.

---

### vars?

> `optional` **vars?**: `Vars`

Defined in: [types/index.ts:1398](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1398)

Key-value pairs substituted into prompts for this test case.
