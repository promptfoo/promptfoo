# Prompty Support in Promptfoo

## Overview

Promptfoo now supports Microsoft's Prompty file format (`.prompty` files), allowing users to define prompts with metadata, model configuration, and content in a single file.

## Supported Features

### ✅ Core Features
- **YAML Frontmatter**: Full support for metadata parsing
- **Chat API**: Role-based conversations (system, user, assistant, function)
- **Completion API**: Plain text prompts
- **Variable Substitution**: Multiple template engines supported
- **Sample Data**: Default values that can be overridden by test variables
- **Multi-turn Conversations**: Support for back-and-forth dialogue
- **Image Support**: Inline images using markdown syntax `![alt](url)`
- **Role Markers**: Support for both full role names and shorthand (e.g., "A:" for assistant)

### ✅ Template Engine Support
- **Jinja2/Nunjucks** (default): Compatible with Microsoft's specification
- **Handlebars/Mustache**: Optional support via `template: handlebars` in frontmatter
- **Template Selection**: Configurable per prompty file
- **Helper Functions**: Handlebars helpers (eq, ne, lt, gt, lte, gte) are registered

### ✅ Model Configurations
- **Azure OpenAI**: Maps azure_endpoint, azure_deployment, api_version, api_key
- **OpenAI**: Maps model name and organization
- **Azure Serverless (MaaS)**: Maps endpoint configuration
- **Model Parameters**: All parameters (temperature, max_tokens, etc.) are passed through

### ✅ Metadata Fields
- name, description, version, authors, tags
- All metadata is preserved but currently only `name` is used (as prompt label)

## Unsupported Features

### ❌ Not Yet Implemented
1. **`embedding` and `image` API types**: Only `chat` and `completion` are supported
2. **`response` field**: The `first`/`all` response mode is not implemented
3. **`inputs`/`outputs` metadata**: Parsed but not used
4. **External sample files**: Sample data must be inline, not referenced via file path
5. **`base` field**: Inheritance from other prompty files

### ⚠️ Differences from Microsoft's Implementation
1. **Default Template Engine**: We use Nunjucks (Jinja2-compatible) by default
2. **Environment Variables**: Use `${env:VAR_NAME}` syntax (this is passed through to providers)
3. **Extended Template Support**: We support Handlebars/Mustache in addition to Jinja2

## Examples Working

### Basic Examples (`examples/prompty-basic/`)
- ✅ Customer service chat prompt with variables
- ✅ Technical support with model parameters
- ✅ Completion API example
- ✅ All examples run successfully with echo provider

### Advanced Examples (`examples/prompty-advanced/`)
- ✅ Azure OpenAI configuration
- ✅ Multi-turn conversation
- ✅ Image analysis prompt
- ✅ Conditional logic with Nunjucks
- ✅ Handlebars template example

## Documentation

Comprehensive documentation has been added to:
- `site/docs/configuration/prompts.md` - Full section on Prompty files with template engine examples
- Examples with working configurations
- Clear explanation of supported features

## Testing

- 17 unit tests covering all major functionality including template engines
- 3 integration tests for file loading
- All tests passing
- Examples verified to work with local build

## Integration

The Prompty processor is fully integrated into promptfoo's prompt loading system:
- Automatically detected by `.prompty` extension
- Works with glob patterns
- Compatible with all existing promptfoo features (providers, assertions, etc.)

## How to Use Different Template Engines

### Default (Jinja2/Nunjucks)
```prompty
---
name: My Prompt
# template: jinja2 (optional, this is the default)
---
user:
Hello {{name}}!
{% if premium %}
You have premium access.
{% endif %}
```

### Handlebars
```prompty
---
name: My Prompt
template: handlebars
---
user:
Hello {{name}}!
{{#if premium}}
You have premium access.
{{/if}}
```

## Summary

Promptfoo's Prompty support now covers:
- ✅ Chat and completion prompts
- ✅ Azure OpenAI and OpenAI configurations  
- ✅ Variable substitution with multiple template engines
- ✅ Multi-turn conversations
- ✅ Image support
- ✅ Flexible template engine selection

The implementation is production-ready for typical LLM evaluation scenarios, with the added flexibility of supporting both Jinja2 (Microsoft's default) and Handlebars template syntaxes. 