---
sidebar_position: 41
---

# Ollama

The `ollama` provider is compatible with [Ollama](https://github.com/jmorganca/ollama),
which enables access to Llama2, Codellama, Orca, Vicuna, Nous-Hermes, Wizard Vicuna, and more.

You can use its `/api/generate` endpoint
by specifying any of the following providers from the [Ollama library](https://ollama.ai/library):

- `ollama:llama2`
- `ollama:llama2:13b`
- `ollama:llama2:70b`
- `ollama:llama2-uncensored`
- `ollama:codellama`
- `ollama:orca-mini`
- and so on...

Also supported is the `/api/embeddings` endpoint via `ollama:embeddings:<model name>`.

Supported environment variables:

- `OLLAMA_BASE_URL` - protocol, host name, and port (defaults to `http://localhost:11434`)

To pass configuration options to Ollama, use the `config` key like so:

```yaml title=promptfooconfig.yaml
providers:
  - id: ollama:llama2
    config:
      num_predict: 1024
```

## `localhost` and IPv4 vs IPv6

If locally developing with `localhost` (promptfoo's default),
and Ollama API calls are failing with `ECONNREFUSED`,
then there may be an IPv4 vs IPv6 issue going on with `localhost`.
Ollama's default host uses [`127.0.0.1`](https://github.com/jmorganca/ollama/blob/main/api/client.go#L19),
which is an IPv4 address.
The possible issue here arises from `localhost` being bound to an IPv6 address,
as configured by the operating system's `hosts` file.
To investigate and fix this issue, there's a few possible solutions:

1. Change Ollama server to use IPv6 addressing by running
   `export OLLAMA_HOST=":11434"` before starting the Ollama server.
   Note this IPv6 support requires Ollama version `0.0.20` or newer.
2. Change promptfoo to directly use an IPv4 address by configuring
   `export OLLAMA_BASE_URL="http://127.0.0.1:11434"`.
3. Update your OS's [`hosts`](<https://en.wikipedia.org/wiki/Hosts_(file)>) file
   to bind `localhost` to IPv4.
