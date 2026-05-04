[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateTestSuite

# Type Alias: EvaluateTestSuite

> **EvaluateTestSuite** = `object` & `Omit`\<`TestSuiteConfig`, `"prompts"` \| `"providers"`\>

Defined in: [types/index.ts:1427](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1427)

Test-suite shape accepted by the Node.js `evaluate()` API.

Additional config fields follow the same schema as the YAML configuration
reference. See the configuration docs for the full config model.

## Type Declaration

### author?

> `optional` **author?**: `string`

Author to attribute the evaluation to.
When the user is logged into cloud with a stored email, that identity
takes precedence and this option is ignored. Otherwise resolution is:
this option > stored user email > PROMPTFOO_AUTHOR env var > null.

### prompts

> **prompts**: (`string` \| `object` \| [`PromptFunction`](PromptFunction.md))[]

Prompt strings, prompt objects, or inline prompt functions to evaluate.

### providers

> **providers**: [`ProvidersConfig`](ProvidersConfig.md)

Provider ids, provider functions, provider objects, or arrays of those forms.

### writeLatestResults?

> `optional` **writeLatestResults?**: `boolean`

Persist the eval so it is available to local result storage and the web UI.
