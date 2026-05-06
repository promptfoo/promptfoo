[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AssertionTestContext

# Interface: AssertionTestContext

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

Defined in: [types/index.ts:1379](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1379)

Assertions to run against the provider output.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`assert`](AtomicTestCase.md#assert)

---

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Defined in: [types/index.ts:1381](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1381)

Optional custom scoring function for aggregating assertion results.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`assertScoringFunction`](AtomicTestCase.md#assertscoringfunction)

---

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:1367](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1367)

Optional human-readable description of what the test covers.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`description`](AtomicTestCase.md#description)

---

### metadata?

> `optional` **metadata?**: [`TestCaseMetadata`](TestCaseMetadata.md)

Defined in: [types/index.ts:1387](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1387)

Arbitrary metadata attached to the test case.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`metadata`](AtomicTestCase.md#metadata)

---

### options?

> `optional` **options?**: [`TestCaseOptions`](TestCaseOptions.md)

Defined in: [types/index.ts:1383](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1383)

Additional configuration settings for the prompt and grader.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`options`](AtomicTestCase.md#options)

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/index.ts:1375](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1375)

Prompt labels or ids this test should run against; omitted means all prompts.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`prompts`](AtomicTestCase.md#prompts)

---

### provider?

> `optional` **provider?**: `string` \| [`ProviderOptions`](ProviderOptions.md) \| [`ApiProvider`](ApiProvider.md)

Defined in: [types/index.ts:1371](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1371)

Provider override for this specific test case.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`provider`](AtomicTestCase.md#provider)

---

### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Defined in: [types/index.ts:1377](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1377)

Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`providerOutput`](AtomicTestCase.md#provideroutput)

---

### providers?

> `optional` **providers?**: `string`[]

Defined in: [types/index.ts:1373](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1373)

Provider labels or ids this test should run against; supports wildcards such as `openai:*`.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`providers`](AtomicTestCase.md#providers)

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1385](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1385)

Required aggregate score for the test case; without one, the case is graded pass/fail.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`threshold`](AtomicTestCase.md#threshold)

---

### vars?

> `optional` **vars?**: `Vars`

Defined in: [types/index.ts:1446](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1446)

Flattened variables used for this exact eval row.

#### Inherited from

[`AtomicTestCase`](AtomicTestCase.md).[`vars`](AtomicTestCase.md#vars)
