---
sidebar_label: Configuring Providers in Web UI
---

# Configuring Providers in the Web UI

The promptfoo web UI provides a simple JSON editor for configuring providers with quick-start templates and documentation links.

## Provider Configuration Dialog

When you click "Configure Provider Settings" for a provider in the evaluation creator, you'll see a dialog with:

### JSON Editor

A full-featured JSON editor that supports all provider configuration options:

- **Syntax validation** - Real-time error detection
- **100% coverage** - Any field your provider supports
- **Copy/paste friendly** - Easy to migrate from YAML configs
- **Keyboard shortcuts**:
  - `Ctrl+S` / `Cmd+S` - Save configuration
  - `Escape` - Close dialog

### Quick Start Templates

For common providers (OpenAI, Anthropic, Azure), click the template button to insert default values:

- **OpenAI**: `temperature: 0.7`, `max_tokens: 2048`
- **Anthropic**: `temperature: 0.7`, `max_tokens: 4096`
- **Azure**: `deployment_id`, `api_version`

Templates merge with existing config, so you can add defaults without losing custom fields.

### Documentation Links

Direct links to provider-specific documentation for:

- OpenAI, Anthropic, Azure
- AWS Bedrock, Google Vertex AI
- Ollama, Replicate
- And more...

## Examples

### OpenAI with Custom Configuration

```json
{
  "temperature": 0.7,
  "max_tokens": 2048,
  "top_p": 0.9,
  "frequency_penalty": 0.5,
  "presence_penalty": 0.5
}
```

### Azure OpenAI Configuration

```json
{
  "deployment_id": "your-deployment-name",
  "api_version": "2024-02-01",
  "temperature": 0.5
}
```

### OpenAI with Tools (Complex Config)

```json
{
  "temperature": 0,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name"
            }
          },
          "required": ["location"]
        }
      }
    }
  ]
}
```

### Local AI with Custom Settings

```json
{
  "apiBaseUrl": "http://localhost:8080/v1",
  "headers": {
    "X-Custom-Header": "value",
    "Authorization": "Bearer custom-token"
  },
  "timeout": 30000
}
```

## Tips

1. **Environment Variables**: Set sensitive values like API keys in your environment rather than in the UI
2. **Copy from Docs**: Find examples in the provider documentation and paste them directly
3. **Complex Configs**: Nested objects, arrays, and JSON schemas work perfectly in the editor
4. **Validation**: The editor will show errors for invalid JSON before you can save

## Migration from CLI

If you're migrating from CLI-based configuration:

1. Copy the `config` section from your YAML file
2. Click "Configure Provider Settings" in the web UI
3. Paste your configuration
4. Click Save (or press Ctrl+S)

The web UI accepts all configuration parameters that work in YAML files.

## Red Team Configuration

The same provider configuration is available in the Red Team setup interface. Click "Configure Provider Settings" when selecting a custom target to access the full configuration editor.
