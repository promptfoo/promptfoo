---
sidebar_label: Posterior
description: Evaluate responses to classifier-framed prompts with a local red team strategy.
---

# Posterior

The Posterior strategy wraps the injected test variable in a fixed classifier rubric from the
[Safety Paradox paper](https://arxiv.org/abs/2606.05614). The transformation runs locally
and the originating plugin grades the response.

```yaml
redteam:
  strategies:
    - posterior
```

Use a single-input target. The report retains the original injected text and adds
`/Posterior` to the assertion metric.
