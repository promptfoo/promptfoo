---
title: GitHub Models Provider
description: 'GitHub Models retired on July 30, 2026. Learn how to migrate existing promptfoo configurations to another provider with its own endpoint and credentials.'
keywords:
  [github models, llm providers, openai, anthropic, claude, gemini, grok, deepseek, ai models]
sidebar_label: GitHub Models
---

# GitHub Models

:::warning Retired service

[GitHub retired GitHub Models on July 30, 2026](https://docs.github.com/en/github-models), including the inference API. The `github:` provider now reports a retirement error, and `GITHUB_TOKEN` no longer selects a default grader. GitHub Copilot is a separate service.

Choose another [provider](./index.md) and configure its endpoint, model or deployment, and credentials. Provider IDs and credentials are not interchangeable. GitHub recommends Azure AI Foundry; see the [Azure provider](./azure.md) for configuration.

:::

## Migrating an existing config

Replace the `github:` provider with one that has its own endpoint and credentials. Model names and
API keys are not portable between providers, so set both.

```yaml
providers:
  # Before: - id: github:openai/gpt-4o
  - id: azure:chat:my-deployment-name
    config:
      apiHost: my-resource.openai.azure.com
```

GitHub recommends Microsoft Foundry; see the [Azure provider](./azure.md). Any provider in the
[provider list](./index.md) works — pick whichever hosts the model you were using.

## See also

- [Provider Options](/docs/providers/) - Overview of all available providers
- [GitHub Models documentation](https://docs.github.com/en/github-models) - Official retirement notice
