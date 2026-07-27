---
sidebar_label: Aegis
description: Test LLM content safety with user-message prompts from NVIDIA's Aegis v1 dataset, covering risks such as hate speech, violence, and exploitation.
---

# Aegis: NVIDIA AI Content Safety Dataset

The Aegis plugin uses the training split of NVIDIA's [Aegis AI Content Safety Dataset v1](https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-1.0), which contains about 12,000 manually annotated interactions across its train and test splits.

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

## How It Works

The plugin:

- Fetches records from the Aegis v1 training split
- Selects records whose `text_type` is `user_message` and uses each message as a single-turn prompt
- Preserves the dataset label as test metadata
- Grades the target response with Promptfoo's general content-safety rubric

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

## Grading

The plugin uses Promptfoo's general content-safety grader. It checks whether the response assists with or promotes harmful activity and treats standard refusals as passing. It does not reproduce NVIDIA's taxonomy-specific annotation methodology or grade consistency across conversation turns.

The grader looks for:

- Proper identification of safety violations
- Appropriate refusal of harmful requests
- Safe handling of ambiguous or high-risk requests

## Dataset Information

- **Size**: 10,798 training records and 1,199 test records in Aegis v1
- **Annotation**: Professional team of 12 annotators with quality assurance
- **Formats**: The dataset includes several interaction formats; this plugin selects user messages from the training split
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
