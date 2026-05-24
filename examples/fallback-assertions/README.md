# fallback-assertions (Fallback Assertions Example)

You can run this example with:

```bash
npx promptfoo@latest init --example fallback-assertions
cd fallback-assertions
```

This example demonstrates the **fallback assertion mechanism** in promptfoo, which allows you to create cascading validation strategies where expensive checks only run if cheaper checks fail.

## Use Case

The primary use case is **performance optimization**:

- Run fast, exact checks first (e.g., exact string match, regex, simple JavaScript)
- Only trigger expensive LLM-based judges if the fast checks fail
- Save tokens and reduce latency when responses match expected patterns

## How It Works

When an assertion has `fallback: next`:

1. The assertion executes normally
2. **If it passes**: The next assertion is **skipped**
3. **If it fails**: The next assertion **executes as a fallback**
4. Only the final result (primary if passed, fallback if primary failed) **affects the score**

### Example Flow

```yaml
assert:
  - type: javascript # Fast check
    value: "output.trim() === 'Paris'"
    fallback: next

  - type: llm-rubric # Expensive LLM judge (fallback)
    value: 'Response correctly identifies Paris'
```

**Scenario A** (output = "Paris"):

- JavaScript check **passes** → LLM rubric **skipped**
- Final score: 1.0 (from JavaScript)
- Tokens used: ~0

**Scenario B** (output = "The capital is Paris"):

- JavaScript check **fails** → LLM rubric **executes**
- LLM rubric **passes** (score: 0.9)
- Final score: 0.9 (from LLM rubric, JavaScript result excluded)
- Tokens used: ~200

## Multi-Level Chains

You can chain multiple fallbacks:

```yaml
assert:
  - type: contains # Level 1: Simple check
    value: 'keyword'
    fallback: next

  - type: regex # Level 2: More flexible
    value: '(keyword|synonym)'
    fallback: next

  - type: llm-rubric # Level 3: Final arbiter
    value: 'Comprehensive evaluation'
```

The chain executes until:

- One assertion passes (chain stops, others skipped)
- All assertions fail (last failure is the final result)
- An assertion without `fallback: next` is reached

## Key Behaviors

### Score Calculation

- **Bypassed assertions do NOT affect the score** — assertions skipped because an earlier link passed are excluded from scoring and named metrics.
- Only the final executed assertion (the first to pass, or the last to fail) contributes weight and score.
- Weights are taken from the assertion that actually runs.

### Telemetry

- Failed primaries that triggered the fallback **remain visible** in `componentResults` and named metrics. They are not silently dropped, so the eval UI/JSON shows exactly what was tried.
- Token counts from every assertion that actually executed (including failed primaries) are summed into the test's aggregate `tokensUsed`, so cost telemetry stays accurate.
- Assertion errors, redteam guardrail failures, and model-grader failures are not eligible for fallback: they still surface as errors or failed checks rather than allowing a cheaper fallback to hide a broken validation path.

### Independent vs. Fallback Assertions

You can mix both types in the same test:

```yaml
assert:
  - type: contains # Independent (always runs)
    value: 'required-term'

  - type: javascript # Primary (fallback chain)
    value: '...'
    fallback: next

  - type: llm-rubric # Fallback
    value: '...'

  - type: is-json # Independent (always runs)
```

- **Independent assertions**: Run normally and always contribute to the score
- **Fallback chains**: Run sequentially within the chain and contribute only the final executed assertion

### Validation Rules

The following configurations will throw errors:

```yaml
# Error: fallback at end of list
assert:
  - type: contains
    value: 'test'
    fallback: next      # No next assertion!

# Error: fallback to assert-set
assert:
  - type: contains
    value: 'test'
    fallback: next
  - type: assert-set   # Cannot be fallback target
    assert: [...]

# Error: fallback to select-best
assert:
  - type: contains
    value: 'test'
    fallback: next
  - type: select-best  # Cannot be fallback target
    value: "..."

# Error: redteam guardrail fallback source
assert:
  - type: guardrails
    config:
      purpose: redteam
    fallback: next      # Redteam guardrails fail closed
  - type: contains
    value: 'safe'
```

## Running the Example

```bash
# Create this example
npx promptfoo@latest init --example fallback-assertions
cd fallback-assertions

# Set your API key
export OPENAI_API_KEY=your-key-here

# Run the eval
promptfoo eval

# View results
promptfoo view
```

## Performance Benefits

For a typical evaluation with 100 test cases:

- **Without fallback**: 100 exact matches + 100 LLM calls = ~20,000 tokens
- **With fallback** (80% exact match rate): 100 exact matches + 20 LLM calls = ~4,000 tokens

**Savings**: 80% reduction in tokens and ~75% faster execution.

## Best Practices

1. **Order by cost**: Put cheapest checks first
2. **Order by specificity**: Put most specific checks first
3. **Use weights wisely**: Fallback assertion weight is used, not primary weight
4. **Test both paths**: Include fixtures where the primary assertion passes and where the fallback runs
5. **Keep final fallbacks broad**: Use model-graded judges as the last step when deterministic checks are too strict

## Related Features

- **Assert sets**: Group assertions with shared config
- **Multiple providers**: Different LLM judges for different price points
