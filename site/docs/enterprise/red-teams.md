---
sidebar_label: Running Red Teams
sidebar_position: 40
title: Running Red Teams in Promptfoo Enterprise
description: Configure enterprise-grade red team assessments with custom plugins, scheduling, and compliance reporting for production LLMs
keywords:
  [red teams, red teaming, llm security testing, adversarial attacks, llm vulnerability scanning]
---

# Running Red Teams

[Promptfoo Enterprise](/docs/enterprise/) lets your team share targets, plugin collections, and scan templates.

## Connecting to Promptfoo

When using Promptfoo-hosted services, your browser and CLI need access to the relevant `*.promptfoo.app` endpoints. If you use a proxy or VPN, see [remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/) for connectivity checks.

On-prem deployments use your organization's app, API, and authentication URLs. The scan runner must reach the target and the configured inference providers. Access to Promptfoo-hosted generation is needed only when your deployment is configured to use it.

## Creating Targets

Targets are the applications, agents, or models you test. Team members can reuse a target across scans.

Create a target and configure its connection and response parsing. Describe what the application does, its rules, and which users should have access to which resources. These details guide test generation and grading.

### Accessing External Systems

For RAG applications and agents, describe the connected data sources and tools and their access restrictions. Include tool names and capabilities when using the [tool discovery plugin](/docs/red-team/plugins/tool-discovery/).

## Creating Plugin Collections

Create a plugin collection to reuse a set of security tests, custom policies, and prompts across your team's scans.

## Configuring Scans

Navigation and button labels vary by release. In the scan template list, create a template or import an existing Promptfoo YAML configuration. Select plugins or a collection, choose [strategies](/docs/red-team/strategies/), and save the template.

## Running a Scan

Start a run from the saved template and choose the target. Check the inference providers and credentials for generation and grading. When you run an organization-wide template against another team's target, the report belongs to the **target's team**.

### Run on the server

If your deployment and target support server execution, choose the server option and start the scan. Open the run in scan history to check progress, view logs, or open the report.

With permission to update jobs, you can stop the run and cancel without publishing. Once at least one probe completes, you can also stop and publish a partial report containing only the completed probes.

For programmatic runs, see **Jobs** in the [API reference](/docs/api-reference/). On-prem, use `/static/openapi.json` from your API host for the operations supported by your release.

### Run locally

[Authenticate](./authentication.md) to your deployment, then run the generated CLI command. For saved configurations, the report goes to the team assigned to the run, even if your [current CLI team](./authentication.md#checking-current-team) is different. The same target team rule applies to cross-team runs.

You can also export the YAML file and run `promptfoo redteam run -c promptfooconfig.yaml`. When sharing is enabled, open the report link in the terminal or find the results in the Enterprise UI. See [Findings and Reports](./findings.md).

## See Also

- [Findings and Reports](./findings.md)
- [Authentication](./authentication.md)
- [Service Accounts](./service-accounts.md)
