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
      model: 'gpt-4.1-mini'
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
      model: 'gpt-4.1-mini'
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
transformRequest: (prompt) => JSON.stringify({ text: prompt, timestamp: Date.now() });
```

#### File-based Transform

Load a transform from an external file:

```yaml
transformRequest: 'file://transforms/request.js'
```

Example transform file (transforms/request.js):

```javascript
module.exports = (prompt) => {
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
  "model": "gpt-4.1-mini",
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

For sophisticated token counting, implement it in your `transformResponse` function:

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

## Digital Signature Authentication

The HTTP provider supports digital signature authentication with multiple certificate formats. This feature allows you to:

- Automatically generate cryptographic signatures for requests
- Manage signature expiration and refresh
- Customize header names and signature formats
- Configure different signature algorithms
- Support for PEM, JKS (Java KeyStore), and PFX (Personal Information Exchange) certificate formats

The current implementation uses asymmetric key cryptography (RSA by default), but the configuration is algorithm-agnostic. In either case, the private key is **never sent to Promptfoo** and will always be stored locally on your system either in your `promptfooconfig.yaml` file or on a local path that the configuration file references.

### Basic Usage (PEM)

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1'
      method: 'POST'
      headers:
        'x-signature': '{{signature}}'
        'x-timestamp': '{{signatureTimestamp}}'
      signatureAuth:
        type: 'pem'
        privateKeyPath: '/path/to/private.key'
        clientId: 'your-client-id'
```

### Certificate Format Support

The HTTP provider supports three certificate formats:

#### PEM Certificates

```yaml
signatureAuth:
  type: 'pem'
  privateKeyPath: '/path/to/private.key' # Path to PEM private key file
  # OR
  privateKey: '-----BEGIN PRIVATE KEY-----\n...' # Direct key string
```

#### JKS (Java KeyStore) Certificates

```yaml
signatureAuth:
  type: 'jks'
  keystorePath: '/path/to/keystore.jks'
  keystorePassword: 'your-keystore-password' # Optional: can use PROMPTFOO_JKS_PASSWORD env var
  keyAlias: 'your-key-alias' # Optional: uses first available alias if not specified
```

#### PFX (Personal Information Exchange) Certificates

```yaml
signatureAuth:
  type: 'pfx'
  pfxPath: '/path/to/certificate.pfx'
  pfxPassword: 'your-pfx-password' # Optional: can use PROMPTFOO_PFX_PASSWORD env var
  # OR use separate certificate and key files
  certPath: '/path/to/certificate.crt'
  keyPath: '/path/to/private.key'
```

### Full Configuration

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/v1'
      headers:
        'x-signature': '{{signature}}'
        'x-timestamp': '{{signatureTimestamp}}'
        'x-client-id': 'your-client-id'
      signatureAuth:
        # Certificate type (pem, jks, or pfx)
        type: 'pem'

        # PEM options
        privateKeyPath: '/path/to/private.key' # Path to key file
        # privateKey: '-----BEGIN PRIVATE KEY-----\n...'  # Or direct key string

        # JKS options
        # keystorePath: '/path/to/keystore.jks'
        # keystorePassword: 'password'  # Optional: can use PROMPTFOO_JKS_PASSWORD
        # keyAlias: 'alias'  # Optional: uses first available if not specified

        # PFX options
        # pfxPath: '/path/to/certificate.pfx'
        # pfxPassword: 'password'  # Optional: can use PROMPTFOO_PFX_PASSWORD
        # certPath: '/path/to/certificate.crt'  # Alternative to pfxPath
        # keyPath: '/path/to/private.key'       # Alternative to pfxPath

        clientId: 'your-client-id'

        # Optional fields with defaults shown
        signatureValidityMs: 300000 # 5 minutes
        signatureAlgorithm: 'SHA256'
        signatureDataTemplate: '{{clientId}}{{timestamp}}\n' # \n is interpreted as a newline character
        signatureRefreshBufferMs: 30000 # Optional: custom refresh buffer
```

:::note
You can use environment variables throughout your HTTP provider configuration using the `{{env.VARIABLE_NAME}}` syntax.
:::

:::info Dependencies

- **JKS support** requires the `jks-js` package: `npm install jks-js`
- **PFX support** requires the `pem` package: `npm install pem`
  :::

When signature authentication is enabled, the following variables are available for use in headers or other templated fields:

- `signature`: The generated signature string (base64 encoded)
- `signatureTimestamp`: The Unix timestamp when the signature was generated

### Signature Auth Options

| Option                   | Type   | Required | Default                             | Description                                                                                                           |
| ------------------------ | ------ | -------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| type                     | string | No       | 'pem'                               | Certificate type: 'pem', 'jks', or 'pfx'                                                                              |
| privateKeyPath           | string | No\*     | -                                   | Path to the PEM private key file used for signing (PEM type only)                                                     |
| privateKey               | string | No\*     | -                                   | PEM private key string (if not using privateKeyPath, PEM type only)                                                   |
| keystorePath             | string | No\*     | -                                   | Path to the JKS keystore file (JKS type only)                                                                         |
| keystorePassword         | string | No       | -                                   | JKS keystore password (JKS type only, can use PROMPTFOO_JKS_PASSWORD env var)                                         |
| keyAlias                 | string | No       | First available alias               | JKS key alias to use (JKS type only)                                                                                  |
| pfxPath                  | string | No\*     | -                                   | Path to the PFX certificate file (PFX type only)                                                                      |
| pfxPassword              | string | No       | -                                   | PFX certificate password (PFX type only, can use PROMPTFOO_PFX_PASSWORD env var)                                      |
| certPath                 | string | No\*     | -                                   | Path to the certificate file (PFX type only, alternative to pfxPath)                                                  |
| keyPath                  | string | No\*     | -                                   | Path to the private key file (PFX type only, alternative to pfxPath)                                                  |
| clientId                 | string | Yes      | -                                   | Client identifier used in signature generation                                                                        |
| signatureValidityMs      | number | No       | 300000                              | Validity period of the signature in milliseconds                                                                      |
| signatureAlgorithm       | string | No       | 'SHA256'                            | Signature algorithm to use (any supported by Node.js crypto)                                                          |
| signatureDataTemplate    | string | No       | '\{\{clientId\}\}\{\{timestamp\}\}' | Template for formatting the data to be signed. Note: `\n` in the template will be interpreted as a newline character. |
| signatureRefreshBufferMs | number | No       | 10% of validityMs                   | Buffer time before expiry to refresh signature                                                                        |

\* Requirements depend on certificate type:

- **PEM**: Either `privateKeyPath` or `privateKey` must be provided
- **JKS**: `keystorePath` must be provided
- **PFX**: Either `pfxPath` or both `certPath` and `keyPath` must be provided

## Request Retries

The HTTP provider automatically retries failed requests in the following scenarios:

- Rate limiting (HTTP 429)
- Server errors
- Network failures

By default, it will attempt up to 4 retries with exponential backoff. You can configure the maximum number of retries using the `maxRetries` option:

```yaml
providers:
  - id: http
    config:
      url: https://api.example.com/v1/chat
      maxRetries: 2 # Override default of 4 retries
```

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
| validateStatus    | Function                | A function that takes a status code and returns a boolean indicating if the response should be treated as successful. By default, accepts all status codes.                         |
| signatureAuth     | object                  | Configuration for digital signature authentication. See Signature Auth Options below.                                                                                               |

### Signature Auth Options

| Option                   | Type   | Required | Default                             | Description                                                                                                           |
| ------------------------ | ------ | -------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| type                     | string | No       | 'pem'                               | Certificate type: 'pem', 'jks', or 'pfx'                                                                              |
| privateKeyPath           | string | No\*     | -                                   | Path to the PEM private key file used for signing (PEM type only)                                                     |
| privateKey               | string | No\*     | -                                   | PEM private key string (if not using privateKeyPath, PEM type only)                                                   |
| keystorePath             | string | No\*     | -                                   | Path to the JKS keystore file (JKS type only)                                                                         |
| keystorePassword         | string | No       | -                                   | JKS keystore password (JKS type only, can use PROMPTFOO_JKS_PASSWORD env var)                                         |
| keyAlias                 | string | No       | First available alias               | JKS key alias to use (JKS type only)                                                                                  |
| pfxPath                  | string | No\*     | -                                   | Path to the PFX certificate file (PFX type only)                                                                      |
| pfxPassword              | string | No       | -                                   | PFX certificate password (PFX type only, can use PROMPTFOO_PFX_PASSWORD env var)                                      |
| certPath                 | string | No\*     | -                                   | Path to the certificate file (PFX type only, alternative to pfxPath)                                                  |
| keyPath                  | string | No\*     | -                                   | Path to the private key file (PFX type only, alternative to pfxPath)                                                  |
| clientId                 | string | Yes      | -                                   | Client identifier used in signature generation                                                                        |
| signatureValidityMs      | number | No       | 300000                              | Validity period of the signature in milliseconds                                                                      |
| signatureAlgorithm       | string | No       | 'SHA256'                            | Signature algorithm to use (any supported by Node.js crypto)                                                          |
| signatureDataTemplate    | string | No       | '\{\{clientId\}\}\{\{timestamp\}\}' | Template for formatting the data to be signed. Note: `\n` in the template will be interpreted as a newline character. |
| signatureRefreshBufferMs | number | No       | 10% of validityMs                   | Buffer time before expiry to refresh signature                                                                        |

\* Requirements depend on certificate type:

- **PEM**: Either `privateKeyPath` or `privateKey` must be provided
- **JKS**: `keystorePath` must be provided
- **PFX**: Either `pfxPath` or both `certPath` and `keyPath` must be provided

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

By default, all response status codes are accepted. You can customize this using the `validateStatus` option:

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
