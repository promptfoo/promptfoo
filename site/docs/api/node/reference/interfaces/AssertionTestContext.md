---
title: 'Interface: AssertionTestContext'
description: 'Test-case context accepted by low-level assertion APIs.'
---

## Import

```ts
import type { AssertionTestContext } from 'promptfoo';
```

Defined in: [assertions/index.ts:401](https://github.com/promptfoo/promptfoo/blob/main/src/assertions/index.ts#L401)

Test-case context accepted by low-level assertion APIs.

For the common `runAssertion()` case, `{ vars: {} }` is enough. Use the same
broader shape as an evaluated test case when custom assertions or assertion
handlers need additional context. `runAssertions()` also reads `assert` and
`threshold` from this object.

## Example

```ts
const test: AssertionTestContext = {
  vars: { name: 'Ada' },
  assert: [{ type: 'contains', value: 'Ada' }],
};
```

## Extends

- [`AtomicTestCase`](AtomicTestCase.md)

## Properties

### assert?

> `optional` **assert?**: [`AssertionOrSet`](../type-aliases/AssertionOrSet.md)[]

Defined in: [types/index.ts:1479](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1479)

Assertions to run against the provider output.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`assert`](AtomicTestCase.md#assert)

---

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Defined in: [types/index.ts:1481](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1481)

Optional custom scoring function for aggregating assertion results.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`assertScoringFunction`](AtomicTestCase.md#assertscoringfunction)

---

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:1467](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1467)

Optional human-readable description of what the test covers.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`description`](AtomicTestCase.md#description)

---

### metadata?

> `optional` **metadata?**: [`TestCaseMetadata`](TestCaseMetadata.md)

Defined in: [types/index.ts:1487](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1487)

Arbitrary metadata attached to the test case.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`metadata`](AtomicTestCase.md#metadata)

---

### options?

> `optional` **options?**: [`TestCaseOptions`](TestCaseOptions.md)

Defined in: [types/index.ts:1483](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1483)

Additional configuration settings for the prompt and grader.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`options`](AtomicTestCase.md#options)

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/index.ts:1475](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1475)

Prompt labels or ids this test should run against; omitted means all prompts.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`prompts`](AtomicTestCase.md#prompts)

---

### provider?

> `optional` **provider?**: `string` \| [`ProviderOptions`](ProviderOptions.md) \| [`ApiProvider`](ApiProvider.md)

Defined in: [types/index.ts:1471](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1471)

Provider override for this specific test case.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`provider`](AtomicTestCase.md#provider)

---

### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Defined in: [types/index.ts:1477](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1477)

Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`providerOutput`](AtomicTestCase.md#provideroutput)

---

### providers?

> `optional` **providers?**: `string`[]

Defined in: [types/index.ts:1473](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1473)

Provider labels or ids this test should run against; supports wildcards such as `openai:*`.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`providers`](AtomicTestCase.md#providers)

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1485](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1485)

Required aggregate score for the test case; without one, the case is graded pass/fail.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`threshold`](AtomicTestCase.md#threshold)

---

### vars?

> `optional` **vars?**: `Vars`

Defined in: [types/index.ts:1546](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1546)

Flattened variables used for this exact eval row.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`vars`](AtomicTestCase.md#vars)
