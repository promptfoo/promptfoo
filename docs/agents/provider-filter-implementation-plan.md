# Implementation Plan: Test-Level Providers Filter

**Related Issues:** #2453, #1098
**Depends on:** PR #6686 (test-level prompts filter) - same pattern

## Summary

Add a `providers` field to test cases that filters which providers a test runs against, completing the solution for running isolated test suites.

## User Story

```yaml
prompts:
  - id: fact-prompt
    raw: 'Generate a fact about {{topic}}'
  - id: math-prompt
    raw: 'Solve: {{problem}}'

providers:
  - id: openai:gpt-3.5-turbo
    label: fast-model
  - id: openai:gpt-4
    label: smart-model

tests:
  # Suite 1 - only fast-model + fact-prompt
  - description: Monkey facts
    vars:
      topic: monkeys
    providers:
      - fast-model
    prompts:
      - fact-prompt
    assert:
      - type: contains
        value: monkey

  # Suite 2 - only smart-model + math-prompt
  - description: Complex math
    vars:
      problem: "Prove Fermat's Last Theorem"
    providers:
      - smart-model
    prompts:
      - math-prompt
    assert:
      - type: latency
        threshold: 30000
```

**Result:** 2 test cases run instead of 8 (2 tests × 2 providers × 2 prompts).

## Files to Change

### 1. Schema: `src/types/index.ts`

Add `providers` field to `TestCaseSchema`:

```typescript
// Line ~696, after the prompts field added by #6686
providers: z.array(z.string()).optional(),
```

### 2. New Utility: `src/util/providerMatching.ts`

```typescript
import type { ApiProvider } from '../types/providers';

/**
 * Gets the identifier string for a provider (label or id)
 */
export function getProviderIdentifier(provider: ApiProvider): string {
  return provider.label || provider.id();
}

/**
 * Checks if a provider reference matches a given provider.
 * Supports exact matching and wildcard patterns.
 */
export function doesProviderRefMatch(ref: string, provider: ApiProvider): boolean {
  const label = provider.label;
  const id = provider.id();

  // Exact label match
  if (label && label === ref) {
    return true;
  }

  // Exact ID match
  if (id === ref) {
    return true;
  }

  // Wildcard match: 'openai:*' matches 'openai:gpt-4', etc.
  if (ref.endsWith('*')) {
    const prefix = ref.slice(0, -1);
    if (label?.startsWith(prefix) || id.startsWith(prefix)) {
      return true;
    }
  }

  // Legacy prefix match: 'openai' matches 'openai:gpt-4'
  if (label?.startsWith(`${ref}:`) || id.startsWith(`${ref}:`)) {
    return true;
  }

  return false;
}

/**
 * Checks if a provider is allowed based on a list of allowed references.
 */
export function isProviderAllowed(
  provider: ApiProvider,
  allowedProviders: string[] | undefined
): boolean {
  if (!Array.isArray(allowedProviders)) {
    return true; // No filter = all allowed
  }
  if (allowedProviders.length === 0) {
    return false; // Empty array = none allowed
  }
  return allowedProviders.some((ref) => doesProviderRefMatch(ref, provider));
}
```

### 3. Validation: `src/util/validateTestProviderReferences.ts`

Similar to `validateTestPromptReferences.ts`:

```typescript
import type { ApiProvider } from '../types/providers';
import type { TestCase } from '../types/index';
import { doesProviderRefMatch, getProviderIdentifier } from './providerMatching';

export class ProviderReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderReferenceValidationError';
  }
}

export function validateTestProviderReferences(
  tests: TestCase[],
  providers: ApiProvider[],
  defaultTest?: Partial<TestCase>
): void {
  // Validate defaultTest.providers
  if (defaultTest?.providers) {
    for (const ref of defaultTest.providers) {
      if (!providers.some((p) => doesProviderRefMatch(ref, p))) {
        const available = providers.map(getProviderIdentifier).join(', ');
        throw new ProviderReferenceValidationError(
          `defaultTest references provider "${ref}" which does not exist. Available providers: ${available}`
        );
      }
    }
  }

  // Validate each test's providers
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    if (!test.providers) continue;

    for (const ref of test.providers) {
      if (!providers.some((p) => doesProviderRefMatch(ref, p))) {
        const desc = test.description ? ` ("${test.description}")` : '';
        const available = providers.map(getProviderIdentifier).join(', ');
        throw new ProviderReferenceValidationError(
          `Test #${i + 1}${desc} references provider "${ref}" which does not exist. Available providers: ${available}`
        );
      }
    }
  }
}
```

### 4. Evaluator: `src/evaluator.ts`

Add import and filter check:

```typescript
// Add import
import { isProviderAllowed } from './util/providerMatching';

// In the evaluate() method, around line 1115
for (const provider of testSuite.providers) {
  // Test-level provider filtering (NEW)
  if (!isProviderAllowed(provider, testCase.providers)) {
    continue;
  }
  for (const prompt of testSuite.prompts) {
    // ... existing code
  }
}

// Also handle defaultTest inheritance, around line 1060
testCase.providers =
  testCase.providers ??
  (typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.providers : undefined);
```

### 5. Config Loading: `src/util/config/load.ts`

Add validation call:

```typescript
import { validateTestProviderReferences } from '../validateTestProviderReferences';

// After validateTestPromptReferences call, around line 712
validateTestProviderReferences(
  testSuite.tests || [],
  testSuite.providers,
  typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : undefined,
);
```

### 6. JSON Schema: `site/static/config-schema.json`

Add providers field to TestCase (similar to prompts):

```json
"providers": {
  "type": "array",
  "items": {
    "type": "string"
  }
}
```

### 7. Documentation: `site/docs/configuration/test-cases.md`

Add section "Filtering Tests by Provider" (similar to "Filtering Tests by Prompt").

### 8. Example: `examples/tests-per-provider/`

Create example showing isolated test suites.

### 9. Tests: `test/test-providers-filter.test.ts`

Unit tests covering:
- Exact label matching
- Exact ID matching
- Wildcard matching (`openai:*`)
- Legacy prefix matching
- defaultTest inheritance
- Validation errors
- Integration with prompts filter

## Combined Solution

With both PR #6686 (prompts filter) and this PR merged, the user's problem from #2453 is fully solved:

```yaml
# Single config file with complete isolation
prompts:
  - id: fact-prompt
    raw: 'Generate a fact about {{topic}}'
  - id: math-prompt
    raw: 'Solve: {{problem}}'

providers:
  - id: azure:chat:gpt-35-turbo
    label: gpt-35
    config:
      apiHost: 'org.openai.azure.com'
  - id: azure:chat:gpt-4o
    label: gpt-4o
    config:
      apiHost: 'org.openai.azure.com'

tests:
  # Facts suite - cheap model
  - vars: { topic: monkeys }
    providers: [gpt-35]
    prompts: [fact-prompt]
    assert:
      - type: latency
        threshold: 3000

  - vars: { topic: bananas }
    providers: [gpt-35]
    prompts: [fact-prompt]

  # Math suite - expensive model
  - vars: { problem: 'Prove Pythagorean Theorem' }
    providers: [gpt-4o]
    prompts: [math-prompt]
    assert:
      - type: latency
        threshold: 30000
```

## Implementation Order

1. Wait for PR #6686 to merge (provides the pattern)
2. Create this PR following the same pattern
3. Link to #2453 and #1098
4. Consider closing those issues or marking as resolved

## Alternative: Combine into #6686?

Could add providers filter to PR #6686 directly, but:
- PR #6686 is already substantial (739 additions)
- Adding providers would increase scope significantly
- Better to follow established pattern with separate, focused PR
- Easier to review and test independently
