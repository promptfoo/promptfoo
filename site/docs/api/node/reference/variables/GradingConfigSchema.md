[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / GradingConfigSchema

# Variable: GradingConfigSchema

> `const` **GradingConfigSchema**: `ZodObject`\<\{ `factuality`: `ZodOptional`\<`ZodObject`\<\{ `agree`: `ZodOptional`\<`ZodNumber`\>; `differButFactual`: `ZodOptional`\<`ZodNumber`\>; `disagree`: `ZodOptional`\<`ZodNumber`\>; `subset`: `ZodOptional`\<`ZodNumber`\>; `superset`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>\>; `provider`: `ZodOptional`\<`ZodUnion`\<readonly \[`ZodString`, `ZodAny`, `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnion`\<readonly \[`ZodString`, `ZodAny`\]\>\>\>\]\>\>; `rubricPrompt`: `ZodOptional`\<`ZodUnion`\<readonly \[`ZodString`, `ZodArray`\<`ZodString`\>, `ZodArray`\<`ZodObject`\<\{ `content`: `ZodString`; `role`: `ZodString`; \}, `$strip`\>\>\]\>\>; \}, `$strip`\>

Defined in: [types/index.ts:152](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L152)
