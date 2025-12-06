# Implementation Plan: Per-Test Structured Output Support

## Overview

**Goal:** Enable per-test configuration of structured output (response_format, responseSchema, etc.) for all providers.

**Approach:** Merge `test.options` into `prompt.config` in the evaluator, allowing provider-specific configuration at test level.

**Timeline:** 1-2 days (~8-12 hours)

**Risk Level:** Medium (manageable with thorough testing)

---

## Table of Contents

1. [Design Decisions](#design-decisions)
2. [Code Changes](#code-changes)
3. [Testing Strategy](#testing-strategy)
4. [Documentation Updates](#documentation-updates)
5. [Examples](#examples)
6. [Migration Guide](#migration-guide)
7. [Changelog](#changelog)
8. [Risk Mitigation](#risk-mitigation)
9. [Rollout Strategy](#rollout-strategy)
10. [Success Criteria](#success-criteria)

---

## Design Decisions

### 1. Merge Strategy

**Decision:** Shallow merge with test options taking precedence

```typescript
prompt: {
  raw: '',
  label: promptLabel,
  config: {
    ...prompt.config,        // Base (lowest priority)
    ...test.options,         // Override (highest priority)
  },
},
```

**Rationale:**

- Simple to implement
- Follows JavaScript object spread semantics
- Clear precedence: test > prompt > provider
- Consistent with how prompt.config overrides provider.config

**Trade-off:** Shallow merge means nested objects are fully replaced, not deep-merged.

**Documentation requirement:** Document shallow merge behavior with examples.

---

### 2. Schema Changes

**Decision:** Add `.passthrough()` to `PromptConfigSchema`

**Rationale:**

- Allows provider-specific fields (response_format, responseSchema, etc.)
- Matches prompt.config behavior (which uses `z.any()`)
- Minimal code change
- Backward compatible

**Trade-off:** Loses type safety and validation for provider-specific fields.

**Mitigation:** Document that provider-level validation still occurs.

---

### 3. defaultTest.options Handling

**Decision:** Also merge `defaultTest.options` into `prompt.config`

**Precedence order:**

```
Provider config (lowest)
  ↓
Prompt config
  ↓
defaultTest.options
  ↓
test.options (highest)
```

**Rationale:**

- Consistency: If test.options merges, defaultTest.options should too
- Useful: Allows setting default structured output for all tests
- Expected: Users would expect defaultTest to work the same way

**Implementation:**

```typescript
prompt: {
  config: {
    ...prompt.config,
    ...defaultTest?.options,  // Default test options
    ...test.options,          // Specific test options
  },
},
```

---

### 4. Backward Compatibility

**Decision:** 100% backward compatible - no breaking changes

**Verification:**

- Existing configs continue to work unchanged
- test.options fields still accessible individually where currently used
- No API surface changes
- No behavior changes for existing code

---

## Code Changes

### Phase 1: Type System (5 minutes)

#### File: `src/validators/prompts.ts`

**Location:** Line 7-10

**Change:**

```typescript
// BEFORE:
export const PromptConfigSchema = z.object({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

// AFTER:
export const PromptConfigSchema = z
  .object({
    prefix: z.string().optional(),
    suffix: z.string().optional(),
  })
  .passthrough();
```

**Why:** Allows arbitrary provider-specific fields in test.options.

**Testing:** Verify schema accepts unknown fields.

---

### Phase 2: Evaluator (15 minutes)

#### File: `src/evaluator.ts`

**Location 1:** Line 327-330 (prompt config setup)

**Change:**

```typescript
// BEFORE:
const setup = {
  provider: {
    id: provider.id(),
    label: provider.label,
    config: provider.config,
  },
  prompt: {
    raw: '',
    label: promptLabel,
    config: prompt.config,
  },
  vars,
};

// AFTER:
const setup = {
  provider: {
    id: provider.id(),
    label: provider.label,
    config: provider.config,
  },
  prompt: {
    raw: '',
    label: promptLabel,
    config: {
      ...prompt.config,
      ...(test.options || {}),
    },
  },
  vars,
};
```

**Why:** Merges test.options into prompt.config for provider consumption.

**Testing:**

- Verify merge happens correctly
- Verify test.options override prompt.config
- Verify undefined test.options doesn't break

---

**Location 2:** Check if defaultTest.options should be included

**Search for:** Where defaultTest is accessed in evaluator

**Potential change:** If defaultTest is available in context, merge it too:

```typescript
config: {
  ...prompt.config,
  ...(defaultTest?.options || {}),  // If available
  ...(test.options || {}),
},
```

**Note:** Need to verify defaultTest is available in the runEval function context. May require passing it through from evaluation setup.

**Testing:**

- Verify defaultTest.options work
- Verify precedence: defaultTest < test.options

---

### Phase 3: Handle defaultTest Context (30 minutes)

**Investigation needed:**

1. Where is defaultTest available in the evaluation flow?
2. Is it passed to runEval?
3. Do we need to thread it through?

**Search locations:**

- `src/evaluator.ts` - main evaluation logic
- Where `runEval` is called
- Where test suite is processed

**If defaultTest is NOT available in runEval:**

**Option A:** Pass it as part of test

```typescript
interface AtomicTestCase {
  // ... existing fields
  _defaultOptions?: TestCase['options']; // Add this
}
```

**Option B:** Merge it earlier when creating atomic test cases

```typescript
// In test suite processing:
const atomicTest = {
  ...test,
  options: {
    ...(testSuite.defaultTest?.options || {}),
    ...(test.options || {}),
  },
};
```

**Recommendation:** Option B (merge earlier) - simpler, no API changes needed.

---

### Summary of Code Changes

| File                        | Lines   | Change                                 | Complexity | Time   |
| --------------------------- | ------- | -------------------------------------- | ---------- | ------ |
| `src/validators/prompts.ts` | 7-10    | Add `.passthrough()`                   | Trivial    | 5 min  |
| `src/evaluator.ts`          | 327-330 | Merge test.options into prompt.config  | Simple     | 15 min |
| `src/evaluator.ts`          | TBD     | Handle defaultTest.options (if needed) | Medium     | 30 min |

**Total code changes:** ~50 minutes

---

## Testing Strategy

### Unit Tests (2 hours)

#### File: `test/evaluator.test.ts`

**New test suite:** "Per-test configuration merging"

**Test cases:**

1. **Basic merge**

   ```typescript
   it('should merge test.options into prompt.config', () => {
     // Setup prompt with config
     // Setup test with options
     // Verify merged config has both
   });
   ```

2. **Override precedence**

   ```typescript
   it('should allow test.options to override prompt.config', () => {
     // Setup prompt with response_format: {type: 'json_object'}
     // Setup test with response_format: {type: 'json_schema', ...}
     // Verify test config wins
   });
   ```

3. **Shallow merge behavior**

   ```typescript
   it('should do shallow merge, not deep merge', () => {
     // Setup prompt with nested object
     // Setup test with partial nested object
     // Verify nested object is replaced, not merged
   });
   ```

4. **undefined test.options**

   ```typescript
   it('should handle undefined test.options', () => {
     // Setup test without options
     // Verify no error, prompt.config used as-is
   });
   ```

5. **Preserve other fields**

   ```typescript
   it('should preserve non-overlapping fields from both configs', () => {
     // Setup prompt with temperature
     // Setup test with response_format
     // Verify both are in merged config
   });
   ```

6. **defaultTest.options merge**

   ```typescript
   it('should merge defaultTest.options with correct precedence', () => {
     // Setup defaultTest with options
     // Setup test with options
     // Verify precedence: test > defaultTest > prompt
   });
   ```

7. **Empty objects**
   ```typescript
   it('should handle empty options objects', () => {
     // Test with options: {}
     // Verify no error
   });
   ```

---

### Integration Tests (3 hours)

#### File: `test/providers/openai.integration.test.ts`

**Test cases:**

1. **Per-test json_schema**

   ```typescript
   it('should use per-test response_format with json_schema', async () => {
     // Setup provider
     // Setup test with response_format in options
     // Call provider
     // Verify output is parsed JSON matching schema
   });
   ```

2. **Override prompt-level response_format**

   ```typescript
   it('should override prompt-level response_format', async () => {
     // Setup provider with prompt having response_format
     // Setup test with different response_format
     // Verify test-level config is used
   });
   ```

3. **External schema file**

   ```typescript
   it('should load schema from external file', async () => {
     // Setup test with file:// reference
     // Verify schema is loaded and used
   });
   ```

4. **Variable substitution in schema**
   ```typescript
   it('should substitute variables in response_format', async () => {
     // Setup test with {{vars}} in schema
     // Verify variables are substituted
   });
   ```

---

#### File: `test/providers/vertex.integration.test.ts`

**Test cases:**

1. **Per-test responseSchema**

   ```typescript
   it('should use per-test responseSchema for Google Vertex', async () => {
     // Setup Vertex provider
     // Setup test with responseSchema in options
     // Verify output matches Google schema format
   });
   ```

2. **Google-specific schema format**
   ```typescript
   it('should handle Google schema format (OBJECT, STRING, etc.)', async () => {
     // Setup test with Google schema types
     // Verify parsing works correctly
   });
   ```

---

#### File: `test/providers/azure.integration.test.ts`

**Test cases:**

1. **Azure per-test response_format**
   ```typescript
   it('should work with Azure OpenAI provider', async () => {
     // Same as OpenAI tests but for Azure
   });
   ```

---

### E2E Tests (2 hours)

#### File: `test/e2e/per-test-structured-output.test.ts`

**Test scenarios:**

1. **Full eval with per-test schemas**

   ```typescript
   it('should run full eval with different schemas per test', async () => {
     // Create config with multiple tests
     // Each test has different schema
     // Run eval
     // Verify all tests pass with correct outputs
   });
   ```

2. **Mix of test-level and prompt-level configs**

   ```typescript
   it('should handle mix of test-level and prompt-level configs', async () => {
     // Some tests with options, some without
     // Verify correct config used for each
   });
   ```

3. **defaultTest with options**

   ```typescript
   it('should apply defaultTest.options to all tests', async () => {
     // Setup defaultTest with response_format
     // Multiple tests without options
     // Verify all use default
   });
   ```

4. **Cross-provider scenario**
   ```typescript
   it('should work with multiple providers', async () => {
     // NOTE: Each provider needs appropriate syntax
     // This tests that provider-specific config works
   });
   ```

---

#### Test Fixture: `test/fixtures/per-test-structured-output.yaml`

```yaml
prompts:
  - 'Answer this question: {{question}}'

providers:
  - id: openai:gpt-4o-mini
    config:
      temperature: 0

tests:
  # Test 1: Math response
  - vars:
      question: "What is 15 * 7?"
    options:
      response_format:
        type: json_schema
        json_schema:
          name: math_response
          strict: true
          schema:
            type: object
            properties:
              answer:
                type: number
                description: The numerical answer
              explanation:
                type: string
                description: Step by step explanation
            required: [answer, explanation]
            additionalProperties: false
    assert:
      - type: javascript
        value: output.answer === 105
      - type: javascript
        value: typeof output.explanation === 'string'

  # Test 2: Comparison response (different schema)
  - vars:
      question: "Compare apples and oranges"
    options:
      response_format:
        type: json_schema
        json_schema:
          name: comparison_response
          strict: true
          schema:
            type: object
            properties:
              item1:
                type: string
              item2:
                type: string
              winner:
                type: string
                enum: [item1, item2, tie]
              reasoning:
                type: string
            required: [item1, item2, winner, reasoning]
            additionalProperties: false
    assert:
      - type: javascript
        value: ['item1', 'item2', 'tie'].includes(output.winner)
      - type: javascript
        value: output.item1 && output.item2 && output.reasoning

  # Test 3: External schema file
  - vars:
      question: "List prime numbers less than 20"
    options:
      response_format:
        type: json_schema
        json_schema: file://./test/fixtures/schemas/number-list.json
    assert:
      - type: javascript
        value: Array.isArray(output.numbers)
```

---

#### Test Fixture: `test/fixtures/schemas/number-list.json`

```json
{
  "name": "number_list_response",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "numbers": {
        "type": "array",
        "items": {
          "type": "number"
        },
        "description": "List of numbers"
      },
      "description": {
        "type": "string",
        "description": "Description of the numbers"
      }
    },
    "required": ["numbers", "description"],
    "additionalProperties": false
  }
}
```

---

### Provider-Specific Tests (1 hour)

**For each major provider, verify:**

1. ✅ OpenAI - response_format works
2. ✅ Azure OpenAI - response_format works
3. ✅ Google Vertex - responseSchema works
4. ✅ Google AI Studio - responseSchema works
5. ⚠️ Mistral - response_format (json_object only)
6. ⚠️ Bedrock - response_format (limited)
7. ℹ️ Anthropic - No structured output (document this)

**Test matrix:**

| Provider | Test           | Expected Result         |
| -------- | -------------- | ----------------------- |
| OpenAI   | json_object    | JSON output             |
| OpenAI   | json_schema    | Strict schema adherence |
| OpenAI   | External file  | Schema loaded correctly |
| Azure    | json_schema    | Same as OpenAI          |
| Vertex   | responseSchema | Google format works     |
| Vertex   | External file  | Schema loaded correctly |
| Mistral  | json_object    | Basic JSON works        |
| Mistral  | json_schema    | Ignored (no support)    |

---

### Regression Tests (1 hour)

**Verify no breaking changes:**

1. **Existing configs without test.options**

   ```typescript
   it('should work with configs that do not use test.options', async () => {
     // Use old-style config
     // Verify everything works as before
   });
   ```

2. **Existing test.options fields**

   ```typescript
   it('should preserve existing test.options behavior', async () => {
     // Test transform
     // Test storeOutputAs
     // Test runSerially
     // Verify all still work
   });
   ```

3. **Prompt-level response_format**
   ```typescript
   it('should preserve prompt-level response_format behavior', async () => {
     // Existing prompt with response_format
     // No test.options
     // Verify works as before
   });
   ```

---

### QA Checklist

**Before merging:**

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] All provider-specific tests pass
- [ ] All regression tests pass
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run format` passes
- [ ] `npm run build` succeeds
- [ ] `npm run tsc` succeeds (no type errors)

**Manual testing:**

- [ ] Test with OpenAI API
- [ ] Test with Google Vertex API
- [ ] Test with Azure OpenAI API
- [ ] Test external schema files
- [ ] Test variable substitution
- [ ] Test defaultTest.options
- [ ] Test config precedence (provider < prompt < test)
- [ ] Test shallow merge behavior
- [ ] Test undefined/null options
- [ ] Test empty options objects

**Edge cases:**

- [ ] Very large schemas
- [ ] Deeply nested schemas
- [ ] Schemas with $ref (OpenAI)
- [ ] Schemas with $defs (Azure)
- [ ] Invalid schema formats (should fail gracefully)
- [ ] Typos in field names (should pass through to provider)
- [ ] Mixed provider types in same config

---

## Documentation Updates

### 1. Main Configuration Guide (45 minutes)

**File:** `site/docs/configuration/guide.md`

**Add new section after "Tests":**

See detailed documentation template in full plan document.

Key sections to add:

- Per-Test Configuration overview
- Structured Output for different providers (OpenAI, Google, Mistral)
- External Schema Files
- Variable Substitution
- Configuration Priority
- Shallow Merge Behavior
- Best Practices

---

### 2. Provider-Specific Documentation (30 minutes per provider)

#### OpenAI Provider (`site/docs/providers/openai.md`)

Update "Structured Output" section with:

- Three levels of configuration (provider, prompt, test)
- Per-test examples
- External files
- Variable substitution
- Best practices

#### Google Vertex Provider (`site/docs/providers/vertex.md`)

Add "Structured Output" section with:

- Google schema format explanation
- Type mapping (STRING, NUMBER, etc.)
- Per-test examples
- External files

---

### 3. Migration Guide (30 minutes)

**File:** `site/docs/guides/migration.md`

Add section: "Migrating to Per-Test Structured Output"

Contents:

- Before/After examples
- Migration steps
- Using defaultTest for common cases
- Backward compatibility notes
- Common patterns
- Troubleshooting

---

## Examples

### 1. OpenAI Examples (30 minutes)

**Files to create:**

- `examples/openai-structured-output/per-test-schema.yaml`
- `examples/openai-structured-output/defaultTest-example.yaml`
- `examples/openai-structured-output/schemas/weather-schema.json`
- Update `examples/openai-structured-output/README.md`

---

### 2. Google Vertex Examples (30 minutes)

**Files to create:**

- `examples/google-vertex-structured-output/per-test-schema.yaml`
- `examples/google-vertex-structured-output/schemas/google-list-schema.json`

---

## Changelog

**File:** `CHANGELOG.md`

**Add to `## [Unreleased]` section:**

```markdown
### Added

- feat(config): add per-test structured output configuration (#XXXX)
  - Test-level `options` now override prompt-level config for all providers
  - Enables different `response_format` (OpenAI) or `responseSchema` (Google) per test
  - Eliminates need to duplicate prompts for different output schemas
  - `defaultTest.options` also merges into provider configuration
  - Configuration precedence: provider < prompt < defaultTest < test
  - Works with all providers (OpenAI, Azure, Google Vertex, Mistral, etc.)
  - Supports external schema files with `file://` prefix
  - Supports variable substitution in schemas
  - Uses shallow merge (object spread) - nested objects are fully replaced
  - 100% backward compatible with existing configurations
```

---

## Risk Mitigation

### 1. Shallow Merge Documentation

Create warning callouts in docs explaining shallow merge behavior with examples.

---

### 2. Provider Compatibility Matrix

Add comprehensive table showing which providers support what features.

---

### 3. Typo Detection (Future Enhancement)

Document as potential future enhancement: runtime warnings for unknown fields.

---

## Rollout Strategy

### Phase 1: Internal Testing (Day 1)

- Implement code changes
- Run full test suite
- Manual testing with major providers
- Verify backward compatibility

### Phase 2: Documentation (Day 1-2)

- Update all documentation
- Create examples
- Write migration guide
- Update CHANGELOG.md

### Phase 3: PR and Review (Day 2)

- Create feature branch
- Commit changes
- Create PR
- Address review feedback

### Phase 4: Community Engagement (After Merge)

- Discord response to original requester
- GitHub discussion/issue announcement
- Twitter/blog post (optional)

---

## Success Criteria

### Technical Success

- [ ] All tests pass
- [ ] No regressions
- [ ] Works with OpenAI, Azure, Google Vertex
- [ ] External schema files work
- [ ] Variable substitution works
- [ ] defaultTest.options work
- [ ] Backward compatible

### Documentation Success

- [ ] Configuration guide complete
- [ ] Provider docs updated
- [ ] Migration guide clear
- [ ] Examples functional
- [ ] Changelog accurate

### User Success

- [ ] Discord user confirms it works
- [ ] No bug reports after release
- [ ] Positive community feedback
- [ ] Users able to migrate easily

---

## Timeline Summary

| Day | Phase    | Tasks                         | Hours |
| --- | -------- | ----------------------------- | ----- |
| 1   | Code     | Implement changes, unit tests | 4-5   |
| 1   | Tests    | Integration tests, E2E tests  | 3-4   |
| 1-2 | Docs     | Update docs, migration guide  | 2-3   |
| 2   | Examples | Create example configs        | 1     |
| 2   | PR       | Create PR, initial review     | 1     |
| 2+  | Review   | Address feedback, iterate     | TBD   |

**Total estimate:** 1-2 days (8-12 hours) for initial implementation.

---

## Next Steps

1. [ ] Get approval for plan
2. [ ] Create feature branch: `feat/per-test-structured-output`
3. [ ] Implement code changes
4. [ ] Write tests
5. [ ] Update documentation
6. [ ] Create examples
7. [ ] Run full QA
8. [ ] Create PR
9. [ ] Address review feedback
10. [ ] Merge to main
11. [ ] Announce to community

---

## Appendix: Files Changed

### Code Files (2 files)

- `src/validators/prompts.ts` - Add .passthrough()
- `src/evaluator.ts` - Merge test.options into prompt.config

### Test Files (7 files - new)

- `test/evaluator.test.ts` - Unit tests
- `test/providers/openai.integration.test.ts` - OpenAI integration
- `test/providers/vertex.integration.test.ts` - Vertex integration
- `test/providers/azure.integration.test.ts` - Azure integration
- `test/e2e/per-test-structured-output.test.ts` - E2E tests
- `test/fixtures/per-test-structured-output.yaml` - Test fixture
- `test/fixtures/schemas/number-list.json` - Schema fixture

### Documentation Files (4 files)

- `site/docs/configuration/guide.md` - Main config guide
- `site/docs/providers/openai.md` - OpenAI docs
- `site/docs/providers/vertex.md` - Vertex docs
- `site/docs/guides/migration.md` - Migration guide

### Example Files (6 files)

- `examples/openai-structured-output/per-test-schema.yaml`
- `examples/openai-structured-output/defaultTest-example.yaml`
- `examples/openai-structured-output/schemas/weather-schema.json`
- `examples/openai-structured-output/README.md` (update)
- `examples/google-vertex-structured-output/per-test-schema.yaml`
- `examples/google-vertex-structured-output/schemas/google-list-schema.json`

### Other Files (1 file)

- `CHANGELOG.md` - Changelog entry

**Total:** ~20 files changed/created
