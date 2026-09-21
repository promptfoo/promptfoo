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

:::

## Migrating an existing config

Replace `github:` with a [provider](./index.md) that hosts the model you need. GitHub recommends
[Microsoft Foundry](./azure.md). For Azure, create a deployment and set `AZURE_API_KEY` (or configure [Entra ID authentication](./azure.md#setup)).

```yaml
providers:
  # Before: - id: github:openai/gpt-4o
  - id: azure:chat:my-deployment-name
    config:
      apiHost: my-resource.openai.azure.com
```

## See also

- [Provider Options](/docs/providers/) - Overview of all available providers
- [GitHub Models documentation](https://docs.github.com/en/github-models) - Official retirement notice
