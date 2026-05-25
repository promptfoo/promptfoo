---
sidebar_label: MLflow Gateway
description: Use MLflow AI Gateway as an LLM provider in promptfoo for unified multi-provider access with built-in governance.
---

# MLflow AI Gateway

[MLflow AI Gateway](https://mlflow.org/docs/latest/genai/governance/ai-gateway/) is a database-backed LLM proxy built into the MLflow tracking server (MLflow >= 3.0). It provides a unified OpenAI-compatible API across providers such as OpenAI, Anthropic, and Gemini, with server-side credential management, automatic fallbacks, traffic splitting, usage tracking, and budget policies configured through the MLflow UI.

## Prerequisites

1. Install MLflow and start the server:

```bash
pip install mlflow[genai]
mlflow server --host 127.0.0.1 --port 5000
```

2. Create a gateway endpoint in the MLflow UI at `http://localhost:5000`. Navigate to **AI Gateway → Create Endpoint**, select a provider and model, and enter your provider API key (stored encrypted on the server). See the [MLflow AI Gateway documentation](https://mlflow.org/docs/latest/genai/governance/ai-gateway/endpoints/) for details.

## Provider format

The provider syntax is:

```
mlflow-gateway:<endpoint-name>
```

Where `<endpoint-name>` is the name of the gateway endpoint you created in the MLflow UI.

## Environment variables

| Variable                 | Description                                       | Required |
| ------------------------ | ------------------------------------------------- | -------- |
| `MLFLOW_GATEWAY_URL`     | MLflow server URL (e.g., `http://localhost:5000`) | Yes      |
| `MLFLOW_GATEWAY_API_KEY` | Optional Bearer token forwarded to the gateway    | No       |

:::note
The MLflow quickstart does not require a client API key because provider
credentials are configured server-side. This provider does not fall back to
`OPENAI_API_KEY`, even though it uses an OpenAI-compatible endpoint, so it
will not accidentally forward a cloud OpenAI credential to a self-hosted
gateway. If your deployment accepts a Bearer token, set
`MLFLOW_GATEWAY_API_KEY` or pass `apiKey` in the provider config.
:::

## Basic usage

```yaml title="promptfooconfig.yaml"
providers:
  - mlflow-gateway:my-chat-endpoint

prompts:
  - 'Answer the following question: {{question}}'

tests:
  - vars:
      question: 'What is MLflow AI Gateway?'
    assert:
      - type: contains
        value: 'gateway'
```

Set the gateway URL:

```bash
export MLFLOW_GATEWAY_URL=http://localhost:5000
promptfoo eval
```

## Configuration options

You can pass additional configuration via the `config` key:

```yaml title="promptfooconfig.yaml"
providers:
  - id: mlflow-gateway:my-chat-endpoint
    config:
      gatewayUrl: http://localhost:5000
      temperature: 0.7
      max_tokens: 500
```

| Parameter        | Description                                       | Default                  |
| ---------------- | ------------------------------------------------- | ------------------------ |
| `gatewayUrl`     | MLflow server URL                                 | `MLFLOW_GATEWAY_URL`     |
| `apiKey`         | Optional Bearer token sent as `Authorization`     | `MLFLOW_GATEWAY_API_KEY` |
| `apiKeyRequired` | Fail before calling when a Bearer token is absent | `false`                  |
| `headers`        | Additional request headers for secured gateways   | None                     |
| `temperature`    | Sampling temperature                              | Provider default         |
| `max_tokens`     | Maximum tokens to generate                        | Provider default         |

Most standard [OpenAI chat completion parameters](/docs/providers/openai/#configuring-parameters) are supported since MLflow Gateway uses an OpenAI-compatible API. Authentication and endpoint URL settings are MLflow-specific and do not inherit `OPENAI_API_KEY`, `OPENAI_ORGANIZATION`, or OpenAI base URL variables.

For an MLflow server configured with HTTP Basic authentication, provide the
authorization header required by that deployment:

```yaml
providers:
  - id: mlflow-gateway:my-chat-endpoint
    config:
      headers:
        Authorization: 'Basic {{env.MLFLOW_BASIC_AUTH}}'
```

## Multiple endpoints

You can compare different gateway endpoints (backed by different models) in a single evaluation:

```yaml title="promptfooconfig.yaml"
providers:
  - mlflow-gateway:gpt-4o-endpoint
  - mlflow-gateway:claude-endpoint
  - mlflow-gateway:gemini-endpoint

prompts:
  - 'Summarize the following text: {{text}}'

tests:
  - vars:
      text: 'MLflow AI Gateway provides unified access to LLMs...'
```

## Model-graded assertions

If your eval uses model-graded assertions such as `llm-rubric`, configure a text grader explicitly so promptfoo does not fall back to its default OpenAI grader:

```yaml
providers:
  - id: mlflow-gateway:my-chat-endpoint

defaultTest:
  options:
    provider:
      text: mlflow-gateway:my-chat-endpoint
```

## Gateway features

These are configured in the MLflow UI — no promptfoo configuration changes needed:

- **Fallbacks** — automatic failover to backup models on failure
- **Traffic splitting** — route percentages of requests to different models for A/B testing
- **Budget policies** — alert or reject later requests after a USD threshold is exceeded
- **Usage tracking** — optionally log endpoint requests as traces with latency and token metrics

## Additional resources

- [MLflow AI Gateway documentation](https://mlflow.org/docs/latest/genai/governance/ai-gateway/)
- [Query endpoints reference](https://mlflow.org/docs/latest/genai/governance/ai-gateway/endpoints/query-endpoints/)
