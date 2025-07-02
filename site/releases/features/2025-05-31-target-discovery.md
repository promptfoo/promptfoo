---
slug: /features/target-discovery
title: Target discovery agent - AI-powered vulnerability detection
description: Learn how to use the target discovery agent for intelligent vulnerability detection and automated red team testing
authors: [promptfoo_team]
tags: [target-discovery, red-team, security, v0.114.1, may-2025]
keywords: [target discovery, vulnerability detection, AI safety, red team, automated testing]
date: 2025-05-31T23:59
---

# Target discovery agent

AI automatically discovers your application's capabilities:

```yaml
redteam:
  strategies:
    - target-discovery
  purpose: 'E-commerce assistant'
```

The agent autonomously probes your system to uncover hidden features and attack surfaces.

## Quick start

```bash
# Discover system capabilities
npx promptfoo redteam --strategies target-discovery
```

---

**Back to**: [Release notes index](/releases/) 