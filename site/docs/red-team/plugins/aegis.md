---
title: Aegis
sidebar_label: Aegis
sidebar_position: 10
description: Red team LLM content safety using NVIDIA's Aegis dataset to detect harmful outputs across 13 risk categories including hate speech, violence, and exploitation
---

# Aegis: NVIDIA AI Content Safety Dataset

The Aegis plugin uses NVIDIA's [Aegis AI Content Safety Dataset](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-1.0), which contains 11,997 manually annotated examples designed for content safety evaluation.

The dataset covers 13 critical safety categories:

- **Hate/Identity Hate** - Content targeting protected characteristics
- **Sexual** - Sexually explicit content and discussions
- **Violence** - Content promoting or describing violent acts
- **Suicide and Self Harm** - Content encouraging self-harm
- **Sexual Minor** - Any sexual content involving minors
- **Guns/Illegal Weapons** - Content about illegal weapons
- **Controlled/Regulated Substances** - Drug trafficking, substance use
- **Criminal Planning/Confessions** - Planning or confessing crimes
- **PII/Privacy** - Personal information and privacy violations
- **Harassment** - Bullying and targeted harassment
- **Profanity** - Offensive language and inappropriate content
- **Threat** - Direct or indirect threats of harm
- **Other** - Extensible category for emerging risks

The dataset also includes **Safe** content and **Needs Caution** examples for ambiguous cases requiring careful consideration.

## How it Works

The plugin:

- Fetches test cases from NVIDIA's professionally annotated dataset
- Samples user-message records from the dataset
- Tests model responses against a safety rubric aligned with the 13-category Aegis taxonomy
- Includes both safe and unsafe records when safe controls are enabled

## Quick Start

1. Set your Hugging Face API token as an environment variable:

```bash
export HF_TOKEN=your_huggingface_token  # or HF_API_TOKEN
```

2. Enable the plugin in your configuration:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - aegis
```

## Configuration

You can control the number of test cases using the `numTests` parameter:

```yaml
redteam:
  plugins:
    - id: aegis
      numTests: 25 # Default is 5
```

### Testing for Over-Blocking

By default, Aegis tests unsafe and "needs caution" prompts to ensure your model handles harmful content appropriately. You can also test for over-blocking (false positives) by including safe prompts:

```yaml
redteam:
  plugins:
    - id: aegis
      config:
        includeSafe: true
      numTests: 20
```

When `includeSafe: true` is set:

- Test cases use a balanced mix of safe and unsafe/needs-caution prompts
- If the fetched dataset slice cannot supply both labels, available cases are used and a warning is logged
- Safe prompts use inverted grading logic: they SHOULD be answered (not refused)
- This helps identify if your guardrails are too strict and block legitimate requests
- Metadata includes `isSafe` and `safetyLabel` fields for filtering and analysis

## Grading

The plugin evaluates whether model responses appropriately handle unsafe content across the Aegis safety categories. The grader looks for:

- Proper identification of safety violations
- Appropriate refusal of harmful requests
- Nuanced handling of ambiguous "Needs Caution" cases

## Dataset Information

- **Size**: 11,997 annotated examples (10,798 train and 1,199 test)
- **Annotation**: Professional team of 12 annotators with quality assurance
- **Formats**: The dataset includes several interaction formats; the plugin samples user-message records
- **License**: CC-BY-4.0 (open source)

## References

- [Aegis AI Content Safety Dataset](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-1.0)
- [NVIDIA Aegis Research Paper](https://arxiv.org/abs/2404.05993)
- [Dataset v2.0 (33k examples)](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-2.0)

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [Harmful Content Plugin](harmful.md)
- [BeaverTails Plugin](beavertails.md)
- [HarmBench Plugin](harmbench.md)
- [ToxicChat Plugin](toxic-chat.md)
