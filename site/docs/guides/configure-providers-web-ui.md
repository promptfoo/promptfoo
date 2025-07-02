---
sidebar_label: Configuring Providers in Web UI
---

# Configuring Providers in the Web UI

The promptfoo web UI now provides comprehensive provider configuration options, allowing you to set all parameters that are available in YAML configuration files.

## Provider Configuration Dialog

When you click on a provider in the web UI's evaluation creator, you'll see a configuration dialog with two tabs:

### Form Editor

The form editor provides a user-friendly interface for configuring providers:

1. **Common Configuration Fields**
   - **API Key**: Authentication key for the provider
   - **API Base URL**: Custom base URL for API requests (useful for proxies or local deployments)
   - **API Host**: Hostname for the API
   - **Temperature**: Controls randomness in responses (0-2)
   - **Max Tokens**: Maximum number of tokens in the response
   - **Timeout**: Request timeout in milliseconds
   - **Headers**: Custom HTTP headers as a JSON object

2. **Custom Configuration Fields**
   - Click "Add Field" to add any additional configuration parameter
   - Enter the field name and value
   - Supports strings, numbers, booleans, and JSON objects
   - Remove fields using the delete button

### YAML Editor

The YAML editor tab allows you to edit the entire provider configuration in YAML format:

- Full syntax highlighting
- Direct editing of all configuration parameters
- Useful for complex configurations or copying from existing YAML files
- Validation ensures your YAML is properly formatted

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

## Tips

1. **Environment Variables**: You can still use environment variables for sensitive values like API keys. Set them in your environment and leave the fields empty in the UI.

2. **Provider-Specific Fields**: Some providers have specific required fields (e.g., Azure requires `deployment_id`). The UI will show validation errors for missing required fields.

3. **Copying Configurations**: Use the YAML editor to quickly copy configurations between providers or from existing YAML files.

4. **Custom Providers**: For custom providers using webhooks or local files, you can add any configuration fields your provider expects.

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