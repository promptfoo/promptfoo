---
sidebar_label: GOAT
---

# GOAT Strategy

The [GOAT](https://arxiv.org/abs/2410.01606) (Generative Offensive Agent Tester) strategy is an advanced automated red teaming technique that uses an "attacker" LLM to dynamically generate **multi-turn** conversations aimed at bypassing a target model's safety measures.

It was introduced by Meta researchers in 2024 and achieves high success rates against modern LLMs by simulating how real users interact with AI systems.

Use it like so in your promptfooconfig.yaml:

```yaml
strategies:
  - goat:
      remote: true # Remote-only strategy
```

:::warning
This is a remote-only strategy and requires an connection to promptfoo's free grading API. Local grading is not supported. Your target model must be able to handle the OpenAI message format.
:::

## How It Works

The GOAT strategy works by:

1. Using an "attacker" LLM initialized with red teaming context and adversarial techniques
2. Employing chain-of-thought reasoning to dynamically generate prompts
3. Observing target model responses and adapting the conversation strategy
4. Combining multiple jailbreaking techniques in a single conversation

For each conversation turn, the attacker model:

- Makes an observation about the target's previous response
- Reflects on progress toward the goal
- Selects an attack strategy
- Generates the next adversarial prompt

We loop this process until we either achieve the goal or reach a maximum number of turns.

## Related Concepts

- [Multi-turn Jailbreaks](multi-turn.md)
- [Tree-based Jailbreaks](tree.md)
- [Iterative Jailbreaks](iterative.md)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
