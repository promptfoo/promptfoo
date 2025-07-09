# prompty-advanced

This example demonstrates advanced features of Microsoft Prompty files in promptfoo.

## Advanced Features

### 1. Template Engine Selection

Prompty files support multiple template engines:

- **Jinja2/Nunjucks** (default): Microsoft's standard, using `{% if %}` syntax
- **Handlebars**: Alternative syntax using `{{#if}}` blocks

### 2. Azure OpenAI Configuration

The `azure_chatbot.prompty` example shows:
- Azure-specific configuration (endpoint, deployment, API version)
- Environment variable usage with `${env:VAR_NAME}` syntax
- Multi-turn conversation setup

### 3. Vision/Image Support

The `image_analysis.prompty` example demonstrates:
- Image references in prompts using markdown syntax: `![alt](url)`
- Structured output formatting
- Complex system instructions

### 4. Conditional Logic

Both Nunjucks and Handlebars examples show:
- Conditional content based on variables
- Dynamic prompt generation
- Template-specific syntax differences

## Files in this example

- `azure_chatbot.prompty` - Azure OpenAI configuration with Nunjucks templating
- `azure_chatbot_handlebars.prompty` - Same prompt using Handlebars syntax
- `image_analysis.prompty` - Vision model example with image support
- `promptfooconfig.yaml` - Configuration for testing all examples

## Template Engine Comparison

### Nunjucks (Default)
```
{% if topic == "quantum computing" %}
Quantum computing explanation...
{% else %}
General explanation...
{% endif %}
```

### Handlebars
```
{{#if (eq topic "quantum computing")}}
Quantum computing explanation...
{{else}}
General explanation...
{{/if}}
```

## Running the examples

1. Set up environment variables (if using Azure OpenAI):
   ```bash
   export AZURE_OPENAI_ENDPOINT=your-endpoint
   export AZURE_OPENAI_API_KEY=your-key
   ```

2. Run with the echo provider (no API key needed):
   ```bash
   npx promptfoo eval
   ```

3. Or run with actual providers:
   ```bash
   npx promptfoo eval --providers openai:gpt-4
   ```

## Key Concepts

### Template Field

Add `template: handlebars` to the frontmatter to use Handlebars instead of the default Nunjucks:

```yaml
---
name: My Prompt
template: handlebars
---
```

### Handlebars Helpers

When using Handlebars, these comparison helpers are available:
- `eq` (equals)
- `ne` (not equals)
- `lt` (less than)
- `gt` (greater than)
- `lte` (less than or equal)
- `gte` (greater than or equal)

### Environment Variables

Use `${env:VAR_NAME}` syntax in configuration values to reference environment variables.

## Learn more

- [Promptfoo Prompty documentation](https://promptfoo.dev/docs/configuration/prompts#prompty-files-microsoft-format)
- [Nunjucks templating](https://mozilla.github.io/nunjucks/)
- [Handlebars templating](https://handlebarsjs.com/) 