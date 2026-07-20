---
sidebar_label: Iterative Jailbreaks (Deprecated)
title: Iterative Jailbreaks Strategy (Deprecated)
description: Migrate the deprecated jailbreak strategy to jailbreak:meta for adaptive single-turn red team attacks
---

import { Redirect } from '@docusaurus/router';

<Redirect to="/docs/red-team/strategies/meta/" />

# Iterative Jailbreaks Strategy

:::warning Deprecated
The top-level `jailbreak` strategy is deprecated. It now runs [`jailbreak:meta`](/docs/red-team/strategies/meta/) for backward compatibility.

**Migration:** Replace `jailbreak` with `jailbreak:meta` in your configuration.
:::

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - jailbreak:meta
```

See [Meta-Agent Jailbreaks](/docs/red-team/strategies/meta/) for configuration and behavior details.
