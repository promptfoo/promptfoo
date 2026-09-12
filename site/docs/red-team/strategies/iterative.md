---
sidebar_label: Iterative Jailbreaks (Deprecated)
title: Iterative Jailbreaks Strategy (Deprecated)
description: Migrate the deprecated jailbreak strategy to jailbreak:meta for adaptive single-turn red team attacks, including config changes and alternative strategies.
---

# Iterative Jailbreaks Strategy

<a id="how-it-works"></a><a id="session-management"></a><a id="example-scenario"></a><a id="importance-in-gen-ai-red-teaming"></a><a id="implementation"></a><a id="related-concepts"></a>

:::warning Deprecated
The top-level `jailbreak` strategy is deprecated. It now runs [`jailbreak:meta`](/docs/red-team/strategies/meta/) for backward compatibility.

**Migration:** Replace `jailbreak` with `jailbreak:meta` in your configuration.
:::

```yaml
redteam:
  strategies:
    - jailbreak:meta
```

See [Meta-Agent Jailbreaks](/docs/red-team/strategies/meta/) for configuration and behavior details.
