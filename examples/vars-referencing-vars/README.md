# Variables Referencing Variables Example

This example demonstrates how to use variable references in promptfoo, allowing you to create dynamic prompts where variables can reference and build upon other variables.

## Quick Start

```bash
npx promptfoo@latest init --example vars-referencing-vars
```

## Configuration

1. Review the example configuration:

   - `promptfooconfig.yaml`: Contains variable definitions and references
   - Test cases showing variable dependencies
   - Prompt templates using referenced variables

2. Understand variable reference patterns:
   ```yaml
   vars:
     name: 'John'
     greeting: 'Hello, {{name}}!'
     fullMessage: '{{greeting}} How are you today?'
   ```

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View detailed results:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates:

- Variable reference chains
- Dynamic prompt generation
- Template interpolation
- Nested variable resolution
- Complex variable dependencies

## Example Structure

The example includes:

- `promptfooconfig.yaml`: Main configuration with variable references
- Test cases demonstrating variable chaining
- Prompt templates using nested variables
- Examples of different reference patterns

## Implementation Details

The example demonstrates:

- How to reference variables within other variables
- Creating chains of variable dependencies
- Using template syntax for variable interpolation
- Handling nested variable references
- Best practices for variable organization

## Additional Resources

- [Variable Reference Guide](https://promptfoo.dev/docs/configuration/variables)
- [Template Syntax Documentation](https://promptfoo.dev/docs/configuration/prompt-templates)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
- [Advanced Variables Guide](https://promptfoo.dev/docs/guides/advanced-variables)
