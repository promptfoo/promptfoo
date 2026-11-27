# provider-mlflow-gateway (MLflow AI Gateway)

This example demonstrates how to use [MLflow AI Gateway](https://mlflow.org/docs/latest/genai/governance/ai-gateway/) as an LLM provider in promptfoo.

To get started:

On Windows (PowerShell), use `npx.cmd` instead of `npx` for the Promptfoo commands in this guide.

```bash
npx promptfoo@latest init --example provider-mlflow-gateway
cd provider-mlflow-gateway
```

## Setup

1. Use Python 3.10 or later to install and start MLflow in a virtual environment. Invoke its executables directly; activation is not required.

On macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade "mlflow[genai]>=3.16.1,<4"
.venv/bin/mlflow server --host 127.0.0.1 --port 5000
```

On Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade "mlflow[genai]>=3.16.1,<4"
.\.venv\Scripts\mlflow.exe server --host 127.0.0.1 --port 5000
```

2. Create a gateway endpoint in the MLflow UI at http://127.0.0.1:5000 (AI Gateway → Create Endpoint), select its model, and configure that model provider's credentials. Name the endpoint `my-chat-endpoint` to use the example unchanged.

3. In another terminal, open the example directory and set the gateway URL:

On macOS/Linux:

```bash
export MLFLOW_GATEWAY_URL=http://127.0.0.1:5000
```

On Windows (PowerShell):

```powershell
$env:MLFLOW_GATEWAY_URL = "http://127.0.0.1:5000"
```

4. Run the evaluation:

```bash
npx promptfoo@latest eval
```

## Configuration

Update `my-chat-endpoint` in `promptfooconfig.yaml` with the name of the gateway endpoint you created.
The example also uses that endpoint as the `llm-rubric` grader, so it runs without a separate OpenAI API key.

See the [MLflow Gateway provider docs](https://www.promptfoo.dev/docs/providers/mlflow-gateway/) for all configuration options.
