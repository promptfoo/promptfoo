---
sidebar_position: 10
sidebar_label: Target Discovery
title: Target Discovery Agent
---

# Target Discovery

Promptfoo's **Target Discovery Agent** automatically extracts useful information about generative AI systems that you want to red team. This information is used to craft adversarial inputs that are unique to the target system, improving attack efficacy and response evaluation quality.

## Usage

Target discovery runs automatically during [red team scans](/docs/red-team/quickstart#run-the-scan) and [adversarial test case generation](/docs/guides/llm-redteaming/#step-3-generate-adversarial-test-cases). The discovered information is written to the [`redteam.purpose`](/docs/red-team/configuration/#purpose) field of the outputted `redteam.yaml`.

### Preview

Alternatively, you can preview the scan report of a [previously configured target](/docs/red-team/configuration); run:

```sh
npx promptfoo@latest redteam discover
```
