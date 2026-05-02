[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateOptionsSchema

# Variable: EvaluateOptionsSchema

> `const` **EvaluateOptionsSchema**: `ZodObject`\<\{ `cache`: `ZodOptional`\<`ZodBoolean`\>; `delay`: `ZodOptional`\<`ZodNumber`\>; `eventSource`: `ZodOptional`\<`ZodString`\>; `filterRange`: `ZodOptional`\<`ZodString`\>; `generateSuggestions`: `ZodOptional`\<`ZodBoolean`\>; `interactiveProviders`: `ZodOptional`\<`ZodBoolean`\>; `isRedteam`: `ZodOptional`\<`ZodBoolean`\>; `maxConcurrency`: `ZodOptional`\<`ZodNumber`\>; `maxEvalTimeMs`: `ZodOptional`\<`ZodNumber`\>; `progressCallback`: `ZodOptional`\<`ZodCustom`\<(`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`, (`completed`, `total`, `index`, `evalStep`, `metrics`) => `void`\>\>; `repeat`: `ZodOptional`\<`ZodNumber`\>; `showProgressBar`: `ZodOptional`\<`ZodBoolean`\>; `silent`: `ZodOptional`\<`ZodBoolean`\>; `timeoutMs`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>

Defined in: [types/index.ts:252](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L252)
