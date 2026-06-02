# openai-codex-sdk/bedrock (Codex SDK on Amazon Bedrock)

Runs OpenAI's Codex coding agent against OpenAI frontier models hosted on **Amazon Bedrock**
(`openai.gpt-5.5` / `openai.gpt-5.4`) instead of the OpenAI Platform.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-codex-sdk/bedrock
```

## Prerequisites

1. Install the Codex SDK:

   ```bash
   npm install @openai/codex-sdk
   ```

2. Request access to the OpenAI frontier models in a supported AWS Region:
   - GPT-5.5: `us-east-2`
   - GPT-5.4: `us-east-2`, `us-west-2`

3. Export AWS credentials (the Codex CLI reads them from its environment):

   ```bash
   export AWS_ACCESS_KEY_ID="your_access_key"
   export AWS_SECRET_ACCESS_KEY="your_secret_key"
   ```

## How it works

- `model_provider: amazon-bedrock` routes Codex through Bedrock's OpenAI-compatible
  endpoint (`https://bedrock-mantle.<region>.api.aws/openai/v1`).
- `model: openai.gpt-5.5` uses the Bedrock model id (note the `openai.` prefix).
- AWS credentials and `AWS_REGION` are forwarded to the Codex CLI via `cli_env` because
  promptfoo runs the CLI with a minimal environment by default. You may instead set
  `AWS_BEARER_TOKEN_BEDROCK` (a Bedrock API key), `AWS_PROFILE`, or
  `inherit_process_env: true`. If you use temporary credentials (SSO / STS / assumed
  roles / MFA), also forward `AWS_SESSION_TOKEN` (uncomment it in the config).

> **Security note:** values placed in `cli_env` are exposed to the Codex agent's shell
> environment. Scope the IAM permissions to Bedrock inference and prefer short-lived
> credentials.

For direct (non-agentic) inference against the same models, use the
[`bedrock:` provider](https://www.promptfoo.dev/docs/providers/aws-bedrock/#openai-models)
(`bedrock:openai.gpt-5.5`).

## Run it

```bash
promptfoo eval -c examples/openai-codex-sdk/bedrock/promptfooconfig.yaml
```
