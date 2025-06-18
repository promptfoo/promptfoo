---
sidebar_label: Prompt Optimizer
---

# Prompt Optimizer

The Prompt Optimizer Provider automatically refines variable values within a prompt template until all assertions pass or a maximum number of turns is reached. Unlike traditional prompt optimization, this provider keeps your prompt template unchanged and optimizes specific variable values to improve test results.

## How it works

The optimizer follows this process:

1. Takes your fixed prompt template (e.g., `'Translate the following to French: {{text}}'`)
2. Identifies a target variable to optimize (e.g., `text`)
3. Tests the current variable value against your assertions
4. If tests fail, uses an LLM to suggest better variable values
5. Repeats until assertions pass or max turns reached
6. Returns the best result with optimized variable values

## Configuration

```yaml
provider:
  id: promptfoo:prompt-optimizer
  config:
    maxTurns: 6 # Maximum optimization attempts
    targetVariable: text # Variable to optimize (defaults to 'text')
    improverModel: openai:gpt-4o # Model for generating improvements
    template: file://prompts/optimizer.txt # Custom optimization prompt
    stallIterations: 2 # Stop if no improvement for N iterations
```

## Example

```yaml
prompts:
  - 'Translate the following to French: {{text}}'

providers:
  - openai:gpt-4o

defaultTest:
  provider:
    id: promptfoo:prompt-optimizer
    config:
      maxTurns: 3
      targetVariable: text
      improverModel: openai:gpt-4o

tests:
  - vars:
      text: Hello world
    assert:
      - type: contains
        value: Bonjour
```

In this example, if "Hello world" doesn't produce a translation containing "Bonjour", the optimizer will suggest alternative English phrases that might translate better.

## Configuration Options

| Option            | Type   | Default                  | Description                                                  |
| ----------------- | ------ | ------------------------ | ------------------------------------------------------------ |
| `maxTurns`        | number | 6                        | Maximum number of optimization attempts                      |
| `targetVariable`  | string | 'text'                   | Name of the variable to optimize                             |
| `improverModel`   | string | (uses original provider) | LLM model for generating improvements                        |
| `template`        | string | (built-in template)      | Custom template for optimization prompts                     |
| `stallIterations` | number | 2                        | Stop optimization if no improvement for this many iterations |

## Metadata

The provider attaches these fields to each result:

- `optimizationHistory`: Array of all attempts with variables, outputs, and scores
- `finalVars`: The optimized variable values that produced the best result
- `finalPrompt`: The final rendered prompt with optimized variables
- `optimizedVariable`: Name of the variable that was optimized

## Custom Optimization Templates

You can provide a custom template for how the optimizer should suggest improvements:

```
You are a variable optimization assistant.

Prompt template: {{promptTemplate}}
Current {{targetVariable}} value: {{currentValue}}
Model output: {{previousOutput}}
Failure reason: {{reason}}

Suggest a better value for "{{targetVariable}}":
```

The template has access to:

- `promptTemplate`: The original prompt template
- `targetVariable`: Name of variable being optimized
- `currentValue`: Current value of the target variable
- `previousOutput`: What the model output with current value
- `reason`: Why the test failed
- `failures`: Array of specific assertion failures
