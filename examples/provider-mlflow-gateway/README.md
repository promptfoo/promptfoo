# provider-mlflow-gateway (MLflow AI Gateway)

This example demonstrates how to use [MLflow AI Gateway](https://mlflow.org/docs/latest/genai/governance/ai-gateway/) as an LLM provider in promptfoo.

To get started:

```bash
npx promptfoo@latest init --example provider-mlflow-gateway
```

## Setup

1. Install and start MLflow:

```bash
pip install mlflow[genai]
mlflow server --host 127.0.0.1 --port 5000
```

2. Create a gateway endpoint in the MLflow UI at http://localhost:5000 (AI Gateway → Create Endpoint).

3. Set environment variables:

```bash
export MLFLOW_GATEWAY_URL=http://localhost:5000
```

4. Run the evaluation:

```bash
promptfoo eval -c promptfooconfig.yaml
```

## Configuration

Update `my-chat-endpoint` in `promptfooconfig.yaml` with the name of the gateway endpoint you created.

See the [MLflow Gateway provider docs](https://www.promptfoo.dev/docs/providers/mlflow-gateway/) for all configuration options.
