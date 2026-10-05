---
sidebar_position: 42
title: OpenAI ChatKit
description: 'Migrate from the removed OpenAI ChatKit provider to Agents SDK, custom providers, or HTTP, and preserve your workflow behavior before Agent Builder retires.'
---

# OpenAI ChatKit

The `openai:chatkit` provider has been removed from Promptfoo. Existing configurations now fail with a migration error before starting a browser or calling OpenAI.

This provider automated ChatKit for Agent Builder-hosted workflows. [OpenAI has deprecated Agent Builder and scheduled its shutdown for November 30, 2026](https://developers.openai.com/api/docs/deprecations#2026-06-03-agent-builder). ChatKit itself remains available; the Promptfoo provider removal takes effect independently of that shutdown date.

## Migration

Export your workflow using [OpenAI's Agent Builder migration guide](https://developers.openai.com/api/docs/guides/agent-builder/migrate-from-agent-builder), then choose a provider for the application you run:

| Application                                  | Promptfoo integration                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| JavaScript or TypeScript SDK agent           | [OpenAI Agents SDK provider](/docs/providers/openai-agents) (`openai:agents:*`)                           |
| Python Agents SDK workflow                   | [Agents SDK Python guide](/docs/guides/evaluate-openai-agents-python)                                     |
| Workflow with custom orchestration           | [JavaScript/TypeScript provider](/docs/providers/custom-api) or [Python provider](/docs/providers/python) |
| Application exposed through an HTTP endpoint | [HTTP provider](/docs/providers/http)                                                                     |
| ChatKit UI that needs browser testing        | [Browser provider](/docs/providers/browser)                                                               |

An exported workflow may contain several agents, branching logic, approval steps, and state management. Use a custom provider or HTTP endpoint to invoke the complete workflow when loading a single SDK agent would omit that behavior. A workflow ID alone cannot be substituted into `openai:agents:*`.

Update each `openai:chatkit` entry in your eval or red team configuration. Carry over your prompts and assertions, and map conversation state, tool approvals, and timeouts to the replacement integration. ChatKit-specific options such as `workflowId`, `version`, `approvalHandling`, and `usePool` do not transfer automatically.

Run representative single-turn and multi-turn tests against the replacement before relying on its results. For browser-based UI tests, Playwright remains supported through the Browser provider.
