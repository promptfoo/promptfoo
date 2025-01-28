---
sidebar_label: Overview
sidebar_position: 1
---

# Red Team Troubleshooting Guide

Common issues encountered when red teaming LLM applications with promptfoo.

| Issue                                                                             | Description                                                                                                                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Attack Generation](/docs/red-team/troubleshooting/attack-generation)             | Configuration errors in system scope, permissions, or available actions can prevent effective attack generation.            |
| [Connection Problems](/docs/red-team/troubleshooting/connecting-to-targets)       | Authentication failures, rate limiting issues, and incorrect endpoint configuration can prevent successful API connections. |
| [False Positives](/docs/red-team/troubleshooting/false-positives)                 | Insufficient system context in grader configuration can lead to incorrect vulnerability assessments.                        |
| [Multi-Turn Sessions](/docs/red-team/troubleshooting/multi-turn-sessions)         | Session management issues can disrupt conversation context in both client and server-side implementations.                  |
| [Multiple Response Types](/docs/red-team/troubleshooting/multiple-response-types) | Response parsing errors occur when handling non-standard formats, guardrails, or error states.                              |
| [Remote Generation](/docs/red-team/troubleshooting/remote-generation)             | Corporate firewalls may block access to remote generation endpoints due to security policies around adversarial content.    |

## Related Documentation

- [Red Team Quickstart](/docs/red-team/quickstart/)
- [Configuration Guide](/docs/configuration/guide/)
