---
sidebar_label: Best-of-N
title: Best-of-N Jailbreaking Strategy
description: Generate text variations with the Best-of-N strategy, configure candidate limits, and understand how target responses affect selection and final grading.
---

# Best-of-N (BoN) Jailbreaking Strategy

Best-of-N (BoN) generates text variations of a prompt and tests them against your target. Promptfoo stops scheduling candidates after a target response without an error. Requests already in flight can still finish; one successful response is then graded with the configured assertion.

The strategy is inspired by [Hughes et al. (2024)](https://arxiv.org/abs/2412.03556). The paper repeatedly samples text, vision, and audio variations until a harmful response is found; Promptfoo currently generates text variations only and does not grade each candidate while selecting a response.

Use it like so in your `promptfooconfig.yaml`:

```yaml
strategies:
  - id: best-of-n
    config:
      useBasicRefusal: false
      maxConcurrency: 3 # Maximum concurrent API calls (default)
      nSteps: 5 # Candidate-generation steps to request
      maxCandidatesPerStep: 1 # Candidates to request per step
```

## How It Works

![Best-of-N flow showing candidate generation, target errors, grading, and both stop conditions](/img/docs/best-of-n-cycle.svg)

Promptfoo's BoN strategy works in three steps:

1. **Generate variations**: Creates text candidates using random capitalization, character scrambling, and ASCII noising.

2. **Test candidates**: Sends candidates to the target with the configured concurrency limit.

3. **Grade the selected response**: Applies the configured assertion to a successful response after the target calls finish. A normal refusal is still a valid response and stops further candidate scheduling.

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
**Default:** Set by the hosted service

Number of candidate-generation steps to request. Promptfoo stops scheduling target requests after a response without an error, even if more candidates are available.

### maxCandidatesPerStep

**Type:** `number`  
**Default:** Set by the hosted service

Maximum number of text variations to request per step.

Start with `1`. A larger pool mainly affects error retries and requests already running when a normal response stops further scheduling.

:::tip
For initial testing, we recommend starting with `useBasicRefusal: true` and relatively low values for `nSteps` and `maxCandidatesPerStep`. Increase these limits after checking the results and API cost.
:::

## Performance

The paper's reported success rates are not benchmarks for this implementation. Promptfoo uses a different candidate loop and grades the selected response after scheduling stops. Compare results only when the target, test cases, attempt budget, and grading procedure match.

## Key Features

The strategy uses text variations and concurrent target requests. Candidate generation requires the hosted service; it does not require gradients or access to model internals.

## Related Concepts

- [GOAT Strategy](goat.md)
- [Meta-Agent Jailbreaks](meta.md)
- [Multi-turn Jailbreaks](multi-turn.md)
- [Best of N configuration example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-bestOfN-strategy)
- [Red Team Strategies](/docs/red-team/strategies/) - Full strategy catalog
