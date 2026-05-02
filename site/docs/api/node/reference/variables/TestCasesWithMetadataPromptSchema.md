[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TestCasesWithMetadataPromptSchema

# Variable: TestCasesWithMetadataPromptSchema

> `const` **TestCasesWithMetadataPromptSchema**: `ZodObject`\<\{ `evalId`: `ZodString`; `id`: `ZodString`; `prompt`: `ZodObject`\<\{ `config`: `ZodOptional`\<`ZodAny`\>; `display`: `ZodOptional`\<`ZodString`\>; `function`: `ZodOptional`\<`ZodCustom`\<[`PromptFunction`](../interfaces/PromptFunction.md), [`PromptFunction`](../interfaces/PromptFunction.md)\>\>; `id`: `ZodOptional`\<`ZodString`\>; `label`: `ZodString`; `metrics`: `ZodOptional`\<`ZodObject`\<\{ `assertFailCount`: `ZodNumber`; `assertPassCount`: `ZodNumber`; `cost`: `ZodNumber`; `namedScores`: `ZodRecord`\<`ZodString`, `ZodNumber`\>; `namedScoresCount`: `ZodRecord`\<`ZodString`, `ZodNumber`\>; `namedScoreWeights`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodNumber`\>\>; `redteam`: `ZodOptional`\<`ZodObject`\<\{ `pluginFailCount`: `ZodRecord`\<..., ...\>; `pluginPassCount`: `ZodRecord`\<..., ...\>; `strategyFailCount`: `ZodRecord`\<..., ...\>; `strategyPassCount`: `ZodRecord`\<..., ...\>; \}, `$strip`\>\>; `score`: `ZodNumber`; `testErrorCount`: `ZodNumber`; `testFailCount`: `ZodNumber`; `testPassCount`: `ZodNumber`; `tokenUsage`: `ZodObject`\<\{ `assertions`: `ZodOptional`\<`ZodObject`\<..., ...\>\>; `cached`: `ZodOptional`\<`ZodNumber`\>; `completion`: `ZodOptional`\<`ZodNumber`\>; `completionDetails`: `ZodOptional`\<`ZodObject`\<..., ...\>\>; `numRequests`: `ZodOptional`\<`ZodNumber`\>; `prompt`: `ZodOptional`\<`ZodNumber`\>; `total`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>; `totalLatencyMs`: `ZodNumber`; \}, `$strip`\>\>; `provider`: `ZodString`; `raw`: `ZodString`; `template`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>; \}, `$strip`\>

Defined in: [types/index.ts:771](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L771)
