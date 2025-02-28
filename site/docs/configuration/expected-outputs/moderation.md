---
sidebar_position: 100
sidebar_label: Moderation
---

# Moderation

Use the `moderation` assert type to ensure that LLM outputs are safe and comply with content policies.

Currently, this supports [OpenAI's moderation models](https://platform.openai.com/docs/guides/moderation) (including multi-modal moderation) and [Meta's LlamaGuard 3 model](https://www.llama.com/docs/model-cards-and-prompt-formats/llama-guard-3/) via [Replicate](https://replicate.com/meta/llama-guard-3).

In general, we encourage the use of Meta's LlamaGuard as it substantially outperforms OpenAI's moderation API as well as GPT-4. [See benchmarks](https://github.com/meta-llama/PurpleLlama/blob/main/Llama-Guard3/MODEL_CARD.md#model-performance).

## Provider Selection Logic

The moderation assertion follows this selection logic:

1. **OpenAI's moderation API** is used by default if `OPENAI_API_KEY` is set
2. **LlamaGuard via Replicate** is used if `REPLICATE_API_KEY` is set and `OPENAI_API_KEY` is not set

Note that OpenAI is the default moderation provider even when other providers (like Anthropic or Google) are used for completions. To use a specific moderation provider, explicitly specify it with the `provider` parameter.

## OpenAI moderation

By default, the `moderation` assertion uses OpenAI. Just make sure that the `OPENAI_API_KEY` environment variable is set:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      # Ensure that it passes OpenAI's moderation filters
      - type: moderation
```

When content violates moderation policies, you'll see a failure message like:

```
[FAIL] Moderation flags detected: hate, violence, sexual
```

### OpenAI Moderation Models

OpenAI offers several moderation models with different capabilities:

| Model ID                   | Capabilities    | Description                            |
| -------------------------- | --------------- | -------------------------------------- |
| omni-moderation-latest     | Text and images | Latest multi-modal model (recommended) |
| omni-moderation-2024-09-26 | Text and images | Fixed version of multi-modal model     |
| text-moderation-latest     | Text only       | Latest text-only model                 |
| text-moderation-stable     | Text only       | Stable text-only model                 |
| text-moderation-007        | Text only       | Legacy text-only model                 |

To specify a particular model:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: moderation
        provider: 'openai:moderation:omni-moderation-latest'
```

### Moderation Categories

OpenAI monitors the following categories:

| Category               | Description                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| hate                   | Content that promotes hate based on race, gender, ethnicity, religion, nationality, sexual orientation, disability, or caste. Hateful content aimed at non-protected groups is harassment. |
| hate/threatening       | Hateful content that includes violence or serious harm towards the targeted group.                                                                                                         |
| harassment             | Content that promotes harassing language towards any target.                                                                                                                               |
| harassment/threatening | Harassment content that includes violence or serious harm towards any target.                                                                                                              |
| self-harm              | Content that promotes or depicts acts of self-harm, such as suicide, cutting, and eating disorders.                                                                                        |
| self-harm/intent       | Content where the speaker expresses intent to engage in self-harm.                                                                                                                         |
| self-harm/instructions | Content that encourages or gives instructions on how to commit acts of self-harm.                                                                                                          |
| sexual                 | Content meant to arouse sexual excitement or promote sexual services (excluding sex education and wellness).                                                                               |
| sexual/minors          | Sexual content involving individuals under 18 years old.                                                                                                                                   |
| violence               | Content that depicts death, violence, or physical injury.                                                                                                                                  |
| violence/graphic       | Content that depicts death, violence, or physical injury in graphic detail.                                                                                                                |
| illicit                | Content that promotes, encourages, or depicts regulated or illegal products, services, or activities.                                                                                      |
| illicit/violent        | Illicit content containing direct threats, planning, or explicit promotion of violence.                                                                                                    |

### Check specific categories

The assertion value allows you to only enable moderation for specific categories:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: moderation
        // highlight-start
        value:
          - harassment
          - harassment/threatening
          - sexual
          - sexual/minors
```

## Meta LlamaGuard 3 moderation

This example uses the LlamaGuard 3 model hosted on Replicate. Be sure to set the `REPLICATE_API_KEY` environment variable:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: moderation
        # Use LlamaGuard 3 on Replicate
        provider: 'replicate:moderation:meta/llama-guard-3:df0439c75a2057d4948d8b0cb9ffd379dccc422532f57b5aed50eac15c48fa49'
```

When content violates moderation policies, you'll see a failure message like:

```
[FAIL] Moderation flags detected: S1, S9, S11
```

### LlamaGuard 3 Categories

LlamaGuard 3 monitors the following categories:

| Category                            | Description                                                                | Code |
| ----------------------------------- | -------------------------------------------------------------------------- | ---- |
| Violent Crimes                      | Content that enables, encourages, or excuses violent crimes                | S1   |
| Non-Violent Crimes                  | Content that enables, encourages, or excuses non-violent crimes            | S2   |
| Sex Crimes                          | Content that enables, encourages, or excuses sex crimes                    | S3   |
| Child Exploitation                  | Content depicting child nudity or sexual abuse of children                 | S4   |
| Specialized Advice                  | Content containing unauthorized specialized advice                         | S5   |
| Privacy                             | Content containing sensitive, personal information about individuals       | S6   |
| Intellectual Property               | Content that violates intellectual property rights                         | S7   |
| Indiscriminate Weapons              | Content that enables the creation of weapons of mass destruction           | S8   |
| Hate                                | Content that is hateful toward people based on protected characteristics   | S9   |
| Self-Harm                           | Content that enables, encourages, or excuses acts of intentional self-harm | S10  |
| Sexual Content                      | Depictions of nude adults or explicit sexual content                       | S11  |
| Distribution of Dangerous Materials | Content that facilitates distribution of restricted materials              | S12  |
| Malware                             | Content that guides development, operation, or use of malware              | S13  |

### Check specific categories

The assertion value allows you to only enable moderation for specific categories:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: moderation
        // highlight-start
        provider: 'replicate:moderation:meta/llama-guard-3:df0439c75a2057d4948d8b0cb9ffd379dccc422532f57b5aed50eac15c48fa49'
        value:
          - S1
          - S3
          - S4
        // highlight-end
```
