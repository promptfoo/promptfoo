# Google Vertex AI with Credentials

This example demonstrates how to use Google Vertex AI and Google providers with custom service account credentials.

## Configuration Options

You can provide credentials in two ways:

### 1. File Path (with file:// prefix)

```yaml
providers:
  - vertex:gemini-1.5-pro:
      credentials: 'file://path/to/service-account.json'
```

### 2. Direct JSON String (not recommended)

```yaml
providers:
  - vertex:gemini-1.5-pro:
      credentials: '{"type":"service_account","project_id":"your-project",...}'
```

## Usage

1. Create a service account in Google Cloud Console
2. Download the service account key as JSON
3. Either inline the JSON or reference the file path
4. Run your evaluation

The credentials will be used for authentication instead of the default application credentials.

## Supported Providers

The following Google providers support the `credentials` configuration:

- `vertex:*` - Vertex AI chat models (Gemini, Claude, Llama)
- `google:image:*` - Google Image generation models (Imagen)
- `vertex:embedding:*` - Vertex AI embedding models
- Adaline Gateway providers that use Google/Vertex underneath

## Example with Image Generation

```yaml
providers:
  - google:image:imagen-3.0-generate-001:
      credentials: 'file://service-account.json'
      projectId: 'your-project-id'

prompts:
  - 'A beautiful sunset over the mountains'
```

## Notes

- When using `file://` paths, the file will be loaded and parsed automatically
- Direct JSON credentials should be avoided in production for security reasons
- The credentials must be valid Google Cloud service account credentials with appropriate permissions
