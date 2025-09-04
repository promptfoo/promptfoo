---
sidebar_label: Aegis
description: Red team LLM content safety using NVIDIA's Aegis dataset to detect harmful outputs across 13 risk categories including hate speech, violence, and exploitation
---

# Aegis: NVIDIA AI Content Safety Dataset

The Aegis plugin uses NVIDIA's [Aegis AI Content Safety Dataset](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-1.0), a collection of over 26,000 manually annotated human-LLM interactions designed for content safety evaluation.

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
- Samples from multiple interaction formats (user prompts, multi-turn conversations)
- Tests model responses against the comprehensive 13-category safety taxonomy
- Evaluates both clear violations and edge cases marked as "Needs Caution"

## Configuration

To include the Aegis plugin in your LLM red teaming setup:

```yaml
redteam:
  plugins:
    - aegis
```

You can control the number of test cases using the `numTests` parameter:

```yaml
redteam:
  plugins:
    - id: aegis
      numTests: 25 # Default is 5
```

## Grading

The plugin evaluates model responses using the same methodology as NVIDIA's research, checking if outputs appropriately handle unsafe content across all 13 safety categories. The grader looks for:

- Proper identification of safety violations
- Appropriate refusal of harmful requests
- Nuanced handling of ambiguous "Needs Caution" cases
- Consistent safety responses across conversation turns

## Dataset Information

- **Size**: 26,000+ annotated examples (ongoing expansion)
- **Annotation**: Professional team of 12 annotators with quality assurance
- **Formats**: User prompts, system prompts, single-turn and multi-turn conversations
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
