---
sidebar_label: Overview
sidebar_position: 1
description: Red team LLM applications by diagnosing attack generation, connection, and grading issues to prevent security vulnerabilities and ensure robust adversarial testing
---

# Red Team Troubleshooting Guide

Common issues encountered when red teaming LLM applications with promptfoo.

| Issue                                                                             | Description                                                                                                                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Attack Generation](/docs/red-team/troubleshooting/attack-generation)             | Configuration errors in system scope, permissions, or available actions can prevent effective attack generation.            |
| [Connection Problems](/docs/red-team/troubleshooting/connecting-to-targets)       | Authentication failures, rate limiting issues, and incorrect endpoint configuration can prevent successful API connections. |
| [Data Handling](/docs/red-team/troubleshooting/data-handling)                     | What data leaves your machine during red team testing and how to configure remote generation and telemetry.                 |
| [Linking Targets](/docs/red-team/troubleshooting/linking-targets)                 | Link custom providers to cloud targets using linkedTargetId to consolidate findings and track performance over time.        |
| [False Positives](/docs/red-team/troubleshooting/grading-results)                 | Insufficient system context or misconfigured grader settings can lead to incorrect vulnerability assessments.               |
| [Inference Limits](/docs/red-team/troubleshooting/inference-limit)                | Usage limits on cloud-based inference services can restrict test case generation, attack execution, and evaluation.         |
| [Multi-Turn Sessions](/docs/red-team/troubleshooting/multi-turn-sessions)         | Session management issues can disrupt conversation context in both client and server-side implementations.                  |
| [Multiple Response Types](/docs/red-team/troubleshooting/multiple-response-types) | Response parsing errors occur when handling non-standard formats, guardrails, or error states.                              |
| [Remote Generation](/docs/red-team/troubleshooting/remote-generation)             | Corporate firewalls may block access to remote generation endpoints due to security policies around adversarial content.    |

## Related Documentation

- [Best Practices for Configuring AI Red Teaming](/docs/red-team/troubleshooting/best-practices)
- [Red Team Quickstart](/docs/red-team/quickstart/)
- [Configuration Guide](/docs/configuration/guide/)
