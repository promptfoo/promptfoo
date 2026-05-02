[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateTestSuite

# Type Alias: EvaluateTestSuite

> **EvaluateTestSuite** = `object` & `Omit`\<[`TestSuiteConfig`](TestSuiteConfig.md), `"prompts"` \| `"providers"`\>

Defined in: [types/index.ts:1316](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L1316)

## Type Declaration

### author?

> `optional` **author?**: `string`

Author to attribute the evaluation to.
When the user is logged into cloud with a stored email, that identity
takes precedence and this option is ignored. Otherwise resolution is:
this option > stored user email > PROMPTFOO_AUTHOR env var > null.

### prompts

> **prompts**: (`string` \| `object` \| [`PromptFunction`](../interfaces/PromptFunction.md))[]

### providers

> **providers**: [`ProvidersConfig`](ProvidersConfig.md)

### writeLatestResults?

> `optional` **writeLatestResults?**: `boolean`
