# Fallback Assertions Example

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
    value: "return { pass: output === 'Paris', score: 1.0 };"
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

- **Bypassed assertions do NOT affect the score**
- Only the final executed assertion contributes to the total
- Weights are taken from the assertion that actually runs

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

- **Independent assertions**: Run in parallel (concurrency=3)
- **Fallback chains**: Run sequentially within chain, but parallel with other chains

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
```

## Running the Example

```bash
# Run evaluation
npx promptfoo@latest eval

# View results
npx promptfoo@latest view
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
4. **Test both paths**: Ensure both primary and fallback work correctly
5. **Monitor bypassed assertions**: Check logs to see how often fallbacks trigger

## Related Features

- **Assert sets**: Group assertions with shared config
- **Multiple providers**: Different LLM judges for different price points
