---
sidebar_label: Meta-Agent Jailbreaks
title: Meta-Agent Jailbreaks Strategy
description: Strategic jailbreak testing with adaptive decision-making to test system resilience
---

# Meta-Agent Jailbreaks Strategy

The Meta-Agent Jailbreaks strategy (`jailbreak:meta`) uses strategic decision-making to test your system's resilience against adaptive attacks.

Unlike standard iterative approaches that refine a single prompt, the meta-agent builds a custom taxonomy of approaches and adapts its strategy based on your target's responses.

## Implementation

Add it to your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
strategies:
  # Basic usage
  - jailbreak:meta

  # With configuration
  - id: jailbreak:meta
    config:
      # Optional: Number of iterations to attempt (default: 10)
      numIterations: 50
```

You can also override the number of iterations via an environment variable:

```bash
PROMPTFOO_NUM_JAILBREAK_ITERATIONS=5
```

:::info Cloud Required
This strategy requires Promptfoo Cloud to maintain persistent memory and strategic reasoning across iterations. Set `PROMPTFOO_REMOTE_GENERATION_URL` or log into Promptfoo Cloud.
:::

## How It Works

The meta-agent maintains memory across iterations to systematically explore different attack approaches. When one type of approach fails, it pivots to fundamentally different techniques rather than continuing to refine the same pattern.

This provides broader coverage of potential vulnerabilities at the cost of more API calls. Standard jailbreak refines a single approach repeatedly, while meta-agent explores multiple distinct approaches to find weaknesses.

## Meta-Agent vs Standard Jailbreak

| Aspect       | Meta-Agent                                  | Standard Iterative                    |
| ------------ | ------------------------------------------- | ------------------------------------- |
| **Approach** | Explores multiple distinct attack types     | Refines variations of single approach |
| **Coverage** | Broad - tests different attack categories   | Deep - exhausts one approach          |
| **Cost**     | Higher (more diverse attempts)              | Lower (focused refinement)            |
| **Best For** | Finding any vulnerability in robust systems | Testing specific attack patterns      |

The meta-agent stops when it finds a vulnerability, determines the target is secure, or reaches max iterations.

## When to Use

**Use `jailbreak:meta` when:**

- Testing production systems where you need comprehensive coverage of attack types
- Your guardrails might block obvious approaches but miss alternative attack angles
- Cost is less critical than finding all potential vulnerabilities

**Use standard `jailbreak` when:**

- Running large-scale tests where API cost is a primary concern
- Testing early-stage systems without sophisticated defenses
- Cloud access is unavailable

## Related Concepts

- [Iterative Jailbreaks](iterative.md) - Sequential refinement approach
- [Hydra Multi-turn](hydra.md) - Multi-turn branching agent with scan-wide memory
- [Tree-based Jailbreaks](tree.md) - Branching exploration strategy
- [Prompt Injections](prompt-injection.md) - Direct injection techniques
- [Multi-turn Jailbreaks](multi-turn.md) - Conversation-based attacks

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
