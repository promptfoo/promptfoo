---
sidebar_position: 42
title: OpenAI ChatKit
description: 'Evaluate ChatKit application backends with Agents SDK, custom, or HTTP providers, test web interactions, and migrate legacy openai:chatkit configurations.'
---

# OpenAI ChatKit

[ChatKit](https://developers.openai.com/api/docs/guides/chatkit) provides a chat interface for an agent application. Use Promptfoo to evaluate the agent or workflow behind that interface. OpenAI's [custom ChatKit integration guide](https://developers.openai.com/api/docs/guides/custom-chatkit) describes how to connect ChatKit to a backend you run.

Choose a provider that matches how your application runs:

| Application                                  | Promptfoo integration                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| JavaScript or TypeScript SDK agent           | [OpenAI Agents SDK provider](/docs/providers/openai-agents) (`openai:agents:*`)                           |
| Python Agents SDK workflow                   | [Agents SDK Python guide](/docs/guides/evaluate-openai-agents-python)                                     |
| Workflow with custom orchestration           | [JavaScript/TypeScript provider](/docs/providers/custom-api) or [Python provider](/docs/providers/python) |
| Application exposed through an HTTP endpoint | [HTTP provider](/docs/providers/http)                                                                     |

For web UI tests, configure the [Browser provider](/docs/providers/browser) with application-specific interaction and extraction steps. Specialized browser automation can run through a [custom JavaScript provider](/docs/providers/custom-api) using Playwright.

## Migration

The legacy `openai:chatkit` provider is unsupported. Configurations that use it fail with a migration error before starting a browser or calling OpenAI. Replace each `openai:chatkit` entry with an integration for your application.

For Agent Builder workflows, follow [OpenAI's migration guide](https://developers.openai.com/api/docs/guides/agent-builder/migrate-from-agent-builder) to export your workflow as Agents SDK code.

An exported workflow may contain several agents, branching logic, approval steps, and state management. Use a custom provider or HTTP endpoint to invoke the complete workflow when loading a single SDK agent would omit that behavior. A workflow ID alone cannot be substituted into `openai:agents:*`.

Carry over your prompts and assertions, and map conversation state, tool approvals, and timeouts to the replacement integration. Legacy provider options such as `workflowId`, `version`, `approvalHandling`, and `usePool` do not transfer automatically.

Run representative single-turn and multi-turn tests against the replacement before relying on its results.
