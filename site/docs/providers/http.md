---
sidebar_position: 53
sidebar_label: HTTP API
---

# HTTP/HTTPS API

Setting provider id to a URL sends an HTTP request to the endpoint. This is a general-purpose way to use any HTTP endpoint for inference.

The provider config gives you a way to construct the HTTP request and extract the inference result from the response.

```yaml
providers:
  - id: 'https://example.com/generate'
    config:
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        myPrompt: '{{prompt}}'
      responseParser: 'json.output' # extract the "output" field from the response
```

The placeholder variable `{{prompt}}` will be replaced by the final prompt for the test case. You can also reference test variables as you construct the request:

```yaml
providers:
  - id: 'https://example.com/generateTranslation'
    config:
      body:
        prompt: '{{prompt}}'
        model: '{{model}}'
        translate: '{{language}}'

tests:
  - vars:
      model: 'gpt-4'
      language: 'French'
```

If not specified, HTTP POST with content-type application/json is assumed.

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
      responseParser: 'json.content' # extract the "content" field from the response
```

In this example:

1. The `request` property contains a raw HTTP request, including the method, path, headers, and body.
2. You can use template variables like `{{api_key}}` and `{{prompt}}` within the raw request. These will be replaced with actual values when the request is sent.
3. The `responseParser` property is used to extract the desired information from the JSON response.

You can also load the raw request from an external file using the `file://` prefix:

```yaml
providers:
  - id: https
    config:
      request: file://path/to/request.txt
      responseParser: 'json.text'
```

This path is relative to the directory containing the Promptfoo config file.

Then create a file at `path/to/request.txt`:

```
POST /api/generate HTTP/1.1
Host: example.com
Content-Type: application/json

{"prompt": "Tell me a joke"}
```

### Nested objects

Nested objects are supported and should be passed to the `dump` function.

```yaml
providers:
  - id: 'https://example.com/generateTranslation'
    config:
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
      model: 'gpt-4'
      language: 'French'
```

Note that any valid JSON string within `body` will be converted to a JSON object.

## Parsing a JSON response

By default, the entire response is returned as the output. If your API responds with a JSON object and you want to pick out a specific value, use the `responseParser` property to set a Javascript snippet that manipulates the provided `json` object.

For example, this `responseParser` configuration:

```yaml
providers:
  - id: 'https://example.com/openai-compatible/chat/completions'
    config:
      # ...
      responseParser: 'json.choices[0].message.content'
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

## Parsing a text response

If your API responds with a text response, you can use the `responseParser` property to set a Javascript snippet that manipulates the provided `text` object.

For example, this `responseParser` configuration:

```yaml
providers:
  - id: 'https://example.com/api'
    config:
      # ...
      responseParser: 'text.slice(11)'
```

Extracts the message content "hello world" from this response:

```
Assistant: hello world
```

## Query parameters

Query parameters can be specified in the provider config using the `queryParams` field. These will be appended to the URL as GET parameters.

```yaml
providers:
  - id: 'https://example.com/search'
    config:
      // highlight-start
      method: 'GET'
      queryParams:
        q: '{{prompt}}'
        foo: 'bar'
      // highlight-end
```

## Using as a library

If you are using promptfoo as a [node library](/docs/usage/node-package/), you can provide the equivalent provider config:

```js
{
  // ...
  providers: [{
    id: 'https://example.com/generate',
    config: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        foo: '{{bar}}',
      },
      responseParser: (json) => json.output,
    }
  }],
}
```

## Reference

Supported config options:

| Option         | Type                     | Description                                                                                                                                   |
| -------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| url            | string                   | The URL to send the HTTP request to. If not provided, the `id` of the provider will be used as the URL.                                       |
| request        | string                   | A raw HTTP request to send. This will override the `url`, `method`, `headers`, `body`, and `queryParams` options.                             |
| method         | string                   | The HTTP method to use for the request. Defaults to 'GET' if not specified.                                                                   |
| headers        | Record\<string, string\> | Key-value pairs of HTTP headers to include in the request.                                                                                    |
| body           | Record\<string, any\>    | The request body. For POST requests, this will be sent as JSON.                                                                               |
| queryParams    | Record\<string, string\> | Key-value pairs of query parameters to append to the URL.                                                                                     |
| responseParser | string \| Function       | A function or string representation of a function to parse the response. If not provided, the entire response will be returned as the output. |

Note: All string values in the config (including those nested in `headers`, `body`, and `queryParams`) support Nunjucks templating. This means you can use the `{{prompt}}` variable or any other variables passed in the test context.

In addition to a full URL, the provider `id` field accepts `http` or `https` as values.
