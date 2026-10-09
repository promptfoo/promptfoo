---
sidebar_label: Running Red Teams
sidebar_position: 40
title: Running Red Teams in Promptfoo Enterprise
description: Configure enterprise-grade red team assessments with custom plugins, scheduling, and compliance reporting for production LLMs
keywords:
  [red teams, red teaming, llm security testing, adversarial attacks, llm vulnerability scanning]
---

# Running Red Teams

[Promptfoo Enterprise](/docs/enterprise/) allows you to configure targets, plugin collections, and scan configurations that can be shared among your team.

## Connecting to Promptfoo

When using Promptfoo-hosted services, your browser and CLI need access to the relevant `*.promptfoo.app` endpoints. If you use a proxy or VPN, see [remote generation troubleshooting](/docs/red-team/troubleshooting/remote-generation/) for connectivity checks.

On-prem deployments use your organization's app, API, and authentication URLs. The scan runner must reach the target and the configured inference providers. Access to Promptfoo-hosted generation is needed only when your deployment is configured to use it.

## Creating Targets

Targets are the LLM entities that are being tested. They can be a web application, agent, foundation model, or any other LLM entity. When you create a target, this target can be accessed by other users in your team to run scans.

You can create a target by navigating to the "Targets" tab and clicking "Create Target".

The "General Settings" section is where you identify the type of target you are testing and provide the technical details to connect to the target, pass probes, and parse responses.

The "Context" section is where you provide any additional information about the target that will help Promptfoo generate adversarial probes. This is where you provide context about the target's primary objective and any rules it should follow, as well as what type of user the red team should impersonate.

The more information you provide, the better the red team attacks and grading will be.

### Accessing External Systems

If your target has RAG orchestration or is an agent, you can select the "Accessing External Systems" option to provide additional details about the target's connection to external systems. Providing additional context about the target's access to external systems will help Promptfoo generate more accurate red team attacks and grading.

If your target is an agent, you can provide additional context about the agent's access to tools and functions in the question "What external systems are connected to this application?" This will help Promptfoo ascertain whether it was able to successfully enumerate tools and functions when running the [tool discovery plugin](/docs/red-team/plugins/tool-discovery/).

## Creating Plugin Collections

You can create plugin collections to share among your team. These plugin collections allow you to create specific presets to run tests against your targets, including establishing custom policies and prompts.

To create a plugin collection, navigate to the "Plugin Collections" tab under the "Red team" navigation header and click "Create Plugin Collection".

![Creating a new plugin collection](/img/enterprise-docs/create-plugin-collection.gif)

## Configuring Scans

When you want to run a new red team scan, navigate to the "Red team" navigation header and click on "Scan Configurations". You will see a list of all the scan configurations that your team has created. Click on "New Scan" to create a new scan.

![Create Scan Configuration interface](/img/enterprise-docs/create-scan.png)

If you have already created a scan configuration from the open-source version of Promptfoo or local usage, you can import the YAML file to use it in Promptfoo Enterprise.

Click on "Create Scan" to configure a new scan. You will then be prompted to select a target. Alternatively, you can create a new target.

![Select Target screen](/img/enterprise-docs/select-target.png)

Once you have selected a target, you will be prompted to select a plugin collection. If you do not have a plugin collection, you can create a new one.

![Select Plugin Collection screen](/img/enterprise-docs/choose-plugins.png)

Once you have selected a plugin collection, you will be prompted to select the strategies. [Promptfoo strategies](/docs/red-team/strategies/) are the ways in which adversarial probes are delivered to maximize attack success rates.

![Select Strategies screen](/img/enterprise-docs/select-strategies.png)

## Running a Scan

Save your scan configuration, then select **Run Scan From Template** in its **Review** section. Choose the target and review the run settings.

If server-side execution is enabled and the target supports it, select **Server**, then **Run scan**. The scan executes on your deployment's runner. Follow its status, probe progress, and logs in **Run History** or the target's run history. On-prem scans need a configured Red Team Provider; if setup is missing, the run screen links to the relevant provider settings.

To stop a running server scan, open its details and select **Stop**. With permission to update jobs, you can choose **Cancel Run** to stop without publishing, or **Publish Partial Report** to publish the completed probes. Partial reports require at least one completed probe and do not represent a completed scan. Open the available results with **View Report** or **View Partial Report**.

To execute from your machine, select **CLI** and use the generated command, or download the YAML configuration. [Authenticate](./authentication.md) to the correct deployment and team before running the command.

![CLI command and YAML download controls](/img/enterprise-docs/run-scan.png)

When you enter the command into your terminal, Promptfoo will generate the adversarial probes and write the test cases locally.

![Running scan in CLI](/img/enterprise-docs/run-scan-cli.png)

Once generated, Promptfoo executes the test cases against your target. When sharing is enabled, it uploads the results to your configured Promptfoo Enterprise instance. Review them through the report link in the terminal or the Enterprise UI; see [Findings and Reports](./findings.md).

## See Also

- [Findings and Reports](./findings.md)
- [Authentication](./authentication.md)
- [Service Accounts](./service-accounts.md)
