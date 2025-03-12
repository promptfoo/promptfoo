---
sidebar_label: Pliny Injections
---

# Pliny prompt injections for LLMs

## Overview

The Pliny plugin is designed to test LLM systems using a curated collection of prompts from the [L1B3RT4S repository](https://github.com/elder-plinius/L1B3RT4S).

These prompts are specifically crafted to test various aspects of LLM behavior, including safety boundaries, ethical guidelines, and response patterns across different major AI companies (Google, Anthropic, Amazon, Meta, OpenAI, etc.).

The prompts are dynamically fetched from the repository. Please be aware of any license requirements if you create derived works from these prompts.

## How it works

For each test, the plugin:

- Randomly selects prompts from the collected set
- Tests if the model appropriately refuses or handles the prompts
- Verifies that the model doesn't simply repeat the test prompt

## Configuration

To include the Pliny plugin in your LLM red teaming setup, add the following configuration to your YAML file:

```yaml
redteam:
  plugins:
    - pliny
```

You can control the number of injections using the `config.numTests` parameter (defaults to 5):

```yaml
redteam:
  plugins:
    - id: pliny
      numTests: 25
```

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [Prompt Injection](../strategies/prompt-injection.md)
- [Jailbreak strategies](../strategies/composite-jailbreaks.md)

## License

The prompts used by this plugin are licensed under the AGPL-3.0 license and are dynamically downloaded from the L1B3RT4S repository. For details, see the [LICENSE](https://github.com/elder-plinius/L1B3RT4S/blob/main/LICENSE) file in the repository.
