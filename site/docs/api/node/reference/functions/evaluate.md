[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / evaluate

# Function: evaluate()

> **evaluate**(`testSuite`, `options?`): `Promise`\<`Eval`\>

Defined in: [index.ts:91](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L91)

Run an eval from a JavaScript or TypeScript program.

`testSuite` uses the same concepts as a YAML config, but the Node.js API also
accepts function-valued prompts, providers, assertions, and transforms where
the corresponding types allow them.

## Parameters

### testSuite

[`EvaluateTestSuite`](../type-aliases/EvaluateTestSuite.md)

Prompts, providers, tests, and other eval configuration.

### options?

[`EvaluateOptions`](../interfaces/EvaluateOptions.md) = `{}`

Runtime-only evaluation options such as caching and
concurrency.

## Returns

`Promise`\<`Eval`\>

The completed eval record. Use helpers such as
`toEvaluateSummary()` and `getTable()` to read results; persisted state is
written when `writeLatestResults` is enabled.

## Example

```ts
import { evaluate } from 'promptfoo';

const evalRecord = await evaluate({
  prompts: ['Answer briefly: {{question}}'],
  providers: ['openai:chat:gpt-5.5'],
  tests: [{ vars: { question: 'What is 2 + 2?' } }],
});

const summary = await evalRecord.toEvaluateSummary();
console.log(summary.stats);
```
