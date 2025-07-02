---
slug: /features/jsonl-support
title: JSONL support - Large-scale evaluations
description: Learn how to use JSONL support for native large-scale evaluations with streaming and memory efficiency
authors: [promptfoo_team]
tags: [jsonl-support, large-scale, streaming, v0.107.0, march-2025]
keywords: [JSONL, large scale, streaming, memory efficient, evaluations]
date: 2025-03-31T23:59
---

# JSONL support

Native support for large-scale evaluations:

- Stream thousands of test cases
- Automatic chunking and progress tracking
- Memory-efficient processing

## Quick start

```bash
# Stream JSONL test cases
npx promptfoo eval -c config.yaml --tests large-dataset.jsonl
```

---

**Back to**: [Release notes index](/releases/) 