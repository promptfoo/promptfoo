# prompty-basic

This example demonstrates how to use Microsoft Prompty files with promptfoo for LLM evaluation.

## What are Prompty files?

Prompty files (`.prompty`) are a standardized format for defining LLM prompts with metadata, model configuration, and content in a single file. They were created by Microsoft and are supported by various tools in the AI ecosystem.

## Features demonstrated

- **Chat API prompts**: Role-based conversations (system, user, assistant)
- **Completion API prompts**: Simple text completion
- **Variable substitution**: Using template variables in prompts
- **Model configuration**: Setting temperature, max_tokens, and other parameters
- **Sample data**: Default values for variables that can be overridden in tests
- **Environment variables**: Secure API key management using `${env:VAR_NAME}` syntax

## Template Engine

Prompty files use **Nunjucks** templating (Jinja2-compatible) for variable substitution. This is the standard templating engine specified by Microsoft for the Prompty format.

## Files in this example

- `customer_service.prompty` - A chat-based customer service assistant
- `technical_support.prompty` - Technical support agent with specific product knowledge
- `completion_example.prompty` - Simple completion API example
- `env_example.prompty` - Demonstrates environment variable usage
- `promptfooconfig.yaml` - Configuration file that loads and tests the prompty files

## Running the example

1. Make sure you have promptfoo installed:
   ```bash
   npm install -g promptfoo
   ```

2. Run the evaluation:
   ```bash
   npx promptfoo eval
   ```

3. View the results:
   ```bash
   npx promptfoo view
   ```

## Key concepts

### Variable substitution

Variables in prompty files use double curly braces: `{{variable_name}}`. These are replaced with values from your test cases.

### Sample data

The `sample` section in the frontmatter provides default values for variables. These are used unless overridden by test case variables.

### Model configuration

The `model` section allows you to configure:
- API type (chat or completion)
- Provider configuration (OpenAI, Azure OpenAI, etc.)
- Parameters (temperature, max_tokens, etc.)

### Environment variables

Use `${env:VAR_NAME}` syntax to reference environment variables in configuration:

```yaml
model:
  configuration:
    api_key: ${env:OPENAI_API_KEY}
```

## Learn more

- [Promptfoo Prompty documentation](https://promptfoo.dev/docs/configuration/prompts#prompty-files-microsoft-format)
- [Microsoft Prompty specification](https://github.com/microsoft/prompty) 