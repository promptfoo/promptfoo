[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TestCasesWithMetadataSchema

# Variable: TestCasesWithMetadataSchema

> `const` **TestCasesWithMetadataSchema**: `ZodObject`\<\{ `count`: `ZodNumber`; `id`: `ZodString`; `prompts`: `ZodArray`\<`ZodObject`\<\{ `evalId`: `ZodString`; `id`: `ZodString`; `prompt`: `ZodObject`\<\{ `config`: `ZodOptional`\<`ZodAny`\>; `display`: `ZodOptional`\<`ZodString`\>; `function`: `ZodOptional`\<`ZodCustom`\<[`PromptFunction`](../interfaces/PromptFunction.md), [`PromptFunction`](../interfaces/PromptFunction.md)\>\>; `id`: `ZodOptional`\<`ZodString`\>; `label`: `ZodString`; `metrics`: `ZodOptional`\<`ZodObject`\<\{ `assertFailCount`: `ZodNumber`; `assertPassCount`: `ZodNumber`; `cost`: `ZodNumber`; `namedScores`: `ZodRecord`\<..., ...\>; `namedScoresCount`: `ZodRecord`\<..., ...\>; `namedScoreWeights`: `ZodOptional`\<...\>; `redteam`: `ZodOptional`\<...\>; `score`: `ZodNumber`; `testErrorCount`: `ZodNumber`; `testFailCount`: `ZodNumber`; `testPassCount`: `ZodNumber`; `tokenUsage`: `ZodObject`\<..., ...\>; `totalLatencyMs`: `ZodNumber`; \}, `$strip`\>\>; `provider`: `ZodString`; `raw`: `ZodString`; `template`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>; \}, `$strip`\>\>; `recentEvalDate`: `ZodDate`; `recentEvalId`: `ZodString`; `testCases`: `ZodUnion`\<readonly \[`ZodString`, `ZodArray`\<`ZodUnion`\<readonly \[`ZodString`, `ZodObject`\<\{ `assert`: `ZodOptional`\<`ZodArray`\<...\>\>; `assertScoringFunction`: `ZodOptional`\<`ZodUnion`\<...\>\>; `description`: `ZodOptional`\<`ZodString`\>; `metadata`: `ZodOptional`\<`ZodObject`\<..., ...\>\>; `options`: `ZodOptional`\<`ZodObject`\<..., ...\>\>; `prompts`: `ZodOptional`\<`ZodArray`\<...\>\>; `provider`: `ZodOptional`\<`ZodUnion`\<...\>\>; `providerOutput`: `ZodOptional`\<`ZodUnion`\<...\>\>; `providers`: `ZodOptional`\<`ZodArray`\<...\>\>; `threshold`: `ZodOptional`\<`ZodNumber`\>; `vars`: `ZodOptional`\<`ZodCustom`\<..., ...\>\>; \}, `$strip`\>\]\>\>\]\>; \}, `$strip`\>

Defined in: [types/index.ts:915](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L915)
