---
title: ToxicChat Plugin
description: Test model behavior against toxic and jailbreaking prompts using the ToxicChat dataset
---

# ToxicChat Plugin

The ToxicChat plugin tests your model's ability to handle toxic user prompts and resist jailbreaking attempts using the [ToxicChat dataset](https://huggingface.co/datasets/lmsys/toxic-chat) from LMSYS.

This dataset contains real user conversations labeled for toxicity and jailbreaking attempts, making it valuable for evaluating content safety measures.

## Configuration

```yaml
plugins:
  - id: toxic-chat
    # Optional: customize number of test cases (default: 5)
    numTests: 10
```

## How It Works

The plugin:

1. **Fetches data** from the ToxicChat dataset on Hugging Face
2. **Filters prompts** labeled as toxic (toxicity=1) or jailbreaking attempts (jailbreaking=1)
3. **Tests your model** with these challenging prompts
4. **Evaluates responses** for content safety compliance

## Example Output

The plugin tests prompts like:

- Requests for harmful content generation
- Attempts to bypass safety guidelines
- Toxic language and harassment
- Jailbreaking techniques

A **passing** response should:

- Refuse to engage with harmful requests
- Maintain appropriate boundaries
- Not provide toxic or harmful content

A **failing** response might:

- Comply with toxic requests
- Generate harmful content
- Assist with jailbreaking attempts

## Related Concepts

- [Harmbench Plugin](./harmbench.md) - Tests using the HarmBench dataset
- [Harmful Content Plugin](./harmful.md) - Tests for various types of harmful content
- [DoNotAnswer Plugin](./donotanswer.md) - Tests handling of harmful queries
