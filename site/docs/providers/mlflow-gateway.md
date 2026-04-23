---
sidebar_label: MLflow Gateway
description: Use MLflow AI Gateway as an LLM provider in promptfoo for unified multi-provider access with built-in governance.
---

# MLflow AI Gateway

[MLflow AI Gateway](https://mlflow.org/docs/latest/genai/governance/ai-gateway/) is a database-backed LLM proxy built into the MLflow tracking server (MLflow ≥ 3.0). It provides a unified OpenAI-compatible API across dozens of providers — OpenAI, Anthropic, Gemini, Mistral, Bedrock, Ollama, and more — with built-in secrets management, fallback/retry, traffic splitting, and budget tracking, all configured through the MLflow UI.

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

| Variable                 | Description                                          | Required |
| ------------------------ | ---------------------------------------------------- | -------- |
| `MLFLOW_GATEWAY_URL`     | MLflow server URL (e.g., `http://localhost:5000`)    | Yes      |
| `MLFLOW_GATEWAY_API_KEY` | API key (not validated by gateway, can be any value) | No       |

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

| Parameter     | Description                | Default              |
| ------------- | -------------------------- | -------------------- |
| `gatewayUrl`  | MLflow server URL          | `MLFLOW_GATEWAY_URL` |
| `temperature` | Sampling temperature       | Provider default     |
| `max_tokens`  | Maximum tokens to generate | Provider default     |

All standard [OpenAI configuration options](/docs/providers/openai/#configuring-parameters) are supported since MLflow Gateway uses an OpenAI-compatible API.

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

## Gateway features

These are configured in the MLflow UI — no promptfoo configuration changes needed:

- **Fallback & retry** — automatic failover to backup models on failure
- **Traffic splitting** — route percentages of requests to different models for A/B testing
- **Budget tracking** — per-endpoint or per-user token budgets
- **Usage tracing** — every call logged as an MLflow trace automatically

## Additional resources

- [MLflow AI Gateway documentation](https://mlflow.org/docs/latest/genai/governance/ai-gateway/)
- [Query endpoints reference](https://mlflow.org/docs/latest/genai/governance/ai-gateway/endpoints/query-endpoints/)
