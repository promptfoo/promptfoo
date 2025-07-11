# Configuration Reference

This comprehensive guide covers all configuration options for Promptfoo's prompt management system. Learn how to configure storage modes, prompt features, auto-tracking, and more.

## Environment Variables

Configure prompt management behavior using environment variables:

### Core Settings

```bash
# Storage mode selection
PROMPTFOO_PROMPT_LOCAL_MODE=true  # Force local mode even if cloud is available

# Auto-tracking
PROMPTFOO_AUTO_TRACK_PROMPTS=true  # Enable automatic prompt tracking

# Local storage path (default: ./prompts)
PROMPTFOO_PROMPTS_DIR=/path/to/prompts

# Cloud API endpoint (for self-hosted deployments)
PROMPTFOO_CLOUD_API_URL=https://api.your-domain.com
```

### Advanced Settings

```bash
# Performance tuning
PROMPTFOO_PROMPT_CACHE_TTL=3600  # Cache TTL in seconds

# Security
PROMPTFOO_PROMPT_ENCRYPTION=true  # Enable at-rest encryption

# Debugging
PROMPTFOO_PROMPT_DEBUG=true  # Enable debug logging
```

## Configuration File

Create a `.promptfoorc` file in your project root:

```yaml
# .promptfoorc
promptManagement:
  mode: local  # or 'cloud'
  localPath: ./prompts
  
  # Auto-tracking configuration
  autoTracking:
    enabled: true
    excludePatterns:
      - "*.test.*"
      - "temp/*"
      - "examples/*"
    includeMetadata: true
    
  # Default prompt settings
  defaults:
    author: "${USER}"
    tags:
      - team-alpha
      - v2-migration
      
  # Cloud mode settings (if applicable)
  cloud:
    syncInterval: 300  # seconds
    offlineMode: true  # Continue working offline
```

![Configuration Hierarchy](../assets/prompt-config-file-hierarchy.png)

## Prompt Configuration

Each prompt can include configuration that overrides provider defaults:

### Basic Configuration

```yaml
# In managed prompt
config:
  temperature: 0.7
  max_tokens: 1000
  top_p: 0.95
  frequency_penalty: 0.0
  presence_penalty: 0.0
  stop: ["\n\n", "END"]
```

### Response Formats

Configure structured output formats:

```yaml
config:
  response_format:
    type: "json_schema"
    json_schema:
      name: "customer_analysis"
      strict: true
      schema:
        type: "object"
        properties:
          sentiment:
            type: "string"
            enum: ["positive", "neutral", "negative"]
          intent:
            type: "string"
          entities:
            type: "array"
            items:
              type: "object"
              properties:
                name: { type: "string" }
                type: { type: "string" }
        required: ["sentiment", "intent"]
        additionalProperties: false
```

![Response Format Configuration](../assets/prompt-response-format-config.png)

### Provider-Specific Configuration

Different providers support different configuration options:

#### OpenAI
```yaml
config:
  # OpenAI specific
  model: "gpt-4-turbo-preview"
  temperature: 0.7
  max_tokens: 2000
  response_format: { type: "json_object" }
  seed: 12345  # For reproducibility
  tools:
    - type: "function"
      function:
        name: "get_weather"
        description: "Get weather information"
        parameters:
          type: "object"
          properties:
            location: { type: "string" }
```

#### Anthropic
```yaml
config:
  # Anthropic specific
  model: "claude-3-opus-20240229"
  max_tokens: 4000
  temperature: 0.7
  system: "You are Claude, an AI assistant"
  metadata:
    user_id: "user-123"
```

#### Custom Providers
```yaml
config:
  # Custom provider configuration
  endpoint: "https://api.custom-llm.com/v1/chat"
  headers:
    X-API-Key: "${CUSTOM_API_KEY}"
  transform: |
    return {
      messages: [{
        role: "user",
        content: prompt
      }]
    }
```

## Function Prompts

Configure dynamic prompt generation with functions:

### JavaScript Functions

```javascript
// Basic function prompt
module.exports = ({ vars }) => {
  return `Hello ${vars.name}, how can I help you today?`;
};

// Function with configuration
module.exports = ({ vars, provider }) => {
  const isGPT4 = provider.id.includes('gpt-4');
  
  return {
    prompt: `Process this request: ${vars.request}`,
    config: {
      temperature: isGPT4 ? 0.7 : 0.5,
      max_tokens: isGPT4 ? 2000 : 1000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "response",
          schema: {
            type: "object",
            properties: {
              result: { type: "string" },
              confidence: { type: "number" }
            }
          }
        }
      }
    }
  };
};
```

### Python Functions

```python
# Basic function prompt
def prompt(context):
    vars = context["vars"]
    return f"Hello {vars['name']}, how can I help you today?"

# Function with configuration
def prompt_with_config(context):
    vars = context["vars"]
    provider = context.get("provider", {})
    
    is_gpt4 = "gpt-4" in provider.get("id", "")
    
    return {
        "prompt": f"Process this request: {vars['request']}",
        "config": {
            "temperature": 0.7 if is_gpt4 else 0.5,
            "max_tokens": 2000 if is_gpt4 else 1000,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "response",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "result": {"type": "string"},
                            "confidence": {"type": "number"}
                        }
                    }
                }
            }
        }
    }
```

![Function Prompt Flow](../assets/prompt-function-flow.png)

## Transform Configuration

Apply transformations to prompts before sending to providers:

### Inline Transforms

```yaml
config:
  transform: |
    // Add instruction formatting for Llama models
    return `<s>[INST] ${prompt} [/INST]`;
```

### File-based Transforms

```yaml
config:
  transform: file://transforms/llama-format.js
```

Where `transforms/llama-format.js`:
```javascript
module.exports = (prompt, context) => {
  // Add system message if not present
  const systemMessage = context.vars.systemMessage || "You are a helpful assistant";
  
  return `<s>[INST] <<SYS>>
${systemMessage}
<</SYS>>

${prompt} [/INST]`;
};
```

## Auto-Tracking Configuration

Configure automatic prompt discovery and tracking:

### Basic Configuration

```yaml
promptAutoTracking:
  enabled: true
  excludePatterns:
    - "pf://*"        # Already managed prompts
    - "*.test.*"      # Test files
    - "temp/*"        # Temporary files
    - "node_modules/*" # Dependencies
```

### Advanced Configuration

```yaml
promptAutoTracking:
  enabled: true
  
  # ID generation strategy
  idStrategy:
    type: "label-first"  # or "hash-only", "sequential"
    prefix: "auto-"
    
  # What to track
  includePatterns:
    - "prompts/**/*"
    - "src/prompts/*"
    
  excludePatterns:
    - "**/*.test.*"
    - "**/examples/*"
    
  # Metadata to capture
  captureMetadata:
    - source: "file"
    - variables: true
    - config: true
    - usage: true
    
  # Behavior
  behavior:
    createVersions: true  # Create new versions for changes
    updateExisting: false # Update existing prompts
    notifyOnTrack: true  # Show notifications
```

![Auto-Tracking Configuration](../assets/prompt-auto-tracking-config.png)

## CLI Configuration

Configure CLI behavior and defaults:

### Command Aliases

```bash
# ~/.promptfoo/config
[alias]
  pc = prompt create
  pl = prompt list
  pd = prompt deploy
  pe = prompt edit
```

### Default Options

```yaml
# .promptfoorc
cli:
  prompt:
    create:
      defaultAuthor: "${USER}"
      defaultTags: ["cli-created"]
      
    deploy:
      requireConfirmation: true
      defaultNotes: "Deployed via CLI"
      
    list:
      format: "table"  # or "json", "yaml"
      sortBy: "updated"
      limit: 20
```

## Web UI Configuration

Configure the web interface behavior:

```yaml
webui:
  prompts:
    # Display settings
    defaultView: "grid"  # or "list"
    itemsPerPage: 20
    
    # Editor settings
    editor:
      theme: "vs-dark"
      fontSize: 14
      wordWrap: true
      
    # Diff viewer
    diff:
      sideBySide: true
      ignoreWhitespace: false
      
    # Permissions (cloud mode)
    permissions:
      allowDelete: false
      requireApproval: true
```

![Web UI Configuration](../assets/prompt-webui-config.png)

## API Configuration

Configure API access and behavior:

### Rate Limiting

```yaml
api:
  rateLimit:
    enabled: true
    requests: 100
    window: 60  # seconds
    
  # CORS settings
  cors:
    enabled: true
    origins:
      - "https://app.example.com"
      - "http://localhost:3000"
```

### Authentication

```yaml
api:
  auth:
    type: "bearer"  # or "basic", "oauth2"
    tokenExpiry: 3600
    
  # API keys (for programmatic access)
  apiKeys:
    enabled: true
    rotation: 90  # days
```

## Integration Configuration

Configure integrations with external systems:

### Git Integration

```yaml
integrations:
  git:
    enabled: true
    autoCommit: true
    commitMessage: "Update prompt: {{promptId}} v{{version}}"
    branch: "prompts/{{promptId}}"
```

### CI/CD Integration

```yaml
integrations:
  ci:
    provider: "github"  # or "gitlab", "jenkins"
    triggers:
      - event: "prompt.deployed"
        action: "workflow_dispatch"
        workflow: "validate-prompts.yml"
```

### Monitoring Integration

```yaml
integrations:
  monitoring:
    provider: "datadog"  # or "prometheus", "cloudwatch"
    metrics:
      - "prompt.usage"
      - "prompt.latency"
      - "prompt.errors"
    tags:
      environment: "${ENV}"
      service: "prompt-management"
```

## Security Configuration

Configure security settings:

### Encryption

```yaml
security:
  encryption:
    atRest: true
    algorithm: "AES-256-GCM"
    keyRotation: 30  # days
    
  # Access logs
  audit:
    enabled: true
    retention: 90  # days
    includeReadOps: false
```

### Access Control

```yaml
security:
  rbac:
    enabled: true
    defaultRole: "viewer"
    roles:
      viewer:
        - "prompt:read"
      developer:
        - "prompt:read"
        - "prompt:write"
        - "prompt:test"
      admin:
        - "prompt:*"
```

## Performance Configuration

Optimize performance:

```yaml
performance:
  # Caching
  cache:
    enabled: true
    ttl: 3600
    maxSize: "100MB"
    
  # Connection pooling
  database:
    maxConnections: 20
    idleTimeout: 30
    
  # Batch operations
  batch:
    maxSize: 100
    timeout: 5000  # ms
```

## Example: Complete Configuration

Here's a complete configuration example:

```yaml
# .promptfoorc
promptManagement:
  mode: hybrid  # Use cloud with local fallback
  
  local:
    path: ./prompts
    backup: true
    
  cloud:
    syncInterval: 300
    offlineMode: true
    
  autoTracking:
    enabled: true
    excludePatterns: ["*.test.*", "temp/*"]
    
  defaults:
    config:
      temperature: 0.7
      max_tokens: 1000
    tags: ["${TEAM}", "${PROJECT}"]
    
  security:
    encryption: true
    audit: true
    
  integrations:
    git: true
    monitoring: "datadog"
    
  performance:
    cache: true
    batchSize: 50
```

## Next Steps

- [API Reference](api-reference) - Programmatic configuration
- [Best Practices](best-practices) - Configuration patterns
- [Troubleshooting](troubleshooting/) - Common configuration issues
- [Examples](examples/) - Real-world configurations 