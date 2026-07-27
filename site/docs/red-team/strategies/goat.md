---
sidebar_label: GOAT
title: GOAT Jailbreaking Strategy
description: Apply GOAT (Generative Offensive Agent Tester) for adaptive multi-turn jailbreaking using adversarial agent dialogues
---

# GOAT Technique for Jailbreaking LLMs

The GOAT (Generative Offensive Agent Tester) strategy uses an attacker LLM to generate **multi-turn** conversations that probe a target model's safety measures.

It was [introduced by Meta researchers](https://arxiv.org/abs/2410.01606) in 2024 and simulates how real users interact with AI systems. The paper reports an Attack Success Rate (ASR@10) of 97% against Llama 3.1 and 88% against GPT-4-Turbo on the JailbreakBench dataset.

## Implementation

Use it by selecting it in the Strategies UI or by editing your config:

```yaml title="promptfooconfig.yaml"
strategies:
  - id: goat
    config:
      maxTurns: 5 # Maximum conversation turns (default)
      stateful: false # Sends the entire conversation history with each turn (Default)
      continueAfterSuccess: false # Stop after the first successful attack (default)
```

:::info
If your system maintains a conversation history and only expects the latest message to be sent, set `stateful: true`. [Make sure to configure cookies or sessions in your provider as well.](/docs/providers/http/#server-side-session-management)
:::

## How It Works

![GOAT reasoning loop that observes a target response, plans an approach, and generates the next turn](/img/docs/goat.svg)

GOAT uses an attacker LLM that engages in multi-turn conversations with a target model.

The attacker pursues multiple adversarial techniques: output manipulation, safe response distractors, and fictional scenarios. Unlike simpler approaches, GOAT adapts its strategy based on the target model's responses, similar to how human red teamers operate.

Each conversation turn follows a structured three-step reasoning process:

1. **Observation**: Analyzes the target model's previous response and identifies triggered safety mechanisms
2. **Strategic Planning**: Reflects on conversation progress and develops the next approach
3. **Attack Generation**: Selects and combines appropriate techniques to generate the next prompt

![GOAT attack flow showing target calls, response grading, adaptation, and stop conditions](/img/docs/goat-attack-flow.svg)

This process is looped until we either achieve the goal or reach a maximum number of turns.

GOAT changes tactics based on the target's responses instead of repeating a static prompt. This helps it find conversational paths that a single-turn test can miss.

## Related Concepts

- [Multi-turn Jailbreaks](multi-turn.md)
- [Tree-based Jailbreaks](tree.md)
- [Meta-Agent Jailbreaks](meta.md)
- [Red Team Strategies](/docs/red-team/strategies/) - Full strategy catalog
