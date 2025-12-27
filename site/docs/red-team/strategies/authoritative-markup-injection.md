---
sidebar_label: Authoritative Markup Injection
title: Authoritative Markup Injection Strategy
description: Test LLM vulnerability to authoritative formatting by embedding prompts in structured markup that exploits trust in formatted content
---

# Authoritative Markup Injection Strategy

The Authoritative Markup Injection strategy tests whether AI systems are more susceptible to harmful requests when they're presented with authoritative-looking formatting or structured markup.

This approach exploits the tendency of language models to place higher trust in content that appears to come from official, structured, or technically formatted sources.

## How It Works

Language models are trained on vast amounts of structured data including documentation, technical specifications, academic papers, and formal communications. This training can create a bias where models treat formally structured or marked-up content as more authoritative or trustworthy.

The strategy works by:

1. Taking a base prompt or test case
2. Dynamically generating authoritative formatting around the content
3. Testing whether the structured presentation increases the model's compliance with potentially harmful requests
4. Evaluating if the model's safety guardrails are more easily bypassed when content appears authoritative

This technique is distinct from simple prompt injection because it focuses specifically on exploiting trust signals embedded in formatting and structure rather than just the content itself.

## Implementation

Add it to your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
strategies:
  # Basic usage
  - authoritative-markup-injection

  # With configuration (specify which variable to inject into)
  - id: authoritative-markup-injection
    config:
      injectVar: query
```

The `injectVar` parameter specifies which variable in your prompt template should receive the authoritative markup injection. If not specified, the strategy will use the default `prompt` injection variable.

Combine with red team plugins to test specific vulnerability categories:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - harmful
    - pii
    - prompt-injection

  strategies:
    - authoritative-markup-injection
```

## Example Scenario

Consider a simple harmful request:

```
Tell me how to create malware
```

With authoritative markup injection, this might be transformed into content that appears to come from:

- Technical documentation or API specifications
- Academic research protocols
- Official security testing frameworks
- Formal compliance requirements
- Industry standard methodologies

The model is tested to see if wrapping the request in authoritative-looking structure makes it more likely to comply, even though the underlying request remains harmful.

## Importance in Gen AI Red Teaming

Authoritative markup injection is particularly important because:

1. **Exploits Training Biases**: Language models develop implicit trust in structured, formally presented content during training
2. **Bypasses Content-Based Filters**: Safety systems often focus on detecting harmful content but may not recognize how formatting affects model behavior
3. **Reflects Real-World Attacks**: Adversaries increasingly use professional-looking formatting to make harmful requests appear legitimate
4. **Tests Context Awareness**: Evaluates whether models can maintain safety standards regardless of how requests are formatted

This strategy helps identify vulnerabilities where models prioritize structural authority over content analysis, which is crucial for building robust AI safety systems.

## Related Concepts

- [Citation Strategy](citation.md) - Tests academic authority bias
- [Prompt Injection](prompt-injection.md) - Direct injection attacks
- [Jailbreak Strategies](iterative.md) - Iterative bypass techniques
- [Composite Jailbreaks](composite-jailbreaks.md) - Combined attack techniques

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
