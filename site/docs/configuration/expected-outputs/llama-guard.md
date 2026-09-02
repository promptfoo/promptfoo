---
title: LlamaGuard Assertion
description: Classify LLM outputs for safety with Meta's LlamaGuard models through any standard chat provider, including local Ollama, Fireworks, vLLM, and Replicate.
sidebar_position: 102
sidebar_label: LlamaGuard
---

# LlamaGuard

Use the `llama-guard` assert type to classify LLM outputs with Meta's LlamaGuard models.

Unlike [`moderation`](/docs/configuration/expected-outputs/moderation), which requires a provider implementing a dedicated moderation API, `llama-guard` works with **any standard chat or completion provider** — a local Ollama install, Fireworks AI, a self-hosted vLLM deployment, or Replicate — as long as it is pointed at a LlamaGuard model. Switching endpoints needs no new provider code.

LlamaGuard replies with `safe`, or `unsafe` followed by the violated hazard-category codes (S1-S14). The `provider` field selects the model that does the classifying; the assertion parses that response identically no matter which provider produced it.

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: llama-guard
        provider: ollama:chat:llama-guard3:1b
```

If `provider` is omitted, promptfoo looks for a text-grading provider elsewhere in your config (for example `defaultTest.options.provider`). It deliberately does **not** fall back to the general-purpose grading model, because a model that isn't LlamaGuard cannot produce this output format and would silently misclassify every response.

## Local (Ollama)

Runs entirely on your machine, with no API key:

```bash
ollama pull llama-guard3:1b # or llama-guard3:8b
```

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: llama-guard
        provider: ollama:chat:llama-guard3:1b
```

## Fireworks AI

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: llama-guard
        provider: fireworks:accounts/fireworks/models/llama-guard-3-8b
```

## Self-hosted (vLLM or any OpenAI-compatible endpoint)

Point the generic `openai:chat` provider at your own deployment:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: llama-guard
        provider:
          id: openai:chat:meta-llama/Llama-Guard-3-8B
          config:
            apiBaseUrl: https://your-vllm-host/v1
```

## Replicate

Use the plain `replicate:<model>` form — **not** `replicate:moderation:<model>`. The latter routes to promptfoo's dedicated moderation-provider interface used by [`type: moderation`](/docs/configuration/expected-outputs/moderation), which returns a different response shape that this assertion does not parse.

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: llama-guard
        provider: replicate:meta/llama-guard-4-12b
```

## Categories

| Category               | Description                                                                                                      | Code |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| Violent Crimes         | Content that enables, encourages, or excuses violent crimes (e.g., terrorism, murder, child abuse, animal abuse) | S1   |
| Non-Violent Crimes     | Content that enables, encourages, or excuses non-violent crimes (e.g., fraud, burglary, drug trafficking)        | S2   |
| Sex Crimes             | Content that enables, encourages, or excuses sex crimes (e.g., human trafficking, sexual assault, harassment)    | S3   |
| Child Exploitation     | Content depicting child nudity or sexual abuse of children                                                       | S4   |
| Defamation             | Content containing defamatory statements about individuals or entities                                           | S5   |
| Specialized Advice     | Content containing specialized financial, medical, or legal advice                                               | S6   |
| Privacy                | Content containing sensitive, personal information about private individuals                                     | S7   |
| Intellectual Property  | Content that violates intellectual property rights of third parties                                              | S8   |
| Indiscriminate Weapons | Content that enables the creation of weapons of mass destruction (e.g., chemical, biological, nuclear weapons)   | S9   |
| Hate                   | Content that is hateful toward people based on protected characteristics or perpetuates negative stereotypes     | S10  |
| Self-Harm              | Content that enables, encourages, or excuses acts of intentional self-harm (e.g., suicide, self-injury)          | S11  |
| Sexual Content         | Depictions of nude adults or content with erotic descriptions or explicit sex acts                               | S12  |
| Elections              | Content containing misinformation or illegal activity related to elections                                       | S13  |
| Code Interpreter Abuse | Content that seeks to abuse code interpreters (e.g., denial of service, container escapes) - LlamaGuard 4 only   | S14  |

LlamaGuard 3 covers S1-S13. S14 was added in LlamaGuard 4.

## Check specific categories

The assertion value restricts which categories cause a failure:

```yaml
tests:
  - vars:
      foo: bar
    assert:
      - type: llama-guard
        provider: ollama:chat:llama-guard3:1b
        // highlight-start
        value:
          - S1
          - S3
          - S4
        // highlight-end
```

## Metadata

A flagged result sets `metadata.violatedCategories` to the matched codes (e.g. `["S1", "S10"]`) and `metadata.categoryDescriptions` to the code-to-name map, so downstream tooling does not need to duplicate the table above.

## Inverting

`not-llama-guard` passes when content **is** flagged unsafe — useful for red team tests that expect an unsafe output and assert the classifier caught it.
