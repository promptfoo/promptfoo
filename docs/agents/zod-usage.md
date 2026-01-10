# Zod Usage Documentation

Comprehensive documentation of how Zod schema validation is used throughout the promptfoo codebase, prepared for a major refactor.

## Table of Contents

1. [Overview](#overview)
2. [File Locations](#file-locations)
3. [Schema Categories](#schema-categories)
4. [Usage Patterns](#usage-patterns)
5. [Type Inference Patterns](#type-inference-patterns)
6. [Integration with Other Libraries](#integration-with-other-libraries)
7. [Validation Patterns](#validation-patterns)
8. [Current Issues & Technical Debt](#current-issues--technical-debt)
9. [Refactoring Recommendations](#refactoring-recommendations)

---

## Overview

The codebase uses Zod v3 for runtime schema validation across:
- **59 files** with Zod imports
- Configuration validation (YAML configs, CLI options)
- API request/response validation
- Type inference from schemas
- MCP tool parameter definitions
- Redteam plugin/strategy validation

**Key Observation**: The codebase is in transition - `src/types/index.ts` contains a note:
> "Note: This file is in the process of being deconstructed into `types/` and `validators/`"

---

## File Locations

### Core Validators (`src/validators/`)

| File | Purpose |
|------|---------|
| `shared.ts` | `NunjucksFilterMapSchema` - shared utility schemas |
| `providers.ts` | Provider schemas: `ProviderOptionsSchema`, `ApiProviderSchema`, `ProviderResponseSchema`, `ProvidersSchema` |
| `prompts.ts` | Prompt schemas: `PromptConfigSchema`, `PromptSchema`, `PromptFunctionSchema` |
| `redteam.ts` | Redteam config: `RedteamConfigSchema`, `RedteamPluginSchema`, `RedteamStrategySchema`, `RedteamGenerateOptionsSchema` |
| `testProvider.ts` | Provider testing utilities |
| `util.ts` | Validation helper functions (no Zod schemas) |

### Type Definitions (`src/types/`)

| File | Purpose |
|------|---------|
| `index.ts` | **Main types file** - contains majority of schemas (700+ lines with Zod) |
| `shared.ts` | `BaseTokenUsageSchema` |
| `env.ts` | `ProviderEnvOverridesSchema` |
| `codeScan.ts` | `CodeScanSeveritySchema` |

### Server Routes (`src/server/`)

| File | Purpose |
|------|---------|
| `apiSchemas.ts` | API request/response schemas organized by endpoint |
| `routes/eval.ts` | Uses `fromZodError` for validation error formatting |
| `routes/redteam.ts` | Redteam API validation |
| `routes/providers.ts` | Provider API validation |
| `routes/user.ts` | User API validation |

### Commands (`src/commands/`)

| File | Purpose |
|------|---------|
| `eval.ts` | CLI option parsing |
| `config.ts` | Email validation with `z.string().email()` |
| `validate.ts` | Config validation using `UnifiedConfigSchema.safeParse()` |
| `modelScan.ts` | Model scanning schemas |
| `mcp/tools/*.ts` | MCP tool parameter definitions (10+ files) |

### Redteam (`src/redteam/`)

| File | Purpose |
|------|---------|
| `types.ts` | `PolicyObjectSchema`, `PluginConfigSchema`, `StrategyConfigSchema`, `ConversationMessageSchema` |
| `constants/metadata.ts` | Redteam metadata schemas |
| `commands/generate.ts` | Config validation with `RedteamConfigSchema.safeParse()` |
| `commands/discover.ts` | Discovery schemas and state management |
| `extraction/util.ts` | Response parsing schemas |

### Providers (`src/providers/`)

| File | Purpose |
|------|---------|
| `http.ts` | HTTP provider configuration |
| `sagemaker.ts` | SageMaker provider validation |
| `watsonx.ts` | Watsonx provider validation |
| `google/util.ts` | Google provider utilities |

### Other Notable Files

| File | Purpose |
|------|---------|
| `src/telemetry.ts` | `TelemetryEventSchema` for event tracking |
| `src/globalConfig/accounts.ts` | Email validation |
| `src/assertions/validateAssertions.ts` | Assertion validation with error handling |
| `src/codeScan/config/schema.ts` | Code scanning configuration |
| `src/models/prompt.ts` | Prompt model schema |

---

## Schema Categories

### 1. Configuration Schemas

```typescript
// src/types/index.ts
export const CommandLineOptionsSchema = z.object({
  description: z.string().optional(),
  providers: z.array(z.string()),
  maxConcurrency: z.coerce.number().int().positive().optional(),
  // ... 30+ fields
});

export const TestCaseSchema = z.object({
  description: z.string().optional(),
  vars: VarsSchema.optional(),
  provider: z.union([z.string(), ProviderOptionsSchema, ApiProviderSchema]).optional(),
  assert: z.array(z.union([AssertionSetSchema, AssertionSchema])).optional(),
  // ...
});

export const UnifiedConfigSchema = z.object({
  // Complete configuration schema
});
```

### 2. Assertion Schemas

```typescript
// src/types/index.ts
export const BaseAssertionTypesSchema = z.enum([
  'answer-relevance', 'bleu', 'classifier', 'contains',
  'contains-all', 'contains-any', 'contains-json',
  // ... 40+ assertion types
]);

export const AssertionSchema = z.object({
  type: AssertionTypeSchema,
  value: z.custom<AssertionValue>().optional(),
  config: z.record(z.string(), z.any()).optional(),
  threshold: z.number().optional(),
  weight: z.number().optional(),
  provider: z.custom<GradingConfig['provider']>().optional(),
  // ...
});

export const AssertionSetSchema = z.object({
  type: z.literal('assert-set'),
  assert: z.array(z.lazy(() => AssertionSchema)),
  // ...
});
```

### 3. Provider Schemas

```typescript
// src/validators/providers.ts
export const ProviderOptionsSchema = z.object({
  id: z.custom<ProviderId>().optional(),
  label: z.custom<ProviderLabel>().optional(),
  config: z.any().optional(),
  prompts: z.array(z.string()).optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  env: ProviderEnvOverridesSchema.optional(),
  inputs: InputsSchema.optional(),
});

export const ProviderResponseSchema = z.object({
  cached: z.boolean().optional(),
  cost: z.number().optional(),
  error: z.string().optional(),
  output: z.union([z.string(), z.any()]).optional(),
  tokenUsage: BaseTokenUsageSchema.optional(),
  // ...
});
```

### 4. Redteam Schemas

```typescript
// src/validators/redteam.ts
export const RedteamPluginObjectSchema = z.object({
  id: z.union([
    z.enum(pluginOptions as [string, ...string[]]).superRefine((val, ctx) => {
      // Custom validation with helpful error messages
    }),
    z.string().superRefine((val, ctx) => {
      if (!val.startsWith('file://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid plugin id "${val}"...`,
        });
      }
    }),
  ]),
  numTests: z.number().int().positive().default(DEFAULT_NUM_TESTS_PER_PLUGIN),
  config: z.record(z.unknown()).optional(),
  severity: SeveritySchema.optional(),
});

export const RedteamConfigSchema = z.object({
  // ... many fields
}).transform((data): RedteamFileConfig => {
  // Complex transformation logic for plugin/strategy expansion
  // ~200 lines of transformation code
});
```

### 5. API Schemas

```typescript
// src/server/apiSchemas.ts
export const ApiSchemas = {
  User: {
    Get: {
      Response: z.object({ email: EmailSchema.nullable() }),
    },
    Update: {
      Request: z.object({ email: EmailSchema }),
      Response: z.object({ success: z.boolean(), message: z.string() }),
    },
    EmailStatus: {
      Response: z.object({
        hasEmail: z.boolean(),
        email: EmailSchema.optional(),
        status: z.enum(['ok', 'exceeded_limit', 'show_usage_warning', 'no_email', 'risky_email', 'disposable_email']),
      }),
    },
  },
  Eval: {
    UpdateAuthor: { /* ... */ },
    MetadataKeys: { /* ... */ },
    Copy: { /* ... */ },
  },
};
```

### 6. MCP Tool Schemas

```typescript
// src/commands/mcp/tools/runEvaluation.ts
server.tool('run_evaluation', {
  configPath: z.string().optional().describe('Path to config file'),
  testCaseIndices: z.union([
    z.number(),
    z.array(z.number()),
    z.object({
      start: z.number().describe('Start index (inclusive)'),
      end: z.number().describe('End index (exclusive)'),
    }),
  ]).optional(),
  maxConcurrency: z.number().min(1).max(20).optional(),
  timeoutMs: z.number().min(1000).max(300000).optional(),
  cache: z.boolean().optional().default(true),
  // ...
}, async (args) => { /* handler */ });
```

---

## Usage Patterns

### Pattern 1: Schema Definition with Type Inference

```typescript
// Define schema
export const TestCaseSchema = z.object({
  description: z.string().optional(),
  vars: VarsSchema.optional(),
});

// Infer type from schema
export type TestCase = z.infer<typeof TestCaseSchema>;
```

**Used in**: `src/types/index.ts`, `src/validators/*.ts`, `src/redteam/types.ts`

### Pattern 2: Safe Parsing with Error Handling

```typescript
// src/redteam/commands/generate.ts
const parsedConfig = RedteamConfigSchema.safeParse(config);
if (!parsedConfig.success) {
  const errorMessage = fromError(parsedConfig.error).toString();
  throw new Error(`Invalid redteam configuration:\n${errorMessage}`);
}
```

**Used in**: `src/commands/validate.ts`, `src/redteam/commands/*.ts`, `src/codeScan/config/loader.ts`

### Pattern 3: Schema with Transform

```typescript
// src/validators/redteam.ts
export const RedteamConfigSchema = z.object({
  plugins: z.array(RedteamPluginSchema).default(['default']),
  strategies: z.array(RedteamStrategySchema).optional().default(['default']),
  // ...
}).transform((data): RedteamFileConfig => {
  // Expand collections, handle aliases, deduplicate
  const pluginMap = new Map<string, RedteamPluginObject>();
  // ... complex transformation logic
  return { plugins: uniquePlugins, strategies, ... };
});
```

**Used in**: `src/validators/redteam.ts`, `src/codeScan/config/schema.ts`

### Pattern 4: Custom Validation with superRefine

```typescript
// src/validators/redteam.ts - Zod v4 syntax
z.enum(pluginOptions as [string, ...string[]]).superRefine((val, ctx) => {
  if (!pluginOptions.includes(val)) {
    ctx.addIssue({
      code: 'custom',  // Use 'custom' instead of deprecated z.ZodIssueCode.invalid_enum_value
      message: `Invalid plugin name. Must be one of: ${pluginOptions.join(', ')}`,
    });
  }
})
```

**Note**: In Zod v4, `z.ZodIssueCode.invalid_enum_value` is deprecated. Use `'custom'` code instead.

**Used in**: `src/validators/redteam.ts` (strategies, plugins)

### Pattern 5: Lazy Schemas for Recursion

```typescript
// src/types/index.ts
export const AssertionSetSchema = z.object({
  type: z.literal('assert-set'),
  assert: z.array(z.lazy(() => AssertionSchema)),  // Recursive reference
  // ...
});
```

**Used in**: `src/types/index.ts` (assertions), `src/validators/redteam.ts` (tracing config)

### Pattern 6: Schema Extension

```typescript
// src/types/index.ts
export const CompletedPromptSchema = PromptSchema.extend({
  provider: z.string(),
  metrics: PromptMetricsSchema.optional(),
});

export const AtomicTestCaseSchema = TestCaseSchema.extend({
  vars: z.record(z.union([z.string(), z.object({})])).optional(),
}).strict();
```

**Used in**: `src/types/index.ts`

### Pattern 7: Union Types for Flexibility

```typescript
// src/validators/providers.ts
export const ProvidersSchema = z.union([
  z.string(),
  CallApiFunctionSchema,
  z.array(z.union([
    z.string(),
    CallApiFunctionSchema,
    z.record(z.string(), ProviderOptionsSchema),
    ProviderOptionsSchema,
  ])),
]);
```

**Used in**: Most schema files

### Pattern 8: Coercion for CLI Input

```typescript
// src/types/index.ts
export const CommandLineOptionsSchema = z.object({
  maxConcurrency: z.coerce.number().int().positive().optional(),
  repeat: z.coerce.number().int().positive().optional(),
  delay: z.coerce.number().int().nonnegative().default(0),
  filterFirstN: z.coerce.number().int().positive().optional(),
});
```

**Used in**: `src/types/index.ts` (CLI options)

---

## Type Inference Patterns

### Pattern 1: Direct Inference

```typescript
export type CommandLineOptions = z.infer<typeof CommandLineOptionsSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
```

### Pattern 2: Inference with Additional Properties

```typescript
// src/types/index.ts
export type EvaluateOptions = z.infer<typeof EvaluateOptionsSchema> & {
  abortSignal?: AbortSignal;  // Added manually
};
```

### Pattern 3: Type Equality Assertions

```typescript
// src/validators/prompts.ts
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
function assert<_T extends true>() {}

// Ensure schema matches manually-defined type
assert<AssertEqual<PromptConfig, z.infer<typeof PromptConfigSchema>>>();
assert<AssertEqual<PromptFunction, z.infer<typeof PromptFunctionSchema>>>();
assert<AssertEqual<Prompt, z.infer<typeof PromptSchema>>>();
```

```typescript
// src/validators/redteam.ts
function assert<_T extends never>() {}
type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;

assert<TypeEqualityGuard<RedteamFileConfig, z.infer<typeof RedteamConfigSchema>>>();

// TODO comment: Why is this never?
// assert<TypeEqualityGuard<RedteamPluginObject, z.infer<typeof RedteamPluginObjectSchema>>>();
```

---

## Integration with Other Libraries

### 1. zod-validation-error

```typescript
import { fromError, fromZodError } from 'zod-validation-error';

// Usage in src/commands/validate.ts
const configParse = UnifiedConfigSchema.safeParse(config);
if (!configParse.success) {
  const prettyError = fromError(configParse.error);
  logger.error(prettyError.toString());
}

// Usage in src/assertions/validateAssertions.ts
const result = AssertionOrSetSchema.safeParse(assertion);
if (!result.success) {
  const zodError = fromError(result.error);
  throw new AssertValidationError(`${zodError.message}`);
}
```

### 2. MCP Server Integration

```typescript
// src/commands/mcp/tools/*.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

server.tool('tool_name', {
  param1: z.string().describe('Description'),
  param2: z.number().min(1).max(100).optional(),
}, async (args) => {
  // Args are validated by MCP SDK using Zod schema
});
```

### 3. Custom Types Integration

```typescript
// Using z.custom<T>() for complex TypeScript types
provider: z.custom<GradingConfig['provider']>().optional(),
assertion: z.custom<Assertion>().optional(),
tokenUsage: z.custom<TokenUsage>().optional(),
```

---

## Validation Patterns

### Runtime Validation

```typescript
// src/assertions/validateAssertions.ts
export function validateAssertions(tests: TestCase[], defaultTest?: Partial<TestCase>): void {
  if (defaultTest?.assert) {
    for (let i = 0; i < defaultTest.assert.length; i++) {
      const result = AssertionOrSetSchema.safeParse(defaultTest.assert[i]);
      if (!result.success) {
        throw new AssertValidationError(/*...*/);
      }
    }
  }
}
```

### Config Validation

```typescript
// src/commands/validate.ts
const configParse = UnifiedConfigSchema.safeParse(config);
if (!configParse.success) {
  // Handle error
}

const suiteParse = TestSuiteSchema.safeParse(testSuite);
if (!suiteParse.success) {
  // Handle error
}
```

### Email Validation

```typescript
// src/globalConfig/accounts.ts
const emailSchema = z.string().email('Please enter a valid email address');
const result = emailSchema.safeParse(input);
return result.success || result.error.errors[0].message;
```

---

## Current Issues & Technical Debt

### 1. Mixed Schema/Type Locations

The codebase acknowledges this in `src/types/index.ts`:
> "Note: This file is in the process of being deconstructed into `types/` and `validators/`"

**Impact**:
- `src/types/index.ts` is ~1000+ lines with both Zod schemas and TypeScript types
- Unclear separation between validation logic and type definitions
- Circular import potential between `types/` and `validators/`

### 2. Overuse of `z.any()` and `z.custom<T>()`

```typescript
// Found patterns
config: z.any().optional(),
provider: z.custom<GradingConfig['provider']>().optional(),
```

**Impact**: Bypasses runtime validation, loses type safety

### 3. Complex Transform Logic in Schemas

```typescript
// src/validators/redteam.ts - ~200 lines of transform logic
export const RedteamConfigSchema = z.object({...}).transform((data) => {
  // Plugin expansion, alias handling, deduplication
  // This is business logic, not validation
});
```

**Impact**: Makes schemas hard to understand and test

### 4. Inconsistent Type Equality Patterns

Two different patterns used:
```typescript
// Pattern 1: src/validators/prompts.ts
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
function assert<_T extends true>() {}

// Pattern 2: src/validators/redteam.ts
function assert<_T extends never>() {}
type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;
```

### 5. TODO Comments Indicating Unresolved Issues

```typescript
// src/validators/redteam.ts
// TODO: Why is this never?
// assert<TypeEqualityGuard<RedteamPluginObject, z.infer<typeof RedteamPluginObjectSchema>>>();
```

### 6. Duplicate Validation Logic

Email validation exists in multiple places:
- `src/server/apiSchemas.ts`
- `src/globalConfig/accounts.ts`
- `src/commands/config.ts`

---

## Refactoring Recommendations

### 1. Complete Schema/Type Separation

```
src/
├── schemas/           # Zod schemas only
│   ├── assertions.ts
│   ├── config.ts
│   ├── providers.ts
│   ├── prompts.ts
│   ├── redteam.ts
│   ├── api/           # API schemas by endpoint
│   └── index.ts       # Re-exports
├── types/             # TypeScript interfaces (no Zod)
│   ├── assertions.ts
│   ├── config.ts
│   └── ...
└── validators/        # Validation functions using schemas
    ├── assertions.ts
    ├── config.ts
    └── ...
```

### 2. Extract Transform Logic

Move business logic out of schemas:

```typescript
// schemas/redteam.ts
export const RedteamConfigInputSchema = z.object({
  plugins: z.array(RedteamPluginSchema),
  // Raw input schema without transforms
});

// utils/redteam.ts
export function normalizeRedteamConfig(
  input: z.infer<typeof RedteamConfigInputSchema>
): RedteamFileConfig {
  // Business logic here
}
```

### 3. Replace `z.any()` with Proper Schemas

```typescript
// Before
config: z.any().optional(),

// After
config: z.record(z.string(), z.unknown()).optional(),
// or define specific config schema
```

### 4. Standardize Type Equality Assertions

Create shared utility:

```typescript
// src/utils/typeAssert.ts
export type TypeEquals<T, U> =
  (<V>() => V extends T ? 1 : 2) extends
  (<V>() => V extends U ? 1 : 2) ? true : false;

export function assertTypeEquals<T extends true>() {}
```

### 5. Create Shared Validators

```typescript
// src/schemas/common.ts
export const EmailSchema = z.string().email();
export const UUIDSchema = z.string().uuid();
export const NonEmptyStringSchema = z.string().min(1);
```

### 6. Document Schema Purposes

Add JSDoc comments to all schemas:

```typescript
/**
 * Schema for validating test case configuration.
 * Used in: YAML config, CLI input, API requests
 * @see TestCase type for usage
 */
export const TestCaseSchema = z.object({...});
```

### 7. Add Schema Versioning

For breaking changes:

```typescript
export const TestCaseSchemaV1 = z.object({...});
export const TestCaseSchemaV2 = TestCaseSchemaV1.extend({...});
export const TestCaseSchema = TestCaseSchemaV2; // Current version
```

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Files with Zod imports | 59 |
| Schema definitions | ~80+ |
| Uses of `z.infer<>` | ~40+ |
| Uses of `.safeParse()` | ~15+ |
| Uses of `.transform()` | ~5 |
| Uses of `.superRefine()` | ~5 |
| Uses of `z.lazy()` | ~3 |
| Uses of `z.custom<T>()` | ~20+ |
| Uses of `z.any()` | ~10+ |

---

## Files to Review First for Refactor

1. **`src/types/index.ts`** - Main schema file, needs decomposition
2. **`src/validators/redteam.ts`** - Complex transforms need extraction
3. **`src/server/apiSchemas.ts`** - API schema organization pattern
4. **`src/assertions/validateAssertions.ts`** - Error handling pattern
5. **`src/commands/mcp/tools/*.ts`** - MCP integration pattern
