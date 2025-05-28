---
sidebar_position: 10
sidebar_label: Target Scanning Agent
title: Target Scanning Agent (TSA)
---

# Target Scanning Agent (TSA)

Promptfoo's **Target Scanning Agent** (aka "TSA") automatically discovers useful information about generative AI systems that you want to red team. Promptfoo's red team scanner uses this information to craft adversarial inputs that are unique to the target system's ontology, improving attack efficacy and response evaluation quality.

## Usage

TSA runs automatically during [red team scans](/docs/red-team/quickstart#run-the-scan) and [adversarial test case generation](/docs/guides/llm-redteaming/#step-3-generate-adversarial-test-cases). The discovered information is written to the [`redteam.purpose`](/docs/red-team/configuration/#purpose) field of the outputted `redteam.yaml`.

### Preview

Alternatively, you can preview the scan report of a [previously configured target](/docs/red-team/configuration); run:

```sh
npx promptfoo@latest redteam target-scan
```
