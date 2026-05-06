[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TestCase

# Interface: TestCase

Defined in: [types/index.ts:1365](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1365)

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

Defined in: [types/index.ts:1379](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1379)

Assertions to run against the provider output.

---

### assertScoringFunction?

> `optional` **assertScoringFunction?**: `string` \| [`ScoringFunction`](../type-aliases/ScoringFunction.md)

Defined in: [types/index.ts:1381](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1381)

Optional custom scoring function for aggregating assertion results.

---

### description?

> `optional` **description?**: `string`

Defined in: [types/index.ts:1367](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1367)

Optional human-readable description of what the test covers.

---

### metadata?

> `optional` **metadata?**: [`TestCaseMetadata`](TestCaseMetadata.md)

Defined in: [types/index.ts:1387](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1387)

Arbitrary metadata attached to the test case.

---

### options?

> `optional` **options?**: [`TestCaseOptions`](TestCaseOptions.md)

Defined in: [types/index.ts:1383](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1383)

Additional configuration settings for the prompt and grader.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/index.ts:1375](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1375)

Prompt labels or ids this test should run against; omitted means all prompts.

---

### provider?

> `optional` **provider?**: `string` \| [`ProviderOptions`](ProviderOptions.md) \| [`ApiProvider`](ApiProvider.md)

Defined in: [types/index.ts:1371](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1371)

Provider override for this specific test case.

---

### providerOutput?

> `optional` **providerOutput?**: `string` \| `Record`\<`string`, `unknown`\>

Defined in: [types/index.ts:1377](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1377)

Precomputed provider output; when set, promptfoo skips the provider call and grades this output directly.

---

### providers?

> `optional` **providers?**: `string`[]

Defined in: [types/index.ts:1373](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1373)

Provider labels or ids this test should run against; supports wildcards such as `openai:*`.

---

### threshold?

> `optional` **threshold?**: `number`

Defined in: [types/index.ts:1385](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1385)

Required aggregate score for the test case; without one, the case is graded pass/fail.

---

### vars?

> `optional` **vars?**: `Vars`

Defined in: [types/index.ts:1369](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1369)

Key-value pairs substituted into prompts for this test case.
