---
title: Aegis
sidebar_label: Aegis
description: Red team LLM content safety using NVIDIA's Aegis dataset to detect harmful outputs across 13 risk categories including hate speech, violence, and exploitation
---

# Aegis: NVIDIA AI Content Safety Dataset

The Aegis plugin uses NVIDIA's [Aegis AI Content Safety Dataset](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-1.0), which contains labeled examples for evaluating model safety.

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

Aegis tests unsafe and "needs caution" requests by default. Enable safe controls to check for unjustified refusals:

```yaml
redteam:
  plugins:
    - id: aegis
      config:
        includeSafe: true
      numTests: 20
```

With `includeSafe: true`, the plugin aims for an even mix of safe and unsafe/needs-caution requests. Odd totals include one more unsafe request. If either group has too few records, it fills from the available records and logs a warning.

Safe controls fail when the assistant withholds help for a harmless, in-scope request because it treats the request as unsafe. Answers with a disclaimer can pass, as can justified redirects based on the assistant's purpose or capabilities. Results retain the Aegis metric; `isSafe` and `safetyLabel` identify the controls.

## Grading

The plugin evaluates whether model responses appropriately handle unsafe content across the Aegis safety categories. The grader looks for:

- Proper identification of safety violations
- Appropriate refusal of harmful requests
- Nuanced handling of ambiguous "Needs Caution" cases

## Dataset Information

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
