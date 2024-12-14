---
sidebar_label: Handling Multiple Response Types like Guardrails
---

# Handling Multiple Response Types

There are cases where your target could respond with multiple object types. This is usually the case when the target is blocked by a guardrail. For example,

```json
{
  "message": "Hello, world!"
}
```

or if it is blocked by a guardrail, it could return an error message:

```json
{
  "error": "The content you provided violates our policies."
}
```

# Solution

For the simple case above you can use a response parser with a little bit of logic to handle the multiple response types.

```yaml
- id: http://url.foryour.bot/chat
  label: 'internal-chatbot'
  config:
    method: 'POST'
    headers: { 'Content-Type': 'application/json' }
    body: { 'message': '{{prompt}}' }
    transformResponse: json.response ?? json.error
```

For more complex cases, you can use a custom provider. See the [custom provider docs](/docs/providers/custom-api/).

For example, let's say the response will be return with a 400 status code.

```js
const URL = 'enter your custom provider URL here';

class CustomApiProvider {
  constructor(options) {
    // The caller may override Provider ID (e.g. when using multiple instances of the same provider)
    this.providerId = options.id || 'custom provider';

    // The config object contains any options passed to the provider in the config file.
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    const body = {
      message: prompt,
    };

    // Fetch the data from the API using promptfoo's cache. You can use your own fetch implementation if preferred.
    const response = await fetch(
      URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      10_000 /* 10 second timeout */,
    );

    let message = null;
    if (response.status === 400) {
      message = 'Request blocked by guardrail';
    } else {
      const data = await response.json();
      message = data.message;
    }

    const ret = {
      output: message,
      tokenUsage: {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
      },
    };
    return ret;
  }
}

module.exports = CustomApiProvider;
```
