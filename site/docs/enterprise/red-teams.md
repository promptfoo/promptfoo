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

Create a target from **Targets**.

The **Configuration** section contains the connection details for sending probes to the target and parsing responses.

Use **Application Details** to describe the target's capabilities, rules, and access permissions. Use **Context** for test scenarios, conversation handling, and user personas. These details guide attack generation and grading.

### Accessing External Systems

For RAG applications and agents, describe connected data sources and tools in **Application Details → Access & Permissions**, including what the target may access and what it must not access. Include tool names and capabilities when using the [tool discovery plugin](/docs/red-team/plugins/tool-discovery/).

## Creating Plugin Collections

Plugin collections group security tests, custom policies, and prompts for reuse across your team's scans.

Open **Policies → Plugin Collections** to create a collection and choose its plugins.

## Configuring Scans

Open **Red Team → Scan Templates** and click **Create Scan Template**. Choose **New Scan Template** and enter a name, or select **Upload YAML** to import an existing Promptfoo configuration.

Configure the **Plugins** and **Strategies** tabs, then check **Review** and save the template. [Strategies](/docs/red-team/strategies/) determine how adversarial probes are delivered. Select the target when you run the template.

## Running a Scan

Save your scan template, then select **Scan Now** in its **Review** section. Choose the target, confirm the selected scan template, and review the run options.

If server-side execution is enabled and the target supports it, select **Run on Server**, then **Run Red Team Scan**. The scan executes on your deployment's runner. Before starting, verify that generation and grading use the intended inference providers and credentials.

Follow the scan's status, probe progress, and logs in **Scan History** or the target's run history.

To stop a running server scan, open its details and select **Stop**. With permission to update jobs, you can choose **Cancel Scan** to stop without publishing, or **Publish Partial Report** to publish the completed probes. Partial reports require at least one completed probe and do not represent a completed scan. Open the available results with **View Report** or **View Partial Report**.

For programmatic runs, the **Jobs** section of the [API reference](/docs/api-reference/) documents **Start job**, **Get job**, **Stream job logs**, and **Stop job**, including the request fields for canceling a run or publishing a partial report.

To execute from your machine, select **Run via CLI** and use the generated command, or use **Export Config** to download the YAML configuration. [Authenticate](./authentication.md) to the correct deployment before running the command. Commands referencing a saved scan configuration retain that configuration's team; see [CLI team selection](./authentication.md#checking-current-team).

`promptfoo redteam run` generates adversarial probes and runs them against your target. When sharing is enabled, it uploads the results to your configured Promptfoo Enterprise instance. Review them through the report link in the terminal or the Enterprise UI; see [Findings and Reports](./findings.md).

## See Also

- [Findings and Reports](./findings.md)
- [Authentication](./authentication.md)
- [Service Accounts](./service-accounts.md)
