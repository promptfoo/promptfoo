# Prompty Support in Promptfoo

## Overview

Promptfoo supports Microsoft's Prompty file format (`.prompty` files), allowing users to define prompts with metadata, model configuration, and content in a single file.

## Supported Features

### ✅ Core Features

- **YAML Frontmatter**: Full support for metadata parsing
- **Chat API**: Role-based conversations (system, user, assistant, function)
- **Completion API**: Plain text prompts
- **Variable Substitution**: Nunjucks templating (Jinja2-compatible) for dynamic content
- **Sample Data**: Default values that can be overridden by test variables
- **Multi-turn Conversations**: Support for back-and-forth dialogue
- **Image Support**: Inline images using markdown syntax `![alt](url)`
- **Role Markers**: Support for both full role names and shorthand (e.g., "A:" for assistant)
- **Environment Variables**: Support for `${env:VAR_NAME}` syntax in configuration

### ✅ Template Engine

- **Nunjucks (Jinja2-compatible)**: Following Microsoft's specification
- Variable interpolation: `{{variable}}`
- Conditionals: `{% if condition %}...{% endif %}`
- Loops: `{% for item in items %}...{% endfor %}`
- Filters and other Nunjucks features

### ✅ Model Configurations

- **Azure OpenAI**: Full configuration support with environment variables
- **OpenAI**: Standard configuration with API key support
- **Azure Serverless/MaaS**: Basic configuration support

### ❌ Unsupported Features

- **Embedding API**: Not yet implemented
- **Image Generation API**: Not yet implemented
- **Response Mode**: `first`/`all` selection not implemented
- **Connection References**: Named connection lookup not supported
- **Base/Inheritance**: Template inheritance not implemented
- **Full Input/Output Specifications**: Type definitions and JSON schema validation not implemented

## Configuration Examples

### Basic Chat Prompt

```prompty
---
name: Customer Service
model:
  api: chat
  configuration:
    type: openai
    model: gpt-3.5-turbo
  parameters:
    temperature: 0.7
sample:
  customer: "John"
---
system:
You are a helpful assistant.

user:
Hello, I'm {{customer}}.
```

### Environment Variables

```prompty
---
model:
  configuration:
    type: azure_openai
    api_key: ${env:AZURE_OPENAI_API_KEY}
    azure_endpoint: ${env:AZURE_OPENAI_ENDPOINT}
    azure_deployment: gpt-4
---
```

### Multi-turn Conversation

```prompty
---
model:
  api: chat
---
system:
You are a tutor.

user:
What is recursion?

assistant:
Recursion is when a function calls itself.

user:
Can you show an example?
```

## Implementation Notes

1. **Template Engine**: We use Nunjucks which is largely compatible with Jinja2. Most common Jinja2 templates will work without modification.

2. **Environment Variables**: Resolved at runtime using Node.js `process.env`. Variables that don't exist will be replaced with empty strings and a warning logged.

3. **Sample Data**: Implemented as a prompt function that merges sample data with test variables (test variables take precedence).

4. **Role Parsing**: Supports standard roles (system, user, assistant, function) and the shorthand "A:" for assistant.

## Best Practices

1. **Use Environment Variables for Secrets**: Always use `${env:VAR_NAME}` for API keys and sensitive data.

2. **Provide Sample Data**: Include representative sample data to make prompts self-documenting and testable.

3. **Follow Microsoft's Format**: Stick to the official Prompty specification for maximum compatibility.

4. **Test with Echo Provider**: Use the echo provider to verify prompt processing without consuming API credits.

## Future Improvements

1. Add support for embedding and image generation APIs
2. Implement input/output type specifications with JSON schema validation
3. Add connection reference support for managed connections
4. Support response mode selection (first/all)
5. Add template inheritance capabilities
