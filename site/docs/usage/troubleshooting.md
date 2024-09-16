---
sidebar_position: 60
---

# Troubleshooting

## Out of memory error

To increase the amount of memory available to Promptfoo, increase the node heap size using the `--max-old-space-size` flag. For example:

```bash
# 8192 MB is 8 GB. Set this to an appropriate value for your machine.
NODE_OPTIONS="--max-old-space-size=8192" promptfoo eval
```

## OpenAI API key is not set

If you're using OpenAI, you set the `OPENAI_API_KEY` environment variable or add `apiKey` to the provider config.

If you're not using OpenAI but still receiving this message, you probably have some [model-graded metric](/docs/configuration/expected-outputs/model-graded/) such as `llm-rubric` or `similar` that requires you to [override the grader](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).

Follow the instructions to override the grader, e.g. using the `defaultTest` property.

In this example, we're overriding the text and embedding providers to use Azure OpenAI (gpt-4o for text, and ada-002 for embedding).

```yaml
defaultTest:
  options:
    provider:
      text:
        id: azureopenai:chat:gpt-4o-deployment
        config:
          apiHost: xxx.openai.azure.com
      embedding:
        id: azureopenai:embeddings:text-embedding-ada-002-deployment
        config:
          apiHost: xxx.openai.azure.com
```
