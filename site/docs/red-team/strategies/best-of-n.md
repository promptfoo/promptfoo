---
sidebar_label: Best-of-N
title: Best-of-N Jailbreaking Strategy
description: Generate and test text variations against a target using the Best-of-N strategy
---

# Best-of-N (BoN) Jailbreaking Strategy

Best-of-N (BoN) generates text variations of a prompt and tests them against your target. Promptfoo returns the first target response that does not produce an error, then grades that response with the configured assertion.

The strategy is inspired by [Hughes et al. (2024)](https://arxiv.org/abs/2412.03556). The paper repeatedly samples text, vision, and audio variations until a harmful response is found; Promptfoo currently generates text variations only and does not grade each candidate while selecting a response.

:::tip
The paper reports 89% ASR on GPT-4o and 78% on Claude 3.5 Sonnet with 10,000 text samples. These results use a different attempt loop and should not be read as expected Promptfoo results.
:::

Use it like so in your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
strategies:
  - id: best-of-n
    config:
      useBasicRefusal: false
      maxConcurrency: 3 # Maximum concurrent API calls (default)
      nSteps: 10000 # Candidate-generation steps (default: 5, maximum: 20000)
      maxCandidatesPerStep: 1 # Candidates generated per step (default: 1, maximum: 100)
```

## How It Works

![Diagram showing Best-of-N generating text variations, sending candidates to the target, and grading the selected response](/img/docs/best-of-n-cycle.svg)

Promptfoo's BoN strategy works in three steps:

1. **Generate variations**: Creates text candidates using random capitalization, character scrambling, and ASCII noising.

2. **Test candidates**: Sends candidates to the target with the configured concurrency limit.

3. **Grade the selected response**: Returns the first response without a target error and applies the configured assertion. A normal refusal is still a valid response and stops candidate selection.

Small input changes can still produce different target behavior, so review the final assertion result before interpreting the test.

## Configuration Parameters

### useBasicRefusal

**Type:** `boolean`  
**Default:** `false`

When enabled, replaces the final LLM-as-a-judge assertion with a simple refusal check. This lowers grading cost, but it does not make BoN continue testing candidates after a refusal.

Use this option when the expected safe response is a clear refusal and a lightweight final check is sufficient.

### maxConcurrency

**Type:** `number`  
**Default:** `3`

Maximum number of prompt variations to test simultaneously. Higher values increase throughput. We recommend setting this as high as your rate limits allow.

### nSteps

**Type:** `number`  
**Default:** `5`

Number of candidate-generation steps. Each step generates `maxCandidatesPerStep` variations. The hosted service accepts up to `20000` steps. Generating more candidates does not guarantee that the target will receive them, because selection stops after the first response without an error.

### maxCandidatesPerStep

**Type:** `number`  
**Default:** `1`

Number of text variations generated per step. The hosted service accepts up to `100` candidates per step. Higher values increase the candidate pool, but concurrent calls already in progress may still complete after a response is selected.

Start with `1`. A larger candidate pool is useful only when earlier target calls return errors, because a normal response stops selection.

:::tip
Start with `useBasicRefusal: true` and low candidate counts to confirm that the target accepts the transformed input and that the final grade matches expectations.
:::

## Performance

The original BoN paper reports the following research results:

- Text: 89% on GPT-4o and 78% on Claude 3.5 Sonnet with 10,000 samples
- Vision and audio: the paper also demonstrates attacks against GPT-4o vision and Gemini 1.5 Pro audio using modality-specific augmentations

The paper finds that attack success rate improves as more variations are tested. This illustrates why [ASR comparisons must account for attempt budget](/blog/asr-not-portable-metric). Promptfoo does not currently reproduce the paper's per-candidate harm-classification loop.

## Key Features

- **Simple Implementation**: No need for gradients or model internals
- **Text Variations**: Applies capitalization, scrambling, and ASCII-noise augmentations
- **Highly Parallelizable**: Can test multiple variations concurrently
- **Hosted Generation**: Requires remote generation for candidate creation

## Related Concepts

- [GOAT Strategy](goat.md)
- [Meta-Agent Jailbreaks](meta.md)
- [Multi-turn Jailbreaks](multi-turn.md)
- [Best of N configuration example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-bestOfN-strategy)
- [Red Team Strategies](/docs/red-team/strategies/) - Full strategy catalog
