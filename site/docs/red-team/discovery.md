---
sidebar_position: 10
sidebar_label: Target Discovery
title: Target Discovery Agent
---

# Target Discovery

Promptfoo's **Target Discovery Agent** automatically extracts useful information about generative AI systems that you want to red team. This information is used to craft adversarial inputs that are unique to the target system, improving attack efficacy and response evaluation quality.

## Usage

Use the command `promptfoo redteam discover` with either a configuration file or a cloud target. [More info](/docs/usage/command-line#promptfoo-redteam-discover)

### Preview

Alternatively, you can preview the scan report of a [previously configured target](/docs/red-team/configuration); run:

```sh
npx promptfoo@latest redteam discover
```
