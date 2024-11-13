---
sidebar_label: GOAT
---

# GOAT Technique for Jailbreaking LLMs

The GOAT (Generative Offensive Agent Tester) strategy is an advanced automated red teaming technique that uses an "attacker" LLM to dynamically generate **multi-turn** conversations aimed at bypassing a target model's safety measures.

It was [introduced by Meta researchers](https://arxiv.org/abs/2410.01606) in 2024 and achieves high success rates against modern LLMs by simulating how real users interact with AI systems, with an Attack Success Rate (ASR@10) of 97% against Llama 3.1 and 88% against GPT-4-Turbo on the JailbreakBench dataset.

Use it like so in your promptfooconfig.yaml:

```yaml
strategies:
  - id: goat
    config:
      maxTurns: 5 # Maximum conversation turns (default)
      stateless: true # Sends the entire conversation history with each turn (Default), set to False if you're using any custom providers
```

:::warning
This is a remote-only strategy and requires an connection to promptfoo's free grading API. Local grading is not supported.
:::

:::warning
By default, GOAT sends the entire conversation history with each turn. Set `stateless: false` if you're using any custom providers which just requires the last message. If your provider requires a sessionId or cookie ensure you're setting that up in your provider config.
:::

## How It Works

![GOAT LLM attack](/img/docs/goat.svg)

GOAT uses an attacker LLM that engages in multi-turn conversations with a target model.

The attacker pursues multiple adversarial techniques: output manipulation, safe response distractors, and fictional scenarios. Unlike simpler approaches, GOAT adapts its strategy based on the target model's responses, similar to how human red teamers operate.

Each conversation turn follows a structured three-step reasoning process:

1. **Observation**: Analyzes the target model's previous response and identifies triggered safety mechanisms
2. **Strategic Planning**: Reflects on conversation progress and develops the next approach
3. **Attack Generation**: Selects and combines appropriate techniques to generate the next prompt

![GOAT attack flow](/img/docs/goat-attack-flow.svg)

This process is looped until we either achieve the goal or reach a maximum number of turns.

GOAT's effectiveness stems from its ability to simulate realistic user behavior while maintaining technical sophistication.

Instead of relying on brute-force approaches or static prompts, its dynamic conversation and reasoning make it particularly effective at identifying vulnerabilities in LLM applications.

## Related Concepts

- [Multi-turn Jailbreaks](multi-turn.md)
- [Tree-based Jailbreaks](tree.md)
- [Iterative Jailbreaks](iterative.md)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
