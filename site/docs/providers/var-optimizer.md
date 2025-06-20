---
sidebar_label: Variable Optimizer
---

# Variable Optimizer Provider

The Variable Optimizer Provider automatically improves variable values within your prompt templates until all test assertions pass. This provider keeps your prompt structure unchanged while intelligently optimizing specific variable content to achieve better test results.

## Quick Start

```yaml
provider:
  id: promptfoo:var-optimizer
  config:
    targetVariable: text
    maxTurns: 3
```

## How Variable Optimization Works

The Variable Optimizer follows an intelligent improvement process:

1. **Takes your fixed prompt template** (e.g., `'Translate {{text}} to French'`)
2. **Identifies the target variable** to optimize (e.g., `text`)
3. **Tests current variable values** against your assertions
4. **Analyzes assertion failures** to understand what's needed
5. **Generates improved variable values** using an LLM
6. **Learns from previous attempts** to avoid repeated failures
7. **Returns the best result** when assertions pass or max attempts reached

## Basic Example

```yaml
prompts:
  - 'Translate the following to French: {{text}}'

providers:
  - openai:gpt-4o

tests:
  - provider:
      id: promptfoo:var-optimizer
      config:
        targetVariable: text
        maxTurns: 3
        improverModel: openai:gpt-4o
    vars:
      text: Hello world
    assert:
      - type: contains
        value: Bonjour
```

**What happens:**

1. Tests "Hello world" → "Bonjour le monde" (doesn't contain "Bonjour")
2. Optimizer analyzes: "Need French output containing 'Bonjour'"
3. Suggests "Hello friend" → "Bonjour ami" ✅ (contains "Bonjour")

## Configuration Options

| Option            | Type   | Default                  | Description                                                  |
| ----------------- | ------ | ------------------------ | ------------------------------------------------------------ |
| `targetVariable`  | string | 'text'                   | Name of the variable to optimize                             |
| `maxTurns`        | number | 6                        | Maximum number of optimization attempts                      |
| `improverModel`   | string | (uses original provider) | LLM model for generating variable improvements               |
| `template`        | string | (built-in template)      | Custom template for optimization prompts                     |
| `stallIterations` | number | 2                        | Stop optimization if no improvement for this many iterations |

### Variable Selection

The `targetVariable` parameter specifies which variable to optimize:

```yaml
# Optimize the 'query' variable
provider:
  id: promptfoo:var-optimizer
  config:
    targetVariable: query
```

### Optimization Control

Control the optimization process with these settings:

```yaml
provider:
  id: promptfoo:var-optimizer
  config:
    maxTurns: 5 # Try up to 5 improvements
    stallIterations: 3 # Stop if 3 attempts don't improve
    improverModel: openai:gpt-4o # Use specific model for suggestions
```

## Advanced Configuration

### Using as Default Test Provider

Apply optimization to all tests with `defaultTest`:

```yaml
defaultTest:
  provider:
    id: promptfoo:var-optimizer
    config:
      targetVariable: text
      maxTurns: 3

tests:
  - vars:
      text: Hello world
    assert:
      - type: contains
        value: Bonjour
  - vars:
      text: Good morning
    assert:
      - type: contains
        value: matin
```

### Custom Optimization Templates

Provide your own template for how the optimizer should analyze and improve variables:

```yaml
provider:
  id: promptfoo:var-optimizer
  config:
    template: file://prompts/my-optimizer.txt
```

**Example custom template:**

```
You are a variable optimization specialist.

Current prompt template: {{promptTemplate}}
Variable to optimize: "{{targetVariable}}"
Current value: {{currentValue}}
Test output: {{previousOutput}}
Why it failed: {{reason}}

Generate a better value for "{{targetVariable}}" that will make the assertions pass:
```

**Available template variables:**

- `promptTemplate` - The original prompt template
- `targetVariable` - Name of variable being optimized
- `currentValue` - Current value of the target variable
- `previousOutput` - Model output with current value
- `reason` - Why the test failed
- `failures` - Array of specific assertion failures
- `optimizationHistory` - Previous optimization attempts

## Optimization Metadata

The provider attaches detailed metadata to help you understand the optimization process:

```javascript
{
  promptOptimizer: {
    originalValue: "Hello world",
    optimizedValue: "Hello friend",
    targetVariable: "text",
    iterations: 2,
    finalScore: 1.0,
    succeeded: true,
    history: [
      {
        iteration: 1,
        text: "Hello world",
        output: "Bonjour le monde",
        score: 0,
        success: false,
        reason: "Missing required word 'Bonjour'"
      },
      {
        iteration: 2,
        text: "Hello friend",
        output: "Bonjour ami",
        score: 1.0,
        success: true
      }
    ]
  }
}
```

## Multiple Assertion Types

The optimizer works with any assertion type:

```yaml
tests:
  - provider:
      id: promptfoo:var-optimizer
      config:
        targetVariable: content
    vars:
      content: Write a blog post
    assert:
      - type: contains
        value: introduction
      - type: javascript
        value: output.length > 100
      - type: llm-rubric
        value: Rate the creativity from 1-10
```

## Use Cases

### Content Generation Optimization

```yaml
prompts:
  - 'Write a {{content_type}} about {{topic}}'
tests:
  - provider:
      id: promptfoo:var-optimizer
      config:
        targetVariable: topic
    vars:
      content_type: blog post
      topic: artificial intelligence
    assert:
      - type: contains
        value: machine learning
      - type: word-count
        value: 200
```

### Translation Quality Testing

```yaml
prompts:
  - 'Translate "{{english}}" to Spanish'
tests:
  - provider:
      id: promptfoo:var-optimizer
      config:
        targetVariable: english
    vars:
      english: I love programming
    assert:
      - type: contains
        value: programación
```

### JSON Output Optimization

```yaml
prompts:
  - 'Convert this to JSON: {{data}}'
tests:
  - provider:
      id: promptfoo:var-optimizer
      config:
        targetVariable: data
    vars:
      data: Name John Age 25
    assert:
      - type: is-json
      - type: javascript
        value: JSON.parse(output).name === "John"
```

## Best Practices

1. **Start simple** - Use basic assertions before complex ones
2. **Set appropriate maxTurns** - 3-5 attempts usually sufficient
3. **Choose specific variables** - Target variables that directly impact test outcomes
4. **Use clear assertions** - Specific failure messages help optimization
5. **Monitor optimization history** - Review attempts to understand improvement patterns

## Troubleshooting

### Optimization Not Improving

- Check that `targetVariable` exists in your test variables
- Ensure assertions provide clear failure messages
- Try increasing `maxTurns` for complex optimizations
- Review optimization history in metadata

### Custom Template Issues

- Verify template syntax with test data
- Include all required template variables
- Test template rendering separately before using

## Examples

- [Basic Variable Optimization](https://github.com/promptfoo/promptfoo/tree/main/examples/optimizer-basic) - Simple translation optimization
- [Content Moderation Testing](https://github.com/promptfoo/promptfoo/tree/main/examples/optimizer-content-moderation) - Multi-assertion optimization testing
