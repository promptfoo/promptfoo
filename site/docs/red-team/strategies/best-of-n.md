---
sidebar_label: Best-of-N
---

# Best-of-N (BoN) Jailbreaking Strategy

Best-of-N (BoN) is a simple but effective black-box jailbreaking algorithm that works by repeatedly sampling variations of a prompt with modality-specific augmentations until a harmful response is elicited.

Introduced by [Hughes et al. (2024)](https://arxiv.org/abs/2412.03556), it achieves high attack success rates across text, vision, and audio modalities.

:::tip
While this technique achieves high attack success rates - 89% on GPT-4o and 78% on Claude 3.5 Sonnet - it generally requires a very large number of samples to achieve this.
:::

Use it like so in your `promptfooconfig.yaml`:

```yaml
strategies:
  - id: best-of-n
    config:
      useBasicRefusal: false
      maxConcurrency: 5 # Maximum concurrent API calls (default)
      nSteps: 10000 # Maximum number of attempts (optional)
      maxCandidatesPerStep: 1 # Maximum candidates per batch (optional)
```

## How It Works

![BoN Overview](/img/docs/best-of-n-cycle.svg)

BoN Jailbreaking works through a simple three-step process:

1. **Generate Variations**: Creates multiple versions of the input prompt using modality-specific augmentations:

   - Text: Random capitalization, character scrambling, character noising
   - Vision: Font variations, background colors, text positioning
   - Audio: Speed, pitch, volume, background noise modifications

2. **Concurrent Testing**: Tests multiple variations simultaneously against the target model

3. **Success Detection**: Monitors responses until a harmful output is detected or the maximum attempts are reached

The strategy's effectiveness comes from exploiting the stochastic nature of LLM outputs and their sensitivity to small input variations.

## Configuration Parameters

### useBasicRefusal

**Type:** `boolean`  
**Default:** `false`

When enabled, uses a simple refusal check instead of LLM-as-a-judge assertions. This is much faster and cheaper than using an LLM judge, making it ideal for testing when the typical response of an LLM to a prompt is a refusal.

We recommend using this setting whenever possible if the default response to your original prompts is a "Sorry, I can't do that"-style refusal.

### maxConcurrency

**Type:** `number`  
**Default:** `5`

Maximum number of prompt variations to test simultaneously. Higher values increase throughput. We recommend setting this as high as your rate limits allow.

### nSteps

**Type:** `number`  
**Default:** `undefined`

Maximum number of total attempts before giving up. Each step generates `maxCandidatesPerStep` variations. Higher values increase success rate but also cost. The original paper achieved best results with 10,000 steps.

### maxCandidatesPerStep

**Type:** `number`  
**Default:** `1`

Number of prompt variations to generate in each batch. Lower values provide more fine-grained control, while higher values are more efficient but may waste API calls if a successful variation is found early in the batch.

Usually best to set this to `1` and increase `nSteps` until you get a successful jailbreak.

:::tip
For initial testing, we recommend starting with `useBasicRefusal: true` and relatively low values for `nSteps` and `maxCandidatesPerStep`. This allows you to quickly validate the strategy's effectiveness for your use case before scaling up to more comprehensive testing.
:::

## Performance

BoN achieves impressive attack success rates across different models and modalities:

- Text: 89% on GPT-4, 78% on Claude 3.5 Sonnet (10,000 samples)
- Vision: 56% on GPT-4 Vision
- Audio: 72% on GPT-4 Audio

The attack success rate follows a power-law scaling with the number of samples, meaning it reliably improves as more variations are tested.

## Key Features

- **Simple Implementation**: No need for gradients or model internals
- **Multi-modal Support**: Works across text, vision, and audio inputs
- **Highly Parallelizable**: Can test multiple variations concurrently
- **Predictable Scaling**: Success rate follows power-law behavior

## Related Concepts

- [GOAT Strategy](goat.md)
- [Iterative Jailbreaks](iterative.md)
- [Multi-turn Jailbreaks](multi-turn.md)
- [Best of N configuration example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-bestOfN-strategy)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
