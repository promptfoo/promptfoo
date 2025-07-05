---
sidebar_label: Pandamonium
title: Pandamonium Jailbreaking Strategy
description: Advanced automated red teaming technique that dynamically generates conversations to bypass safety measures
---

# Pandamonium (experimental)

The Pandamonium (Prompt-based Automation for Navigating Discovery of Attacks, Misuse, Opportunistic Nefarious Intents, and Uncovering Model Exploits) strategy is an advanced automated red teaming technique that dynamically generates single or **multi-turn** conversations aimed at bypassing a target model's safety measures.

:::warning
This is an experimental strategy currently in development by the Promptfoo team.
:::

:::warning
This strategy does not have a token limit and will continue to run until it finds a jailbreak or is stopped.
:::

## Implementation

Use it like so in your promptfooconfig.yaml:

```yaml title="promptfooconfig.yaml"
strategies:
  - id: pandamonium
```

## How It Works

Pandamonium uses a specialized attack agent that:

1. Analyzes the target model's behavior and responses
2. Dynamically generates and refines attack approaches
3. Pursues multiple exploitation pathways in parallel
4. Adapts tactics based on the model's safety mechanisms

Unlike other strategies, Pandamonium will continue running until it either successfully jailbreaks the model or is manually stopped.

## Related Concepts

- [GOAT Strategy](goat.md) - Similar multi-turn jailbreaking technique
- [Tree-based Jailbreaks](tree.md) - Another approach to dynamic jailbreaking
- [Multi-turn Jailbreaks](multi-turn.md) - Other multi-turn attack strategies

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
