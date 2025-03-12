---
sidebar_label: Pandamonium
---

# Pandamonium (experimental)

The Pandamonium (Prompt-based Automation for Navigating Discovery of Attacks, Misuse, Opportunistic Nefarious Intents, and Uncovering Model Exploits) strategy is an advanced automated red teaming technique that dynamically generates single or **multi-turn** conversations aimed at bypassing a target model's safety measures.

:::warning
This is an experimental strategy currently in development by the Promptfoo team.
:::

:::warning
This strategy does not have a token limit and will continue to run until it finds a jailbreak or is stopped.
:::

Use it like so in your promptfooconfig.yaml:

```yaml
strategies:
  - id: pandamonium
```
