# multiple-translations (Multiple Translations)

This example demonstrates two different approaches to testing translation quality across multiple languages using separate configuration files:

## Configuration Files

### 1. Array-based Testing (`promptfooconfig.yaml`)
The default configuration uses variable arrays to test different input/language combinations with LLM-based grading. This approach is simpler and good for exploratory testing.

```bash
promptfoo eval
```

### 2. Scenario-based Testing (`promptfooconfig-scenarios.yaml`)
Uses predefined expected translations with high similarity thresholds for more precise evaluation. This approach is better when you have specific expected outputs.

```bash
promptfoo eval -c promptfooconfig-scenarios.yaml
```

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example multiple-translations
```

## Environment Variables

This example requires at least one of the following API keys:

- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key

## Running the Examples

After setting your environment variables:

**Array-based approach (default):**
```bash
promptfoo eval
promptfoo view
```

**Scenario-based approach:**
```bash
promptfoo eval -c promptfooconfig-scenarios.yaml
promptfoo view
```

## Key Differences

- **Array-based**: Tests many language/input combinations with flexible LLM grading
- **Scenario-based**: Tests specific translations against expected results with similarity matching

Both approaches help evaluate translation quality but serve different testing needs.

