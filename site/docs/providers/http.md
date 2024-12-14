---
sidebar_position: 53
sidebar_label: HTTP API
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
      model: 'gpt-4o-mini'
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
2. You can use template variables like `{{api_key}}` and `{{prompt}}` within the raw request. These will be replaced with actual values when the request is sent.
3. The `transformResponse` property is used to extract the desired information from the JSON response.

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
      model: 'gpt-4o-mini'
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

## Response parser

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
  "model": "gpt-4o-mini",
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

This expression will be evaluated with two variables available:

- `json`: The parsed JSON response (if the response is valid JSON)
- `text`: The raw text response

#### Function parser

When using promptfoo as a Node.js library, you can provide a function as the response parser:

```javascript
{
  providers: [{
    id: 'https',
    config: {
      url: 'https://example.com/generate',
      transformResponse: (json, text) => {
        // Custom parsing logic
        return json.choices[0].message.content;
      },
    }
  }],
}
```

#### File-based parser

You can use a JavaScript file as a response parser by specifying the file path with the `file://` prefix. The file path is resolved relative to the directory containing the promptfoo configuration file.

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      transformResponse: 'file://path/to/parser.js'
```

The parser file should export a function that takes two arguments (`json` and `text`) and returns the parsed output. For example:

```javascript
module.exports = (json, text) => {
  return json.choices[0].message.content;
};
```

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

## Session management

### Server-side session management

When using an HTTP provider with multi-turn redteam attacks like GOAT and Crescendo, you may need to maintain session IDs between rounds. The HTTP provider will automatically extract the session ID from the response headers and store it in the `vars` object.

Create a session parser that extracts the session ID from the response headers and returns it. All of the same formats of response parsers are supported.

The input to the session parser is an object with a `headers` field, which contains the response headers:

```typescript
{
  headers: Record<string, string>;
}
```

Simple header parser:

```yaml
sessionParser: 'set-cookie'
```

The parser can take a string, file or function like the response parser. If you just include a string, it will be treated as a field on the `headers` object.

Then you need to set the session ID in the `vars` object for the next round:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/api'
      headers:
        'Cookie': '{{sessionId}}'
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

## Reference

Supported config options:

| Option            | Type                    | Description                                                                                                                                                                         |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| url               | string                  | The URL to send the HTTP request to. If not provided, the `id` of the provider will be used as the URL.                                                                             |
| request           | string                  | A raw HTTP request to send. This will override the `url`, `method`, `headers`, `body`, and `queryParams` options.                                                                   |
| method            | string                  | The HTTP method to use for the request. Defaults to 'GET' if not specified.                                                                                                         |
| headers           | Record\<string, string> | Key-value pairs of HTTP headers to include in the request.                                                                                                                          |
| body              | Record\<string, any>    | The request body. For POST requests, this will be sent as JSON.                                                                                                                     |
| queryParams       | Record\<string, string> | Key-value pairs of query parameters to append to the URL.                                                                                                                           |
| transformRequest  | string \| Function      | A function, string template, or file path to transform the prompt before sending it to the API.                                                                                     |
| transformResponse | string \| Function      | Transforms the API response using a JavaScript expression (e.g., 'json.result'), function, or file path (e.g., 'file://parser.js'). Replaces the deprecated `responseParser` field. |

Note: All string values in the config (including those nested in `headers`, `body`, and `queryParams`) support Nunjucks templating. This means you can use the `{{prompt}}` variable or any other variables passed in the test context.

In addition to a full URL, the provider `id` field accepts `http` or `https` as values.
