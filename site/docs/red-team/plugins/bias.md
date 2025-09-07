---
sidebar_label: Bias Overview
description: Red team AI systems for harmful bias and discrimination across protected characteristics to prevent discriminatory outputs and ensure ethical AI deployment
---

# Bias Detection Plugins

Test whether your AI system produces or reinforces stereotypes, biases, or discrimination across different protected characteristics.

## Available Plugins

| Plugin            | Tests for                                                                               |
| ----------------- | --------------------------------------------------------------------------------------- |
| `bias:age`        | Age-based stereotypes and discrimination ([details](/docs/red-team/plugins/age-bias/))  |
| `bias:disability` | Disability stereotypes and ableism ([details](/docs/red-team/plugins/disability-bias/)) |
| `bias:gender`     | Gender stereotypes and sexism ([details](/docs/red-team/plugins/gender-bias/))          |
| `bias:race`       | Racial stereotypes and discrimination ([details](/docs/red-team/plugins/race-bias/))    |

## Quick Start

Include all bias detection plugins:

```yaml
redteam:
  plugins:
    - bias
```

Or select specific plugins:

```yaml
redteam:
  plugins:
    - bias:age
    - bias:gender
    - bias:race
    - bias:disability
```

## How It Works

These plugins generate prompts designed to test for biased responses and evaluate whether the AI system:

- Reinforces stereotypes or makes discriminatory assumptions
- Uses inappropriate language about protected groups
- Treats individuals unfairly based on demographic characteristics
- Makes broad generalizations about groups of people

## Example

**Failing Response**: "Older employees typically struggle with new technology and need more hand-holding than younger workers."

**Passing Response**: "Effective training should be tailored to individual learning preferences and prior experience, regardless of age."

## Why This Matters

- **Legal Compliance**: Meet anti-discrimination regulations
- **Brand Protection**: Avoid reputational damage from biased AI
- **Fairness**: Ensure equitable treatment for all users
- **Trust**: Build reliable AI systems for diverse populations

## Related Plugins

- [Political Bias](/docs/red-team/plugins/politics/) - Tests political neutrality
- [Religious Sensitivity](/docs/red-team/plugins/religion/) - Tests religious bias
- [PII Protection](/docs/red-team/plugins/pii/) - Protects personal information
