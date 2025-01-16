---
sidebar_position: 100
sidebar_label: Moderation
---

# Moderation

Use the `moderation` assert type to ensure that LLM outputs are safe.

Currently, this supports [OpenAI's moderation model](https://platform.openai.com/docs/guides/moderation) and [Meta's LlamaGuard 2 model](https://llama.meta.com/docs/model-cards-and-prompt-formats/meta-llama-guard-2/) via [Replicate](https://replicate.com/meta/meta-llama-guard-2-8b).

In general, we encourage the use of Meta's LlamaGuard as it substantially outperforms OpenAI's moderation API as well as GPT-4. [See benchmarks](https://github.com/meta-llama/PurpleLlama/blob/main/Llama-Guard2/MODEL_CARD.md#model-performance).

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
        // highlight-end
```

## Meta LlamaGuard moderation

This example uses the LlamaGuard model hosted on Replicate. Be sure to set the `REPLICATE_API_KEY` environment variable:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: moderation
        # Use the latest Llama Guard on replicate
        provider: 'replicate:moderation:meta/meta-llama-guard-2-8b:b063023ee937f28e922982abdbf97b041ffe34ad3b35a53d33e1d74bb19b36c4'
```

LlamaGuard monitors the following categories:

| Category               | Description                                                                                                      | Code |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| Violent Crimes         | Content that enables, encourages, or excuses violent crimes (e.g., terrorism, murder, child abuse, animal abuse) | S1   |
| Non-Violent Crimes     | Content that enables, encourages, or excuses non-violent crimes (e.g., fraud, burglary, drug trafficking)        | S2   |
| Sex Crimes             | Content that enables, encourages, or excuses sex crimes (e.g., human trafficking, sexual assault, harassment)    | S3   |
| Child Exploitation     | Content depicting child nudity or sexual abuse of children                                                       | S4   |
| Specialized Advice     | Content containing specialized financial, medical, or legal advice                                               | S5   |
| Privacy                | Content containing sensitive, personal information about private individuals                                     | S6   |
| Intellectual Property  | Content that violates intellectual property rights of third parties                                              | S7   |
| Indiscriminate Weapons | Content that enables the creation of weapons of mass destruction (e.g., chemical, biological, nuclear weapons)   | S8   |
| Hate                   | Content that is hateful toward people based on protected characteristics or perpetuates negative stereotypes     | S9   |
| Self-Harm              | Content that enables, encourages, or excuses acts of intentional self-harm (e.g., suicide, self-injury)          | S10  |
| Sexual Content         | Depictions of nude adults or content with erotic descriptions or explicit sex acts                               | S11  |

### Check specific categories

The assertion value allows you to only enable moderation for specific categories:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: moderation
        provider: 'replicate:moderation:meta/meta-llama-guard-2-8b:b063023ee937f28e922982abdbf97b041ffe34ad3b35a53d33e1d74bb19b36c4'
        // highlight-start
        value:
          - S1
          - S3
          - S4
        // highlight-end
```
