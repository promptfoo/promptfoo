[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AfterEachExtensionHookContext

# Type Alias: AfterEachExtensionHookContext

> **AfterEachExtensionHookContext** = `object`

Defined in: [evaluatorHelpers.ts:568](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L568)

Context passed to afterEach extension hooks.
Called after each test case is evaluated.

When the hook returns the modified context, `result.namedScores`,
`result.metadata`, and `result.response.metadata` will be shallow-merged
into the evaluation result and persisted.

## Properties

### result

> **result**: [`EvaluateResult`](../interfaces/EvaluateResult.md)

Defined in: [evaluatorHelpers.ts:572](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L572)

The result of the evaluation (namedScores, metadata, and response.metadata are mutable)

---

### test

> **test**: [`TestCase`](TestCase.md)

Defined in: [evaluatorHelpers.ts:570](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L570)

The test case that was evaluated
