[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TestGeneratorConfigSchema

# Variable: TestGeneratorConfigSchema

> `const` **TestGeneratorConfigSchema**: `ZodObject`\<\{ `config`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnion`\<readonly \[`ZodString`, `ZodNumber`, `ZodBoolean`, `ZodArray`\<`ZodUnion`\<readonly \[`ZodString`, `ZodNumber`, `ZodBoolean`\]\>\>, `ZodRecord`\<`ZodString`, `ZodAny`\>, `ZodAny`\]\>\>\>; `path`: `ZodString`; \}, `$strip`\>

Defined in: [types/index.ts:959](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L959)

Configuration schema for test generators that accept parameters

## Example

```yaml
tests:
  - path: file://test_cases.py:generate_tests
    config:
      dataset: truthfulqa
      split: validation
      max_rows: 100
```
