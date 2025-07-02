---
slug: /features/donotanswer-plugin
title: DoNotAnswer plugin - AI safety and refusal testing
description: Learn how to use the DoNotAnswer plugin to test inappropriate content handling in AI systems
authors: [promptfoo_team]
tags: [donotanswer-plugin, ai-safety, refusal-testing, v0.112.0, april-2025]
keywords: [DoNotAnswer plugin, AI safety, refusal testing, inappropriate content]
date: 2025-04-30T23:59
---

# DoNotAnswer plugin

Tests inappropriate content handling:

```yaml
redteam:
  plugins:
    - donotanswer
  purpose: 'Customer service chatbot'
```

## Quick start

```bash
# Run security tests
npx promptfoo redteam --plugins donotanswer,xstest
```

---

**Back to**: [Release notes index](/releases/) 