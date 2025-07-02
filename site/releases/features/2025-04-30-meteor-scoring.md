---
slug: /features/meteor-scoring
title: METEOR scoring - Advanced text evaluation metrics
description: Learn how to use METEOR scoring for advanced text similarity evaluation beyond simple string matching
authors: [promptfoo_team]
tags: [meteor-scoring, evaluation-metrics, text-similarity, v0.112.0, april-2025]
keywords: [METEOR scoring, text evaluation, similarity metrics, advanced evaluation]
date: 2025-04-30T23:59
---

# METEOR scoring

Advanced text similarity metric beyond simple string matching:

```yaml
assert:
  - type: llm-rubric
    provider: openai:gpt-4.1
    rubric: meteor
    threshold: 0.9
```

## Quick start

```bash
# Test with new models
npx promptfoo eval --provider openai:gpt-4.1,openai:o4-mini
```

---

**Back to**: [Release notes index](/releases/) 