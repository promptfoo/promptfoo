# Prompty File Examples

This directory demonstrates how to use Microsoft Prompty (`.prompty`) files with promptfoo.

## What are Prompty Files?

Prompty is a file format that combines:
- Metadata (name, description, authors)
- Model configuration (API type, parameters)
- Sample data for testing
- The actual prompt content with role-based sections

## Files in this Example

- `customer_service.prompty` - A chat-based customer service assistant
- `technical_support.prompty` - Technical support agent with lower temperature for accuracy
- `completion_example.prompty` - Shows completion API usage (non-chat format)
- `promptfooconfig.yaml` - Configuration showing how to use prompty files

## Running the Example

```bash
# Install promptfoo if you haven't already
npm install -g promptfoo

# Run the evaluation
promptfoo eval

# View results in the web UI
promptfoo view
```

## Key Features Demonstrated

1. **Chat vs Completion API**: See how `customer_service.prompty` uses chat format with roles, while `completion_example.prompty` uses plain text completion.

2. **Sample Data**: Each prompty file includes sample data that serves as default values for variables.

3. **Model Configuration**: Shows how to configure model parameters directly in the prompty file.

4. **Variable Substitution**: Uses Nunjucks templating (e.g., `{{customerName}}`) just like other promptfoo formats.

## Prompty Format Structure

```yaml
---
# Metadata section (YAML frontmatter)
name: Prompt Name
description: What this prompt does
model:
  api: chat  # or completion
  configuration:
    type: openai
    name: gpt-3.5-turbo
  parameters:
    temperature: 0.7
sample:
  var1: default value
---
# Content section (role-based for chat API)
system:
System message here

user:
User message with {{variables}}
```

## Learn More

- [Prompty Specification](https://github.com/microsoft/prompty)
- [Promptfoo Documentation](https://promptfoo.dev/docs/configuration/prompts) 