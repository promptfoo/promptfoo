[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AfterAllExtensionHookContext

# Type Alias: AfterAllExtensionHookContext

> **AfterAllExtensionHookContext** = `object`

Defined in: [evaluatorHelpers.ts:591](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L591)

Context passed to afterAll extension hooks.
Called once after all evaluations complete.

## Example

```javascript
// extension.js
module.exports = {
  afterAll: async (context) => {
    console.log(`Eval ${context.evalId} completed`);
    console.log(`Results: ${context.results.length} tests`);
    // Send to monitoring, database, etc.
  },
};
```

## Properties

### config

> **config**: `Partial`\<[`UnifiedConfig`](UnifiedConfig.md)\>

Defined in: [evaluatorHelpers.ts:601](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L601)

The full evaluation configuration

---

### evalId

> **evalId**: `string`

Defined in: [evaluatorHelpers.ts:599](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L599)

Unique identifier for this evaluation run

---

### prompts

> **prompts**: [`CompletedPrompt`](CompletedPrompt.md)[]

Defined in: [evaluatorHelpers.ts:597](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L597)

Completed prompts with metrics

---

### results

> **results**: [`EvaluateResult`](../interfaces/EvaluateResult.md)[]

Defined in: [evaluatorHelpers.ts:595](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L595)

All evaluation results as plain data objects

---

### suite

> **suite**: [`TestSuite`](TestSuite.md)

Defined in: [evaluatorHelpers.ts:593](https://github.com/promptfoo/promptfoo/blob/main/src/evaluatorHelpers.ts#L593)

The test suite configuration
