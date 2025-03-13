# Generic webhook

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

It expects a JSON response in this format:

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
