# prompty-advanced

This example demonstrates advanced features of Microsoft Prompty files in promptfoo.

## Advanced Features

### 1. Azure OpenAI Configuration

The `azure_chatbot.prompty` example shows:
- Azure-specific configuration (endpoint, deployment, API version)
- Environment variable usage with `${env:VAR_NAME}` syntax
- Multi-turn conversation setup
- Conditional logic using Nunjucks (Jinja2-compatible) templating

### 2. Vision/Image Support

The `image_analysis.prompty` example demonstrates:
- Image references in prompts using markdown syntax: `![alt](url)`
- Structured output formatting
- Complex system instructions
- Multiple image handling

### 3. Template Features

Prompty files use Nunjucks templating (Jinja2-compatible), which includes:

#### Conditionals
```
{% if topic == "quantum computing" %}
Quantum computing explanation...
{% else %}
General explanation...
{% endif %}
```

#### Loops
```
{% for item in items %}
- {{item.name}}: {{item.description}}
{% endfor %}
```

#### Variables and Filters
```
Hello {{name | upper}}!
The date is {{date | date("YYYY-MM-DD")}}.
```

## Files in this example

- `azure_chatbot.prompty` - Azure OpenAI configuration with Nunjucks templating
- `image_analysis.prompty` - Vision model example with image support
- `promptfooconfig.yaml` - Configuration for testing all examples

## Environment Variables

Prompty files support environment variable substitution in configuration:

```yaml
model:
  configuration:
    type: azure_openai
    api_key: ${env:AZURE_OPENAI_API_KEY}
    azure_endpoint: ${env:AZURE_OPENAI_ENDPOINT}
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

### Nunjucks Templating

Prompty files use Nunjucks, which is largely compatible with Jinja2. Common features include:

- Variable interpolation: `{{variable}}`
- Conditionals: `{% if condition %}...{% endif %}`
- Loops: `{% for item in items %}...{% endfor %}`
- Filters: `{{value | filter}}`
- Macros and includes (for advanced use cases)

### Sample Data

The `sample` section provides default values that can be overridden by test variables:

```yaml
sample:
  userName: Alice
  topic: quantum computing
  difficulty: beginner
```

## Learn more

- [Promptfoo Prompty documentation](https://promptfoo.dev/docs/configuration/prompts#prompty-files-microsoft-format)
- [Microsoft Prompty specification](https://github.com/microsoft/prompty)
- [Nunjucks templating](https://mozilla.github.io/nunjucks/) 