# Word Count Assertion Example

This example demonstrates the `word-count` assertion type, which validates that LLM outputs contain a specific number of words or fall within a specified range.

## Usage

The `word-count` assertion supports three formats:

### 1. Exact Count

Checks if the output has exactly N words:

```yaml
assert:
  - type: word-count
    value: 50
```

### 2. Range (Min and Max)

Checks if the output has between min and max words (inclusive):

```yaml
assert:
  - type: word-count
    value:
      min: 20
      max: 30
```

### 3. Minimum Only

Checks if the output has at least N words:

```yaml
assert:
  - type: word-count
    value:
      min: 100
```

### 4. Maximum Only

Checks if the output has at most N words:

```yaml
assert:
  - type: word-count
    value:
      max: 20
```

## Running the Example

```bash
# Run the evaluation
promptfoo eval

# View results in the web UI
promptfoo view
```

## Use Cases

The word-count assertion is useful for:

- **Content Length Control**: Ensuring summaries, descriptions, or responses fit specific length requirements
- **API Constraints**: Validating outputs don't exceed character/word limits for downstream systems
- **UX Requirements**: Ensuring user-facing text is concise or detailed enough
- **Cost Optimization**: Controlling output token usage by limiting response length
- **Prompt Engineering**: Testing different prompts to achieve desired output lengths

## Example Scenarios

1. **Email Subject Lines**: Ensure they're 5-10 words
2. **Product Descriptions**: Keep them between 50-100 words
3. **Social Media Posts**: Limit to 280 characters worth of words
4. **Executive Summaries**: Require at least 200 words
5. **Tweet-sized Responses**: Maximum 40 words
