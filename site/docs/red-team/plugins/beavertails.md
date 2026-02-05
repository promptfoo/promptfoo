---
sidebar_label: BeaverTails
description: Red team LLM safety boundaries using BeaverTails dataset of 330k harmful prompts to protect AI systems from abuse, hate speech, and malicious content exploitation
---

# BeaverTails Dataset for LLM Safety Testing

## Overview

The BeaverTails plugin uses the [BeaverTails dataset](https://huggingface.co/datasets/PKU-Alignment/BeaverTails), a dataset of 330,000 prompt injections published by PKU-Alignment to test LLM systems against a comprehensive collection of potentially harmful prompts.

The dataset covers a wide range of harmful content categories including:

- Animal and human abuse
- Criminal activities and unethical behavior
- Discrimination and hate speech
- Explicit adult content
- Misinformation and dangerous advice
- Privacy violations
- Violence and terrorism

## How it works

The plugin:

- Fetches test cases from the BeaverTails dataset
- Filters out safe/benign test cases to focus on potentially harmful prompts
- Randomly selects prompts from the filtered set
- Tests if the model appropriately refuses or handles the harmful prompts

## Quick Start

1. Set your Hugging Face API token as an environment variable:

```bash
export HF_TOKEN=your_huggingface_token  # or HF_API_TOKEN
```

2. Enable the plugin in your configuration:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - beavertails
```

## Configuration

You can control the number of test cases using the `numTests` parameter (defaults to 5):

```yaml
redteam:
  plugins:
    - id: beavertails
      numTests: 25
```

### Filtering by Subcategory

The BeaverTails dataset includes 14 specific harm subcategories. You can filter test cases to focus on specific subcategories:

```yaml
redteam:
  plugins:
    - id: beavertails
      numTests: 10
      config:
        subcategories:
          - self_harm
          - privacy_violation
```

#### Available Subcategories

The following subcategories are available:

- `animal_abuse` - Cruelty, harm, or distress to animals
- `child_abuse` - Physical, emotional, or sexual abuse of minors
- `controversial_topics,politics` - Sensitive political or social issues
- `discrimination,stereotype,injustice` - Unfair treatment based on characteristics
- `drug_abuse,weapons,banned_substance` - Illegal substance or weapon misuse
- `financial_crime,property_crime,theft` - Fraud, embezzlement, theft
- `hate_speech,offensive_language` - Hostile communication targeting groups
- `misinformation_regarding_ethics,laws_and_safety` - False information about critical topics
- `non_violent_unethical_behavior` - Morally wrong actions without violence
- `privacy_violation` - Unauthorized access or disclosure of personal information
- `self_harm` - Self-inflicted harm or suicidal content
- `sexually_explicit,adult_content` - Inappropriate sexual material
- `terrorism,organized_crime` - Terrorist or organized crime content
- `violence,aiding_and_abetting,incitement` - Physical harm or encouragement

**Example: Testing only self-harm content**

```yaml
redteam:
  plugins:
    - id: beavertails
      numTests: 20
      config:
        subcategories:
          - self_harm
```

This focused approach allows you to:

- Test specific safety boundaries relevant to your application
- Get more granular insights into model performance by category
- Focus testing resources on high-priority harm categories

## Grading

The plugin uses a specialized grader that evaluates model outputs against a safety rubric. The grader checks if the output:

- Refuses to engage with harmful content
- Avoids promoting or assisting with harmful activities
- Maintains appropriate boundaries
- Provides safe and ethical responses

Outputs are graded as either SAFE (pass) or COMPLICIT (fail) based on these criteria.

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [Prompt Injection](../strategies/prompt-injection.md)
- [Jailbreak strategies](../strategies/composite-jailbreaks.md)
