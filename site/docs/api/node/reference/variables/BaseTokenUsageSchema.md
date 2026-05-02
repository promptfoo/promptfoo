[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / BaseTokenUsageSchema

# Variable: BaseTokenUsageSchema

> `const` **BaseTokenUsageSchema**: `ZodObject`\<\{ `assertions`: `ZodOptional`\<`ZodObject`\<\{ `cached`: `ZodOptional`\<`ZodNumber`\>; `completion`: `ZodOptional`\<`ZodNumber`\>; `completionDetails`: `ZodOptional`\<`ZodObject`\<\{ `acceptedPrediction`: `ZodOptional`\<`ZodNumber`\>; `cacheCreationInputTokens`: `ZodOptional`\<`ZodNumber`\>; `cacheReadInputTokens`: `ZodOptional`\<`ZodNumber`\>; `reasoning`: `ZodOptional`\<`ZodNumber`\>; `rejectedPrediction`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>\>; `numRequests`: `ZodOptional`\<`ZodNumber`\>; `prompt`: `ZodOptional`\<`ZodNumber`\>; `total`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>\>; `cached`: `ZodOptional`\<`ZodNumber`\>; `completion`: `ZodOptional`\<`ZodNumber`\>; `completionDetails`: `ZodOptional`\<`ZodObject`\<\{ `acceptedPrediction`: `ZodOptional`\<`ZodNumber`\>; `cacheCreationInputTokens`: `ZodOptional`\<`ZodNumber`\>; `cacheReadInputTokens`: `ZodOptional`\<`ZodNumber`\>; `reasoning`: `ZodOptional`\<`ZodNumber`\>; `rejectedPrediction`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>\>; `numRequests`: `ZodOptional`\<`ZodNumber`\>; `prompt`: `ZodOptional`\<`ZodNumber`\>; `total`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>

Defined in: [types/shared.ts:17](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/shared.ts#L17)

Base schema for token usage statistics with all fields optional
