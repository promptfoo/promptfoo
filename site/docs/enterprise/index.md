---
sidebar_label: Overview
title: Promptfoo Enterprise - Secure LLM Application Testing
description: Learn about Promptfoo's hosted cloud service and on-premises solutions for LLM security testing
keywords:
  [
    promptfoo enterprise,
    promptfoo enterprise on-prem,
    llm security,
    llm testing,
    llm red teaming,
    llm scanning,
  ]
---

# Promptfoo Enterprise

Promptfoo offers two deployment options to meet your security needs:

**Promptfoo Enterprise** is our hosted SaaS solution that lets you securely scan your LLM applications without managing infrastructure.

**Promptfoo Enterprise On-Prem** is our on-premises solution that includes a dedicated runner for deployments behind your firewall.

Both solutions offer a suite of tools to help you secure your LLM applications, including:

- Robust RBAC controls to manage multiple users and teams
- Teams-based configurability for customizing targets, plugins, and scan configurations
- Detailed reporting and analytics to monitor the security of your LLM applications
- Remediation suggestions to help you fix vulnerabilities
- Advanced filtering to find and sort through evals
- Sharing and exporting functions to integrate Promptfoo with your existing tools

Our platform works with any LLM application, agent, or foundation model that is live and ready for inference.

![Promptfoo Dashboard (Enterprise interface shown)](/img/enterprise-docs/promptfoo-dashboard.png)

## Deployment Options

We offer two deployment models:

- **Promptfoo Enterprise**: Our fully-managed SaaS solution maintained by Promptfoo, allowing you to get started immediately with no infrastructure requirements.

- **Promptfoo Enterprise On-Prem**: Our self-hosted solution that can be deployed on any cloud provider, including AWS, Azure, and GCP. Includes a dedicated runner component for executing scans within your network perimeter.

![Basic red team architecture](/img/docs/red-team-basic-architecture.png)

## Product Comparison

| Feature                                             | Community                       | Promptfoo Enterprise                         | Promptfoo Enterprise On-Prem                 |
| --------------------------------------------------- | ------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Deployment                                          | Command line tool               | Fully-managed SaaS                           | Self-hosted, on-premises                     |
| Infrastructure                                      | Local                           | Managed by Promptfoo                         | Managed by your team                         |
| Dedicated Runner                                    | ❌                              | ❌                                           | ✅                                           |
| Network Isolation                                   | ❌                              | ❌                                           | ✅                                           |
| Model & Application Evals                           | ✅                              | ✅                                           | ✅                                           |
| Vulnerability Detection                             | ✅                              | ✅                                           | ✅                                           |
| Red Teaming                                         | <span title="Limited">⚠️</span> | ✅                                           | ✅                                           |
| Remediations                                        | <span title="Limited">⚠️</span> | ✅                                           | ✅                                           |
| Result Sharing                                      | <span title="Limited">⚠️</span> | ✅                                           | ✅                                           |
| API Access                                          | <span title="Limited">⚠️</span> | [✅](/docs/api-reference)                    | [✅](/docs/api-reference)                    |
| Team Management                                     | ❌                              | ✅                                           | ✅                                           |
| RBAC                                                | ❌                              | ✅                                           | ✅                                           |
| External Integrations (SIEMs, Issue trackers, etc.) | ❌                              | ✅                                           | ✅                                           |
| SLA                                                 | ❌                              | ✅                                           | ✅                                           |
| Support                                             | Community Chat + Github Issues  | Full Professional Services + Dedicated Slack | Full Professional Services + Dedicated Slack |

<p>
<small>⚠️ indicates limited quantity in Community version. [Contact us](/contact/) for more information.</small>
</p>

Both Enterprise products support [sharing results](/docs/usage/sharing) through shareable URLs, with privacy controls that match your deployment model. Enterprise users can share within their organization, while Enterprise On-Prem users can configure self-hosted sharing for complete control over data.

## Connection with Open-Source

Both Promptfoo Enterprise and Promptfoo Enterprise On-Prem are fully compatible with the open-source version of Promptfoo. This means that you can use your existing open-source Promptfoo results with either solution.

## Learn more

If you are interested in learning more about Promptfoo Enterprise, please [contact us](/contact/).
