---
sidebar_position: 50
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
      responseParser: 'json.output'
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

## Parsing a JSON response

If your API responds with a JSON object and you want to pick out a specific value, use the `responseParser` property to set a Javascript snippet that manipulates the provided `json` object.

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
  "model": "gpt-3.5-turbo-0613",
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
