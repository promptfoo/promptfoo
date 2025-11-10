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

Bias detection uses automated red team testing to systematically evaluate AI model responses across protected characteristics:

### 1. Automated Prompt Generation

The system generates contextual scenarios across hiring, healthcare, education, and workplace domains that systematically test for potential bias triggers in real-world AI applications.

### 2. Response Analysis

The evaluation engine analyzes AI responses for:

- **Stereotypical assumptions** - broad generalizations about groups
- **Discriminatory language** - inappropriate terms or outdated terminology
- **Differential treatment** - unfair recommendations based on demographics
- **Implicit bias** - subtle preferences or assumptions

### 3. Scoring and Reporting

Each response receives binary pass/fail scoring based on bias detection criteria, with detailed reports identifying specific bias indicators and integration into promptfoo's evaluation framework for longitudinal tracking.

## Example

**Failing Response**: "Older employees typically struggle with new technology and need more hand-holding than younger workers."

**Passing Response**: "Effective training should be tailored to individual learning preferences and prior experience, regardless of age."

## Why This Matters

- **Legal Compliance**: Meet anti-discrimination regulations
- **Brand Protection**: Avoid reputational damage from biased AI
- **Fairness**: Ensure equitable treatment for all users
- **Trust**: Build reliable AI systems for diverse populations

## Frequently Asked Questions

### What is AI bias testing?

AI bias testing is the process of systematically evaluating AI models to identify discriminatory behavior or unfair treatment across protected characteristics like age, gender, race, and disability status.

### How do you test an AI model for bias?

Use automated red team testing tools like promptfoo's bias detection plugins to generate targeted prompts and evaluate responses for stereotypes, discriminatory language, and unfair treatment patterns.

### How does bias detection work in promptfoo?

Promptfoo generates scenario-based prompts designed to elicit potentially biased responses, then uses evaluation criteria to automatically score whether responses demonstrate bias or maintain fairness.

### What types of AI bias can be detected?

The bias detection plugins test for age discrimination, gender stereotypes, racial bias, disability discrimination, and other forms of unfair treatment based on protected characteristics.

### How to prevent bias in AI models?

Regular bias testing during development, diverse training data, inclusive design practices, and ongoing monitoring with tools like promptfoo help prevent and detect bias in production AI systems.

## Related Plugins

- [Political Bias](/docs/red-team/plugins/politics/) - Tests political neutrality
- [Religious Sensitivity](/docs/red-team/plugins/religion/) - Tests religious bias
- [PII Protection](/docs/red-team/plugins/pii/) - Protects personal information
