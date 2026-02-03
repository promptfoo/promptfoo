---
sidebar_label: HTTP API
description: Configure HTTP/HTTPS endpoints for custom LLM integrations with dynamic request transforms, variable substitution, and multi-provider API compatibility
---

# HTTP/HTTPS API

Setting the provider ID to a URL sends an HTTP request to the endpoint. This provides a general-purpose way to use any HTTP endpoint for inference.

The provider configuration allows you to construct the HTTP request and extract the inference result from the response.

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/generate'
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        myPrompt: '{{prompt}}'
      transformResponse: 'json.output' # Extract the "output" field from the response
```

The placeholder variable `{{prompt}}` will be replaced with the final prompt for the test case. You can also reference test variables as you construct the request:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/generateTranslation'
      body:
        prompt: '{{prompt}}'
        model: '{{model}}'
        translate: '{{language}}'

tests:
  - vars:
      model: 'gpt-5-mini'
      language: 'French'
```

`body` can be a string or JSON object. If the body is a string, the `Content-Type` header defaults to `text/plain` unless specified otherwise. If the body is an object, then content type is automatically set to `application/json`.

### JSON Example

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/generateTranslation'
      body:
        model: '{{model}}'
        translate: '{{language}}'
```

### Form-data Example

```yaml
providers:
  - id: https
    config:
      headers:
        'Content-Type': 'application/x-www-form-urlencoded'
      body: 'model={{model}}&translate={{language}}'
```

## Sending a raw HTTP request

You can also send a raw HTTP request by specifying the `request` property in the provider configuration. This allows you to have full control over the request, including headers and body.

Here's an example of how to use the raw HTTP request feature:

```yaml
providers:
  - id: https
    config:
      useHttps: true
      request: |
        POST /v1/completions HTTP/1.1
        Host: api.example.com
        Content-Type: application/json
        Authorization: Bearer {{api_key}}

        {
          "model": "llama3.1-405b-base",
          "prompt": "{{prompt}}",
          "max_tokens": 100
        }
      transformResponse: 'json.content' # extract the "content" field from the response
```

In this example:

1. The `request` property contains a raw HTTP request, including the method, path, headers, and body.
2. The `useHttps` property is set to `true`, so the request will be sent over HTTPS.
3. You can use template variables like `{{api_key}}` and `{{prompt}}` within the raw request. These will be replaced with actual values when the request is sent.
4. The `transformResponse` property is used to extract the desired information from the JSON response.

You can also load the raw request from an external file using the `file://` prefix:

```yaml
providers:
  - id: https
    config:
      request: file://path/to/request.txt
      transformResponse: 'json.text'
```

This path is relative to the directory containing the Promptfoo config file.

Then create a file at `path/to/request.txt`:

```http
POST /api/generate HTTP/1.1
Host: example.com
Content-Type: application/json

{"prompt": "Tell me a joke"}
```

### Nested objects

Nested objects are supported and should be passed to the `dump` function.

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/generateTranslation'
      body:
        // highlight-start
        messages: '{{messages | dump}}'
        // highlight-end
        model: '{{model}}'
        translate: '{{language}}'

tests:
  - vars:
      // highlight-start
      messages:
        - role: 'user'
          content: 'foobar'
        - role: 'assistant'
          content: 'baz'
      // highlight-end
      model: 'gpt-5-mini'
      language: 'French'
```

Note that any valid JSON string within `body` will be converted to a JSON object.

## Query parameters

Query parameters can be specified in the provider config using the `queryParams` field. These will be appended to the URL as GET parameters.

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/search'
      // highlight-start
      method: 'GET'
      queryParams:
        q: '{{prompt}}'
        foo: 'bar'
      // highlight-end
```

## Dynamic URLs

Both the provider `id` and the `url` field support Nunjucks templates. Variables in your test `vars` will be rendered before sending the request.

```yaml
providers:
  - id: https://api.example.com/users/{{userId}}/profile
    config:
      method: 'GET'
```

## Using as a library

If you are using promptfoo as a [node library](/docs/usage/node-package/), you can provide the equivalent provider config:

```javascript
{
  // ...
  providers: [{
    id: 'https',
    config: {
      url: 'https://example.com/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        foo: '{{bar}}',
      },
      transformResponse: (json) => json.output,
    }
  }],
}
```

## Request Transform

Request transform modifies your prompt after it is rendered but before it is sent to a provider API. This allows you to:

- Format prompts into specific message structures
- Add metadata or context
- Handle nuanced message formats for multi-turn conversations

### Basic Usage

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/chat'
      transformRequest: '{"message": "{{prompt}}"}'
      body:
        user_message: '{{prompt}}'
```

### Transform Types

#### String Template

Use Nunjucks templates to transform the prompt:

```yaml
transformRequest: '{"text": "{{prompt}}"}'
```

#### JavaScript Function

Define a function that transforms the prompt:

```javascript
transformRequest: (prompt, vars, context) =>
  JSON.stringify({ text: prompt, timestamp: Date.now() });
```

#### File-based Transform

Load a transform from an external file:

```yaml
transformRequest: 'file://transforms/request.js'
```

Example transform file (transforms/request.js):

```javascript
module.exports = (prompt, vars, context) => {
  return {
    text: prompt,
    metadata: {
      timestamp: Date.now(),
      version: '1.0',
    },
  };
};
```

You can also specify a specific function to use:

```yaml
transformRequest: 'file://transforms/request.js:transformRequest'
```

## Response Transform

The `transformResponse` option allows you to extract and transform the API response. If no `transformResponse` is specified, the provider will attempt to parse the response as JSON. If JSON parsing fails, it will return the raw text response.

You can override this behavior by specifying a `transformResponse` in the provider config. The `transformResponse` can be one of the following:

1. A string containing a JavaScript expression
2. A function
3. A file path (prefixed with `file://`) to a JavaScript module

### Parsing a JSON response

By default, the entire response is returned as the output. If your API responds with a JSON object and you want to pick out a specific value, use the `transformResponse` property to set a JavaScript snippet that manipulates the provided `json` object.

For example, this `transformResponse` configuration:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/openai-compatible/chat/completions'
      # ...
      transformResponse: 'json.choices[0].message.content'
```

Extracts the message content from this response:

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677858242,
  "model": "gpt-5-mini",
  "usage": {
    "prompt_tokens": 13,
    "completion_tokens": 7,
    "total_tokens": 20
  },
  "choices": [
    {
      "message": {
        "role": "assistant",
        // highlight-start
        "content": "\n\nThis is a test!"
        // highlight-end
      },
      "logprobs": null,
      "finish_reason": "stop",
      "index": 0
    }
  ]
}
```

### Parsing a text response

If your API responds with a text response, you can use the `transformResponse` property to set a JavaScript snippet that manipulates the provided `text` object.

For example, this `transformResponse` configuration:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      # ...
      transformResponse: 'text.slice(11)'
```

Extracts the message content "hello world" from this response:

```text
Assistant: hello world
```

### Response Parser Types

#### String parser

You can use a string containing a JavaScript expression to extract data from the response:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      transformResponse: 'json.choices[0].message.content'
```

This expression will be evaluated with three variables available:

- `json`: The parsed JSON response (if the response is valid JSON)
- `text`: The raw text response
- `context`: `context.response` is of type `FetchWithCacheResult` which includes:
  - `data`: The response data (parsed as JSON if possible)
  - `cached`: Boolean indicating if response was from cache
  - `status`: HTTP status code
  - `statusText`: HTTP status text
  - `headers`: Response headers (if present)

#### Function parser

When using promptfoo as a Node.js library, you can provide a function as the response. You may return a string or an object of type `ProviderResponse`.

parser:

```javascript
{
  providers: [{
    id: 'https',
    config: {
      url: 'https://example.com/generate_response',
      transformResponse: (json, text) => {
        // Custom parsing logic that returns string
        return json.choices[0].message.content;
      },
    }
  },
  {
    id: 'https',
    config: {
      url: 'https://example.com/generate_with_tokens',
      transformResponse: (json, text) => {
        // Custom parsing logic that returns object
        return {
          output: json.output,
          tokenUsage: {
            prompt: json.usage.input_tokens,
            completion: json.usage.output_tokens,
            total: json.usage.input_tokens + json.usage.output_tokens,
          }
        }
      },
    }
  }],
}
```

<details>
<summary>Type definition</summary>

```typescript
interface ProviderResponse {
  cached?: boolean;
  cost?: number;
  error?: string;
  logProbs?: number[];
  metadata?: {
    redteamFinalPrompt?: string;
    [key: string]: any;
  };
  raw?: string | any;
  output?: string | any;
  tokenUsage?: TokenUsage;
  isRefusal?: boolean;
  sessionId?: string;
  guardrails?: GuardrailResponse;
  audio?: {
    id?: string;
    expiresAt?: number;
    data?: string; // base64 encoded audio data
    transcript?: string;
    format?: string;
  };
}

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const TokenUsageSchema = BaseTokenUsageSchema.extend({
  assertions: BaseTokenUsageSchema.optional(),
});

export const BaseTokenUsageSchema = z.object({
  // Core token counts
  prompt: z.number().optional(),
  completion: z.number().optional(),
  cached: z.number().optional(),
  total: z.number().optional(),

  // Request metadata
  numRequests: z.number().optional(),

  // Detailed completion information
  completionDetails: CompletionTokenDetailsSchema.optional(),
});
```

</details>

#### File-based parser

You can use a JavaScript file as a response parser by specifying the file path with the `file://` prefix. The file path is resolved relative to the directory containing the promptfoo configuration file.

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      transformResponse: 'file://path/to/parser.js'
```

The parser file should export a function that takes three arguments (`json`, `text`, `context`) and return the parsed output. Note that text and context are optional.

```javascript
module.exports = (json, text) => {
  return json.choices[0].message.content;
};
```

You can use the `context` parameter to access response metadata and implement custom logic. For example, implementing guardrails checking:

```javascript
module.exports = (json, text, context) => {
  return {
    output: json.choices[0].message.content,
    guardrails: { flagged: context.response.headers['x-content-filtered'] === 'true' },
  };
};
```

This allows you to access additional response metadata and implement custom logic based on response status codes, headers, or other properties.

You can also use a default export:

```javascript
export default (json, text) => {
  return json.choices[0].message.content;
};
```

You can also specify a function name to be imported from a file:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      transformResponse: 'file://path/to/parser.js:parseResponse'
```

This will import the function `parseResponse` from the file `path/to/parser.js`.

### Guardrails Support

If your HTTP target has guardrails set up, you need to return an object with both `output` and `guardrails` fields from your transform. The `guardrails` field should be a top-level field in your returned object and must conform to the [GuardrailResponse](/docs/configuration/reference#guardrails) interface. For example:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      transformResponse: |
        {
          output: json.choices[0].message.content,
          guardrails: { flagged: context.response.headers['x-content-filtered'] === 'true' }
        }
```

### Interaction with Test Transforms

The `transformResponse` output becomes the input for test-level transforms. Understanding this pipeline is important for complex evaluations:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      # Step 1: Provider transform normalizes API response
      transformResponse: 'json.data' # Extract data field

tests:
  - vars:
      query: 'What is the weather?'
    options:
      # Step 2a: Test transform for assertions (receives provider transform output)
      transform: 'output.answer'
    assert:
      - type: contains
        value: 'sunny'

      # Step 2b: Context transform for RAG assertions (also receives provider transform output)
      - type: context-faithfulness
        contextTransform: 'output.sources.join(" ")'
```

## Tool Calling

The HTTP provider supports tool calling through the `tools`, `tool_choice`, and `transformToolsFormat` config options. This allows you to send tool definitions to APIs that support function/tool calling.

### Basic Configuration

```yaml
providers:
  - id: https://api.example.com/v1/chat/completions
    config:
      method: POST
      headers:
        Content-Type: application/json
        Authorization: 'Bearer {{env.API_KEY}}'
      transformToolsFormat: openai
      tools:
        - type: function
          function:
            name: get_weather
            description: Get weather for a location
            parameters:
              type: object
              properties:
                location:
                  type: string
              required:
                - location
      tool_choice:
        mode: auto
      body:
        model: gpt-4o-mini
        messages:
          - role: user
            content: '{{prompt}}'
        tools: '{{tools | dump}}'
        tool_choice: '{{tool_choice | dump}}'
      transformResponse: 'json.choices[0].message.tool_calls'
```

### transformToolsFormat

The `transformToolsFormat` option converts **both** `tools` and `tool_choice` from [OpenAI format](/docs/configuration/tools) to provider-specific formats. Define your tools once in OpenAI format, and they'll be automatically transformed to the target provider's native format.

| Provider         | Format      |
| ---------------- | ----------- |
| Anthropic        | `anthropic` |
| AWS Bedrock      | `bedrock`   |
| Azure OpenAI     | `openai`    |
| Cerebras         | `openai`    |
| DeepSeek         | `openai`    |
| Fireworks AI     | `openai`    |
| Google AI Studio | `google`    |
| Google Vertex AI | `google`    |
| Groq             | `openai`    |
| Ollama           | `openai`    |
| OpenAI           | `openai`    |
| OpenRouter       | `openai`    |
| Perplexity       | `openai`    |
| Together AI      | `openai`    |
| xAI (Grok)       | `openai`    |

If your provider isn't listed, try `openai` first as it's the most common format. When omitted, tools and tool_choice pass through unchanged.

**Why tool_choice needs transformation:** Each provider represents tool choice differently:

| OpenAI (Promptfoo default) | Anthropic          | Bedrock        | Google                                        |
| -------------------------- | ------------------ | -------------- | --------------------------------------------- |
| `"auto"`                   | `{ type: "auto" }` | `{ auto: {} }` | `{ functionCallingConfig: { mode: "AUTO" } }` |
| `"required"`               | `{ type: "any" }`  | `{ any: {} }`  | `{ functionCallingConfig: { mode: "ANY" } }`  |
| `"none"`                   | —                  | —              | `{ functionCallingConfig: { mode: "NONE" } }` |

### Template Variables

Use these variables in your request body:

- `{{tools}}` - The transformed tools array (use `{{tools | dump}}` for JSON)
- `{{tool_choice}}` - The transformed tool choice (use `{{tool_choice | dump}}` for JSON)

For complete documentation on tool formats and configuration, see [Tool Calling Configuration](/docs/configuration/tools).

## Token Estimation

By default, the HTTP provider does not provide token usage statistics since it's designed for general HTTP APIs that may not return token information. However, you can enable optional token estimation to get approximate token counts for cost tracking and analysis. Token estimation is automatically enabled when running redteam scans so you can track approximate costs without additional configuration.

Token estimation uses a simple word-based counting method with configurable multipliers. This provides a rough approximation that's useful for basic cost estimation and usage tracking.

:::note Accuracy
Word-based estimation provides approximate token counts. For precise token counting, implement custom logic in your `transformResponse` function using a proper tokenizer library.
:::

### When to Use Token Estimation

Token estimation is useful when:

- Your API doesn't return token usage information
- You need basic cost estimates for budget tracking
- You want to monitor usage patterns across different prompts
- You're migrating from an API that provides token counts

Don't use token estimation when:

- Your API already provides accurate token counts (use `transformResponse` instead)
- You need precise token counts for billing
- You're working with non-English text where word counting is less accurate

### Basic Token Estimation

Enable basic token estimation with default settings:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      body:
        prompt: '{{prompt}}'
      tokenEstimation:
        enabled: true
```

This will use word-based estimation with a multiplier of 1.3 for both prompt and completion tokens.

### Custom Multipliers

Configure a custom multiplier for more accurate estimation based on your specific use case:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      body:
        prompt: '{{prompt}}'
      tokenEstimation:
        enabled: true
        multiplier: 1.5 # Adjust based on your content complexity
```

**Multiplier Guidelines:**

- Start with default `1.3` and adjust based on actual usage
- Technical/code content may need higher multipliers (1.5-2.0)
- Simple conversational text may work with lower multipliers (1.1-1.3)
- Monitor actual vs. estimated usage to calibrate

### Integration with Transform Response

Token estimation works alongside response transforms. If your `transformResponse` returns token usage information, the estimation will be skipped:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      tokenEstimation:
        enabled: true # Will be ignored if transformResponse provides tokenUsage
      transformResponse: |
        {
          output: json.choices[0].message.content,
          tokenUsage: {
            prompt: json.usage.prompt_tokens,
            completion: json.usage.completion_tokens,
            total: json.usage.total_tokens
          }
        }
```

### Custom Token Counting

For accurate token counting, implement it in your `transformResponse` function:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      transformResponse: |
        (json, text, context) => {
          // Use a proper tokenizer library for accuracy
          const promptTokens = customTokenizer.encode(context.vars.prompt).length;
          const completionTokens = customTokenizer.encode(json.response).length;
          
          return {
            output: json.response,
            tokenUsage: {
              prompt: promptTokens,
              completion: completionTokens,
              total: promptTokens + completionTokens,
              numRequests: 1
            }
          };
        }
```

You can also load custom logic from a file:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      transformResponse: 'file://token-counter.js'
```

Example `token-counter.js`:

```javascript
// Using a tokenizer library like 'tiktoken' or 'gpt-tokenizer'
const { encode } = require('gpt-tokenizer');

module.exports = (json, text, context) => {
  const promptText = context.vars.prompt || '';
  const responseText = json.response || text;

  return {
    output: responseText,
    tokenUsage: {
      prompt: encode(promptText).length,
      completion: encode(responseText).length,
      total: encode(promptText).length + encode(responseText).length,
      numRequests: 1,
    },
  };
};
```

### Configuration Options

| Option     | Type    | Default                      | Description                                              |
| ---------- | ------- | ---------------------------- | -------------------------------------------------------- |
| enabled    | boolean | false (true in redteam mode) | Enable or disable token estimation                       |
| multiplier | number  | 1.3                          | Multiplier applied to word count (adjust for complexity) |

### Example: Cost Tracking

Here's a complete example for cost tracking with token estimation:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1/generate'
      method: POST
      headers:
        Authorization: 'Bearer {{env.API_KEY}}'
        Content-Type: 'application/json'
      body:
        model: 'custom-model'
        prompt: '{{prompt}}'
        max_tokens: 100
      tokenEstimation:
        enabled: true
        multiplier: 1.4 # Adjusted based on testing
      transformResponse: |
        {
          output: json.generated_text,
          cost: (json.usage?.total_tokens || 0) * 0.0001 // $0.0001 per token
        }
```

## TLS/HTTPS Configuration

The HTTP provider supports custom TLS certificate configuration for secure HTTPS connections. This enables:

- Custom CA certificates for verifying server certificates
- Client certificates for mutual TLS authentication
- PFX/PKCS12 certificate bundles
- Fine-grained control over TLS security settings

### Basic TLS Configuration

Configure custom CA certificates to verify server certificates:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/secure'
      tls:
        caPath: '/path/to/ca-cert.pem' # Custom CA certificate
        rejectUnauthorized: true # Verify server certificate (default: true)
```

### Mutual TLS (mTLS)

For APIs requiring client certificate authentication:

```yaml
providers:
  - id: https
    config:
      url: 'https://secure-api.example.com/v1'
      tls:
        # Client certificate and private key
        certPath: '/path/to/client-cert.pem'
        keyPath: '/path/to/client-key.pem'

        # Optional: Custom CA for server verification
        caPath: '/path/to/ca-cert.pem'
```

### Using PFX/PKCS12 Certificates

For PFX or PKCS12 certificate bundles, you can either provide a file path or inline base64-encoded content:

```yaml
providers:
  - id: https
    config:
      url: 'https://secure-api.example.com/v1'
      tls:
        # Option 1: Using a file path
        pfxPath: '/path/to/certificate.pfx'
        passphrase: '{{env.PFX_PASSPHRASE}}' # Optional: passphrase for PFX
```

```yaml
providers:
  - id: https
    config:
      url: 'https://secure-api.example.com/v1'
      tls:
        # Option 2: Using inline base64-encoded content
        pfx: 'MIIJKQIBAzCCCO8GCSqGSIb3DQEHAaCCCOAEggjcMIII2DCCBYcGCSqGSIb3DQEHBqCCBXgwggV0AgEAMIIFbQYJKoZIhvcNAQcBMBwGCiqGSIb3DQEMAQYwDgQI...' # Base64-encoded PFX content
        passphrase: '{{env.PFX_PASSPHRASE}}' # Optional: passphrase for PFX
```

### Using JKS (Java KeyStore) Certificates

For Java applications using JKS certificates, the provider can automatically extract the certificate and key for TLS:

```yaml
providers:
  - id: https
    config:
      url: 'https://secure-api.example.com/v1'
      tls:
        # Option 1: Using a file path
        jksPath: '/path/to/keystore.jks'
        passphrase: '{{env.JKS_PASSWORD}}' # Required for JKS
        keyAlias: 'mykey' # Optional: specific alias to use
```

```yaml
providers:
  - id: https
    config:
      url: 'https://secure-api.example.com/v1'
      tls:
        # Option 2: Using inline base64-encoded JKS content
        jksContent: 'MIIJKQIBAzCCCO8GCSqGSIb3DQEHA...' # Base64-encoded JKS content
        passphrase: '{{env.JKS_PASSWORD}}'
        keyAlias: 'client-cert' # Optional: defaults to first available key
```

The JKS file is processed using the `jks-js` library, which automatically:

- Extracts the certificate and private key from the keystore
- Converts them to PEM format for use with TLS
- Selects the appropriate key based on the alias (or uses the first available)

:::info
JKS support requires the `jks-js` package. Install it with:

```bash
npm install jks-js
```

:::

### Advanced TLS Options

Fine-tune TLS connection parameters:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1'
      tls:
        # Certificate configuration
        certPath: '/path/to/client-cert.pem'
        keyPath: '/path/to/client-key.pem'
        caPath: '/path/to/ca-cert.pem'

        # Security options
        rejectUnauthorized: true # Verify server certificate
        servername: 'api.example.com' # Override SNI hostname

        # Cipher and protocol configuration
        ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256'
        secureProtocol: 'TLSv1_3_method' # Force TLS 1.3
        minVersion: 'TLSv1.2' # Minimum TLS version
        maxVersion: 'TLSv1.3' # Maximum TLS version
```

### Inline Certificates

You can provide certificates directly in the configuration instead of file paths:

```yaml
providers:
  - id: https
    config:
      url: 'https://secure-api.example.com/v1'
      tls:
        # Provide PEM certificates as strings
        cert: |
          -----BEGIN CERTIFICATE-----
          MIIDXTCCAkWgAwIBAgIJAKl...
          -----END CERTIFICATE-----
        key: |
          -----BEGIN PRIVATE KEY-----
          MIIEvQIBADANBgkqhkiG9w0...
          -----END PRIVATE KEY-----
        ca: |
          -----BEGIN CERTIFICATE-----
          MIIDQTCCAimgAwIBAgITBmyf...
          -----END CERTIFICATE-----
```

For PFX certificates, provide them as base64-encoded strings:

```yaml
providers:
  - id: https
    config:
      url: 'https://secure-api.example.com/v1'
      tls:
        # PFX certificate as base64-encoded string
        pfx: 'MIIJKQIBAzCCCO8GCSqGSIb3DQEHAaCCCOAEggjcMIII2DCCBYcGCSqGSIb3DQEHBqCCBXgwggV0AgEAMIIFbQYJKoZIhvcNAQcBMBwGCiqGSIb3DQEMAQYwDgQI...'
        passphrase: 'your-pfx-passphrase'
```

### Multiple CA Certificates

Support for multiple CA certificates in the trust chain:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1'
      tls:
        ca:
          - |
            -----BEGIN CERTIFICATE-----
            [Root CA certificate content]
            -----END CERTIFICATE-----
          - |
            -----BEGIN CERTIFICATE-----
            [Intermediate CA certificate content]
            -----END CERTIFICATE-----
```

### Self-Signed Certificates

For development/testing with self-signed certificates:

```yaml
providers:
  - id: https
    config:
      url: 'https://localhost:8443/api'
      tls:
        rejectUnauthorized: false # Accept self-signed certificates (NOT for production!)
```

:::warning
Setting `rejectUnauthorized: false` disables certificate verification and should **never** be used in production environments as it makes connections vulnerable to man-in-the-middle attacks.
:::

### Environment Variables

Use environment variables for sensitive certificate data:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1'
      tls:
        certPath: '{{env.CLIENT_CERT_PATH}}'
        keyPath: '{{env.CLIENT_KEY_PATH}}'
        passphrase: '{{env.CERT_PASSPHRASE}}'
```

### TLS Configuration Options

| Option             | Type               | Default | Description                                                                        |
| ------------------ | ------------------ | ------- | ---------------------------------------------------------------------------------- |
| ca                 | string \| string[] | -       | CA certificate(s) for verifying server certificates                                |
| caPath             | string             | -       | Path to CA certificate file                                                        |
| cert               | string \| string[] | -       | Client certificate(s) for mutual TLS                                               |
| certPath           | string             | -       | Path to client certificate file                                                    |
| key                | string \| string[] | -       | Private key(s) for client certificate                                              |
| keyPath            | string             | -       | Path to private key file                                                           |
| pfx                | string \| Buffer   | -       | PFX/PKCS12 certificate bundle (base64-encoded string or Buffer for inline content) |
| pfxPath            | string             | -       | Path to PFX/PKCS12 file                                                            |
| jksPath            | string             | -       | Path to JKS keystore file                                                          |
| jksContent         | string             | -       | Base64-encoded JKS keystore content                                                |
| keyAlias           | string             | -       | Alias of the key to use from JKS (defaults to first available)                     |
| passphrase         | string             | -       | Passphrase for encrypted private key, PFX, or JKS                                  |
| rejectUnauthorized | boolean            | true    | If true, verify server certificate against CA                                      |
| servername         | string             | -       | Server name for SNI (Server Name Indication) TLS extension                         |
| ciphers            | string             | -       | Cipher suite specification (OpenSSL format)                                        |
| secureProtocol     | string             | -       | SSL method to use (e.g., 'TLSv1_2_method', 'TLSv1_3_method')                       |
| minVersion         | string             | -       | Minimum TLS version to allow (e.g., 'TLSv1.2', 'TLSv1.3')                          |
| maxVersion         | string             | -       | Maximum TLS version to allow (e.g., 'TLSv1.2', 'TLSv1.3')                          |

:::info

- When using client certificates, you must provide both certificate and key (unless using PFX or JKS)
- PFX and JKS bundles contain both certificate and key, so only the bundle and passphrase are needed
- The TLS configuration is applied to all HTTPS requests made by this provider
  :::

## Authentication

The HTTP provider supports multiple authentication methods. For specialized cases, use custom hooks or custom providers.

### Bearer Token

For APIs that accept a static bearer token:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1/chat'
      body:
        prompt: '{{prompt}}'
      auth:
        type: bearer
        token: '{{env.API_TOKEN}}'
```

The provider adds an `Authorization: Bearer <token>` header to each request.

### API Key

For APIs that use API key authentication, you can place the key in either a header or query parameter:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1/chat'
      body:
        prompt: '{{prompt}}'
      auth:
        type: api_key
        keyName: 'X-API-Key'
        value: '{{env.API_KEY}}'
        placement: header # or 'query'
```

When `placement` is `header`, the key is added as a request header. When `placement` is `query`, it's appended as a URL query parameter.

### Basic Authentication

For APIs that use HTTP Basic authentication:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1/chat'
      body:
        prompt: '{{prompt}}'
      auth:
        type: basic
        username: '{{env.API_USERNAME}}'
        password: '{{env.API_PASSWORD}}'
```

The provider Base64-encodes credentials and adds an `Authorization: Basic <credentials>` header.

### OAuth 2.0

OAuth 2.0 authentication supports **Client Credentials** and **Password** (Resource Owner Password Credentials) grant types.

When a request is made, the provider:

1. Checks if a valid access token exists in cache
2. If no token exists or is expired, requests a new one from `tokenUrl`
3. Caches the access token
4. Adds the token to API requests as an `Authorization: Bearer <token>` header

Tokens are refreshed proactively with a 60-second buffer before expiry.

#### Client Credentials Grant

Use this grant type for server-to-server authentication:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1/chat'
      body:
        prompt: '{{prompt}}'
      auth:
        type: oauth
        grantType: client_credentials
        tokenUrl: 'https://auth.example.com/oauth/token'
        clientId: '{{env.OAUTH_CLIENT_ID}}'
        clientSecret: '{{env.OAUTH_CLIENT_SECRET}}'
        scopes:
          - read
          - write
```

#### Password Grant

Use this grant type when authenticating with user credentials:

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1/chat'
      body:
        prompt: '{{prompt}}'
      auth:
        type: oauth
        grantType: password
        tokenUrl: 'https://auth.example.com/oauth/token'
        clientId: '{{env.OAUTH_CLIENT_ID}}'
        clientSecret: '{{env.OAUTH_CLIENT_SECRET}}'
        username: '{{env.OAUTH_USERNAME}}'
        password: '{{env.OAUTH_PASSWORD}}'
        scopes:
          - read
```

#### Token Endpoint Requirements

The token endpoint must return a JSON response with an `access_token` field. If `expires_in` (lifetime in seconds) is included, the provider uses it to schedule refresh. Otherwise, a 1-hour default is used.

### Digital Signature Authentication

For APIs requiring cryptographic request signing, the HTTP provider supports digital signatures with PEM, JKS (Java KeyStore), and PFX certificate formats. The private key is **never sent to Promptfoo** and remains stored locally.

#### Basic Usage (PEM)

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1'
      headers:
        'x-signature': '{{signature}}'
        'x-timestamp': '{{signatureTimestamp}}'
      signatureAuth:
        type: pem
        privateKeyPath: '/path/to/private.key'
```

When signature authentication is enabled, these template variables become available for use in headers or body:

- `{{signature}}`: The generated signature (base64-encoded)
- `{{signatureTimestamp}}`: Unix timestamp when the signature was generated

#### Certificate Formats

**PEM Certificates:**

```yaml
signatureAuth:
  type: pem
  privateKeyPath: '/path/to/private.key' # Path to PEM file
  # OR inline key:
  # privateKey: '-----BEGIN PRIVATE KEY-----\n...'
```

**JKS (Java KeyStore):**

```yaml
signatureAuth:
  type: jks
  keystorePath: '/path/to/keystore.jks'
  keystorePassword: '{{env.JKS_PASSWORD}}' # Or use PROMPTFOO_JKS_PASSWORD env var
  keyAlias: 'your-key-alias' # Optional: uses first available if not specified
```

**PFX (PKCS#12):**

```yaml
signatureAuth:
  type: pfx
  pfxPath: '/path/to/certificate.pfx'
  pfxPassword: '{{env.PFX_PASSWORD}}' # Or use PROMPTFOO_PFX_PASSWORD env var
  # OR use separate certificate and key files:
  # certPath: '/path/to/certificate.crt'
  # keyPath: '/path/to/private.key'
```

#### Full Configuration Example

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1'
      headers:
        'x-signature': '{{signature}}'
        'x-timestamp': '{{signatureTimestamp}}'
      signatureAuth:
        type: pem
        privateKeyPath: '/path/to/private.key'
        signatureValidityMs: 300000 # 5 minutes (default)
        signatureAlgorithm: 'SHA256' # Default
        signatureDataTemplate: '{{signatureTimestamp}}' # Default; customize as needed
        signatureRefreshBufferMs: 30000 # Optional custom refresh buffer
```

:::info Dependencies

- **JKS support** requires the `jks-js` package: `npm install jks-js`
- **PFX support** requires the `pem` package: `npm install pem`

:::

### Authentication Options Reference

#### Bearer Token Options

| Option | Type   | Required | Description        |
| ------ | ------ | -------- | ------------------ |
| type   | string | Yes      | Must be `'bearer'` |
| token  | string | Yes      | The bearer token   |

#### API Key Options

| Option    | Type   | Required | Description                                     |
| --------- | ------ | -------- | ----------------------------------------------- |
| type      | string | Yes      | Must be `'api_key'`                             |
| keyName   | string | Yes      | Name of the header or query parameter           |
| value     | string | Yes      | The API key value                               |
| placement | string | Yes      | Where to place the key: `'header'` or `'query'` |

#### Basic Auth Options

| Option   | Type   | Required | Description       |
| -------- | ------ | -------- | ----------------- |
| type     | string | Yes      | Must be `'basic'` |
| username | string | Yes      | Username          |
| password | string | Yes      | Password          |

#### OAuth 2.0 Options

| Option       | Type     | Required                                | Description                            |
| ------------ | -------- | --------------------------------------- | -------------------------------------- |
| type         | string   | Yes                                     | Must be `'oauth'`                      |
| grantType    | string   | Yes                                     | `'client_credentials'` or `'password'` |
| tokenUrl     | string   | Yes                                     | OAuth token endpoint URL               |
| clientId     | string   | Yes (client_credentials), No (password) | OAuth client ID                        |
| clientSecret | string   | Yes (client_credentials), No (password) | OAuth client secret                    |
| username     | string   | Yes (password grant)                    | Username for password grant            |
| password     | string   | Yes (password grant)                    | Password for password grant            |
| scopes       | string[] | No                                      | OAuth scopes to request                |

#### Digital Signature Options

| Option                   | Type   | Required | Default                    | Description                                            |
| ------------------------ | ------ | -------- | -------------------------- | ------------------------------------------------------ |
| type                     | string | No       | `'pem'`                    | Certificate type: `'pem'`, `'jks'`, or `'pfx'`         |
| privateKeyPath           | string | No\*     | -                          | Path to PEM private key file (PEM only)                |
| privateKey               | string | No\*     | -                          | Inline PEM private key string (PEM only)               |
| keystorePath             | string | No\*     | -                          | Path to JKS keystore file (JKS only)                   |
| keystoreContent          | string | No\*     | -                          | Base64-encoded JKS keystore content (JKS only)         |
| keystorePassword         | string | No       | -                          | JKS password (or use `PROMPTFOO_JKS_PASSWORD` env var) |
| keyAlias                 | string | No       | First available            | JKS key alias (JKS only)                               |
| pfxPath                  | string | No\*     | -                          | Path to PFX certificate file (PFX only)                |
| pfxPassword              | string | No       | -                          | PFX password (or use `PROMPTFOO_PFX_PASSWORD` env var) |
| certPath                 | string | No\*     | -                          | Path to certificate file (PFX alternative)             |
| keyPath                  | string | No\*     | -                          | Path to private key file (PFX alternative)             |
| certContent              | string | No\*     | -                          | Base64-encoded certificate content (PFX alternative)   |
| keyContent               | string | No\*     | -                          | Base64-encoded private key content (PFX alternative)   |
| signatureValidityMs      | number | No       | 300000                     | Signature validity period in milliseconds              |
| signatureAlgorithm       | string | No       | `'SHA256'`                 | Signature algorithm (any Node.js crypto supported)     |
| signatureDataTemplate    | string | No       | `'{{signatureTimestamp}}'` | Template for data to sign (`\n` = newline)             |
| signatureRefreshBufferMs | number | No       | 10% of validityMs          | Buffer time before expiry to refresh                   |

\* Requirements by certificate type:

- **PEM**: Either `privateKeyPath` or `privateKey` required
- **JKS**: Either `keystorePath` or `keystoreContent` required
- **PFX**: Either `pfxPath`, or both `certPath` and `keyPath`, or both `certContent` and `keyContent` required

## Session management

### Server-side session management

When using an HTTP provider with multi-turn redteam attacks like GOAT and Crescendo, you may need to maintain session IDs between rounds. The HTTP provider will automatically extract the session ID from the response headers and store it in the `vars` object.

A session parser is a javascript expression that should be used to extract the session ID from the response headers and returns it. All of the same formats of response parsers are supported.

The input to the session parser is an object `data` with this interface:

```typescript
{
  headers?: Record<string, string> | null;
  body?: Record<string, any> | null;
}
```

Simple header parser:

```yaml
sessionParser: 'data.headers["set-cookie"]'
```

Example extracting the session from the body:

Example Response

```json
{
  "responses": [{ "sessionId": "abd-abc", "message": "Bad LLM" }]
}
```

Session Parser value:

```yaml
sessionParser: 'data.body.responses[0]?.sessionId
```

The parser can take a string, file or function like the response parser.

Then you need to set the session ID in the `vars` object for the next round:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      headers:
        'Cookie': '{{sessionId}}'
```

You can use the `{{sessionId}}` var anywhere in a header or body. Example:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      body:
        'message': '{{prompt}}'
        'sessionId': '{{sessionId}}'
```

Accessing the headers or body:

```yaml
sessionParser: 'data.body.sessionId'
```

```yaml
sessionParser: 'data.headers.["x-session-Id"]'
```

### Client-side session management

If you want the Promptfoo client to send a unique session or conversation ID with each test case, you can add a `transformVars` option to your Promptfoo or redteam config. This is useful for multi-turn evals or multi-turn redteam attacks where the provider maintains a conversation state.

For example:

```yaml
defaultTest:
  options:
    transformVars: '{ ...vars, sessionId: context.uuid }'
```

Now you can use the `sessionId` variable in your HTTP target config:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      headers:
        'x-promptfoo-session': '{{sessionId}}'
      body:
        user_message: '{{prompt}}'
```

## Request Retries

The HTTP provider automatically retries failed requests in the following scenarios:

- Rate limiting (HTTP 429)
- Network failures

By default, it will attempt up to 4 retries with exponential backoff. You can configure the maximum number of retries using the `maxRetries` option:

```yaml
providers:
  - id: http
    config:
      url: https://api.example.com/v1/chat
      maxRetries: 2 # Override default of 4 retries
```

### Retrying Server Errors

By default, 5xx server errors are not retried. To enable retries for 5xx responses:

```bash
PROMPTFOO_RETRY_5XX=true promptfoo eval
```

## Streaming Responses

HTTP streaming allows servers to send responses incrementally as data becomes available, rather than waiting to send a complete response all at once. This is commonly used for LLM APIs to provide real-time token generation, where text appears progressively as the model generates it. Streaming can include both final output text and intermediate reasoning or thinking tokens, depending on the model's capabilities.

Streaming responses typically use one of these formats:

- **Server-Sent Events (SSE)**: Text-based protocol where each line starts with `data: ` followed by JSON. Common in OpenAI and similar APIs.
- **Chunked JSON**: Multiple JSON objects sent sequentially, often separated by newlines or delimiters.
- **HTTP chunked transfer encoding**: Standard HTTP mechanism for streaming arbitrary data.

Promptfoo offers full support for HTTP targets that stream responses in these formats. WebSocket requests are also supported via the [WebSocket Provider](./websocket.md). However, synchronous REST/HTTP requests are often preferable for the following reasons:

- Streaming formats vary widely and often require custom parsing logic in `transformResponse`.
- Evals wait for the full response before scoring, so progressive tokens may not be surfaced.
- Overall test duration is typically similar to non-streaming requests, so streaming does not provide a performance benefit.

If you need to evaluate a streaming endpoint, you will need to configure the `transformResponse` function to parse and reconstruct the final text. For SSE-style responses, you can accumulate chunks from each `data:` line. The logic for extracting each line and determining when the response is complete may vary based on the event types and semantics used by your specific application/provider.

**Example streaming response format:**

A typical Server-Sent Events (SSE) streaming response from OpenAI or similar APIs looks like this:

```
data: {"type":"response.created","response":{"id":"resp_abc123"}}

data: {"type":"response.output_text.delta","delta":"The"}

data: {"type":"response.output_text.delta","delta":" quick"}

data: {"type":"response.output_text.delta","delta":" brown"}

data: {"type":"response.output_text.delta","delta":" fox"}

data: {"type":"response.completed","response_id":"resp_abc123"}
```

Each line starts with `data: ` followed by a JSON object. The parser extracts text from `response.output_text.delta` events and concatenates the `delta` values to reconstruct the full response.

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1/responses'
      body:
        model: 'custom-model'
        stream: true
      transformResponse: |
        (json, text) => {
          if (json && (json.output_text || json.response)) {
            return json.output_text || json.response;
          }
          let out = '';
          for (const line of String(text || '').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(trimmed.slice(6));
              if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
                out += evt.delta;
              }
            } catch {}
          }
          return out.trim();
        }
```

This parser would extract `"The quick brown fox"` from the example response above.

## Reference

Supported config options:

| Option            | Type                    | Description                                                                                                                                                                         |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| url               | string                  | The URL to send the HTTP request to. Supports Nunjucks templates. If not provided, the `id` of the provider will be used as the URL.                                                |
| request           | string                  | A raw HTTP request to send. This will override the `url`, `method`, `headers`, `body`, and `queryParams` options.                                                                   |
| method            | string                  | HTTP method (GET, POST, etc). Defaults to POST if body is provided, GET otherwise.                                                                                                  |
| headers           | Record\<string, string> | Key-value pairs of HTTP headers to include in the request.                                                                                                                          |
| body              | object \| string        | The request body. For POST requests, objects are automatically stringified as JSON.                                                                                                 |
| queryParams       | Record\<string, string> | Key-value pairs of query parameters to append to the URL.                                                                                                                           |
| transformRequest  | string \| Function      | A function, string template, or file path to transform the prompt before sending it to the API.                                                                                     |
| transformResponse | string \| Function      | Transforms the API response using a JavaScript expression (e.g., 'json.result'), function, or file path (e.g., 'file://parser.js'). Replaces the deprecated `responseParser` field. |
| tokenEstimation   | object                  | Configuration for optional token usage estimation. See Token Estimation section above for details.                                                                                  |
| maxRetries        | number                  | Maximum number of retry attempts for failed requests. Defaults to 4.                                                                                                                |
| validateStatus    | string \| Function      | A function or string expression that returns true if the status code should be treated as successful. By default, accepts all status codes.                                         |
| auth              | object                  | Authentication configuration (bearer, api_key, basic, or oauth). See [Authentication](#authentication) section.                                                                     |
| signatureAuth     | object                  | Digital signature authentication configuration. See [Digital Signature Authentication](#digital-signature-authentication) section.                                                  |
| tls               | object                  | Configuration for TLS/HTTPS connections including client certificates, CA certificates, and cipher settings. See TLS Configuration Options above.                                   |

In addition to a full URL, the provider `id` field accepts `http` or `https` as values.

## Configuration Generator

Use the generator below to create an HTTP provider configuration based on your endpoint:

import { HttpConfigGenerator } from '@site/src/components/HttpConfigGenerator';

<HttpConfigGenerator />

## Error Handling

The HTTP provider throws errors for:

- Network errors or request failures
- Invalid response parsing
- Session parsing errors
- Invalid request configurations
- Status codes that fail the configured validation (if `validateStatus` is set)

By default, all response status codes are accepted. This accommodates APIs that return valid responses with non-2xx codes (common with guardrails and content filtering). You can customize this using the `validateStatus` option:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      # Function-based validation
      validateStatus: (status) => status < 500  # Accept any status below 500
      # Or string-based expression
      validateStatus: 'status >= 200 && status <= 299'  # Accept only 2xx responses
      # Or load from file
      validateStatus: 'file://validators/status.js'  # Load default export
      validateStatus: 'file://validators/status.js:validateStatus'  # Load specific function
```

Example validator file (`validators/status.js`):

```javascript
export default (status) => status < 500;
// Or named export
export function validateStatus(status) {
  return status < 500;
}
```

The provider automatically retries certain errors (like rate limits) based on `maxRetries`, while other errors are thrown immediately.
