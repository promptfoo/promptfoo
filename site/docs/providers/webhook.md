---
sidebar_label: Generic Webhook
description: Configure a webhook provider to test LLM flows and prompt chains through HTTP POST requests. Send prompts to your endpoint and compare responses in evals.
---

# Generic Webhook

The webhook provider can be useful for triggering more complex flows or prompt chains end to end in your app.

It is specified like so:

```yaml
providers:
  - webhook:http://example.com/webhook
```

promptfoo will send an HTTP POST request with the following JSON payload:

```json
{
  "prompt": "..."
}
```

It expects a successful (2xx) HTTP response with JSON in this format. Non-2xx
responses are provider errors, even if their body contains an `output` field:

```json
{
  "output": "..."
}
```

## Passing custom properties

It is possible to set webhook provider properties under the `config` key by using a more verbose format:

```yaml
providers:
  - id: webhook:http://example.com/webhook
    config:
      foo: bar
      test: 123
```

These config properties will be passed through in the JSON request payload:

```json
{
  "prompt": "...",
  "config": {
    "foo": "bar",
    "test": 123
  }
}
```
