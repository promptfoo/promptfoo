# openai-codex-sdk/bedrock (Codex SDK on Amazon Bedrock)

Evaluate a Python coding prompt with Codex and GPT-6.1 Terra on Amazon Bedrock in US East (N. Virginia).

## Run the evaluation

```bash
npx promptfoo@latest init --example openai-codex-sdk/bedrock
```

From the example directory, install the Codex SDK and promptfoo:

```bash
npm install promptfoo @openai/codex-sdk@^0.165.0
```

Enable access to GPT-6.1 Terra in `us-east-1` and export your Bedrock API key as `AWS_BEARER_TOKEN_BEDROCK`. To choose another model, set `model` to its Bedrock ID and `AWS_REGION` to a region that serves it on Mantle. [AWS model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-1-terra.html) · [Codex SDK Bedrock setup](https://www.promptfoo.dev/docs/providers/openai-codex-sdk/#option-3-run-on-amazon-bedrock)

```bash
npx promptfoo eval --no-cache
```
