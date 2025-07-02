---
slug: /features/off-topic-plugin
title: Off-topic plugin - Focus validation for AI systems
description: Learn how to use the off-topic plugin to detect when AI strays from intended purpose
authors: [promptfoo_team]
tags: [off-topic-plugin, red-team, security, focus-validation, v0.114.0, may-2025]
keywords: [off-topic plugin, focus validation, AI purpose, red team, security testing]
date: 2025-05-31T23:59
---

# Off-topic plugin

Detects when AI strays from intended purpose:

```yaml
redteam:
  plugins:
    - off-topic
  purpose: 'Financial advisor chatbot'
```

## Quick start

```bash
# Check for off-topic responses
npx promptfoo redteam --plugins off-topic
```

---

**Back to**: [Release notes index](/releases/) 