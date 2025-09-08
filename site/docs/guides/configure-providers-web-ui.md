---
sidebar_label: Configuring Providers in Web UI
---

# Configuring Providers in the Web UI

The promptfoo web UI now provides comprehensive provider configuration options, allowing you to set all parameters that are available in YAML configuration files.

## Provider Configuration Dialog

When you click on a provider in the web UI's evaluation creator, you'll see a configuration dialog with two tabs:

### Form Editor

The form editor provides a user-friendly interface for configuring common provider settings:

1. **Common Configuration Fields**
   - **API Key**: Authentication key for the provider
   - **API Base URL**: Custom base URL for API requests (useful for proxies or local deployments)
   - **API Host**: Hostname for the API
   - **Temperature**: Controls randomness in responses (0-2)
   - **Max Tokens**: Maximum number of tokens in the response
   - **Timeout**: Request timeout in milliseconds
   - **Headers**: Custom HTTP headers as a JSON object

2. **Additional Configuration**
   - For any fields beyond the common ones, use the YAML tab
   - The form will alert you if your configuration contains additional fields
   - Click "Switch to YAML" to see and edit all configuration

3. **Auto-Save Feature**
   - Changes are automatically saved after 2 seconds of inactivity
   - Works seamlessly in the background
   - No need to manually save unless you want to close immediately

### YAML Editor

The YAML editor tab is where you can configure any provider setting:

- **Full control** - Add any configuration field your provider supports
- **Syntax highlighting** with dark mode support
- **Real-time syncing** - Common fields are synced with the form editor
- **Validation** - Shows errors for invalid YAML syntax
- **Auto-save** - Same seamless 2-second auto-save
- **Use it for**:
  - Adding custom fields beyond the common ones
  - Nested configuration objects
  - Array values
  - Complex provider-specific settings
  - Pasting existing configurations from YAML files

## Examples

### OpenAI with Custom Base URL

```yaml
apiKey: sk-your-api-key
apiBaseUrl: https://your-proxy.com/v1
temperature: 0.7
max_tokens: 2048
```

### Azure OpenAI Configuration

```yaml
deployment_id: your-deployment-name
api_host: your-resource.openai.azure.com
api_version: 2024-02-15-preview
apiKey: your-azure-key
temperature: 0.5
```

### Local AI with Custom Headers

```yaml
apiBaseUrl: http://localhost:8080/v1
headers:
  X-Custom-Header: value
  Authorization: Bearer custom-token
timeout: 30000
```

### Complex Provider Configuration (Requires YAML Editor)

```yaml
apiKey: sk-your-api-key
temperature: 0.7
# Nested configuration object
config:
  model_config:
    top_p: 0.9
    frequency_penalty: 0.5
    presence_penalty: 0.5
  generation_config:
    max_length: 2048
    min_length: 10
    do_sample: true
# Array configuration
stop_sequences:
  - "\n\n"
  - 'END'
  - 'STOP'
# Complex nested structure
response_format:
  type: json_object
  schema:
    properties:
      answer: { type: string }
      confidence: { type: number }
```

## Tips

1. **Quick Setup**: Use the Form tab for common fields, then switch to YAML for anything else

2. **Environment Variables**: You can still use environment variables for sensitive values like API keys. Set them in your environment and leave the fields empty in the UI.

3. **Provider-Specific Fields**: Some providers have specific required fields (e.g., Azure requires `deployment_id`). The UI will show validation errors for missing required fields.

4. **Adding Custom Fields**: Simply switch to the YAML tab and add any field your provider needs

5. **Copying Configurations**: The YAML editor is perfect for pasting existing configurations from your YAML files

## Migration from CLI

If you're migrating from CLI-based configuration, you can:

1. Copy the `config` section from your YAML file
2. Open the provider configuration dialog in the web UI
3. Switch to the YAML Editor tab
4. Paste your configuration
5. Click Save

The web UI will parse and apply all your existing configuration parameters.

## Red Team Configuration

The same provider configuration capabilities are available in the Red Team setup interface:

1. **Custom Targets**: When selecting a custom target, click "Configure Provider Settings" to open the comprehensive configuration dialog
2. **HTTP Endpoints**: The HTTP endpoint configuration includes its own specialized interface for configuring headers, request body, and transformations
3. **All Configuration Options**: The same common fields (apiKey, apiBaseUrl, etc.) and custom field capabilities are available

This ensures consistency across both evaluation creation and red team configuration workflows.
