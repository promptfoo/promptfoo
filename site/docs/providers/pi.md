---
sidebar_position: 43
title: Pi Coding Agent
description: 'Run coding-agent evals through the Pi CLI with per-message token and cost reporting.'
---

# Pi Coding Agent

Promptfoo starts a [Pi](https://pi.dev/) process for each test and sends the prompt over RPC. This provider supports Linux and macOS. It can serve as an evaluation target. Use a different provider for agentic grading.

## Provider IDs

- `pi:<provider>/<model>` selects a model, such as `pi:openai/gpt-5.5`. A suffix like `:high` selects a thinking level.
- `pi` uses the provider configuration. Set `model` or supply an `agent_dir` with a saved default.

## Installation

Install Pi 0.99.1 or later in a trusted directory outside the project.

```sh
npm install --global --ignore-scripts @earendil-works/pi-coding-agent@0.99.1
pi --list-models
```

Use an absolute installation directory on `PATH` or set `pi_path` to the absolute executable path. Promptfoo excludes relative and project-local search paths from the child environment.

## Setup

Choose one credential source.

- Set the selected vendor's key in the environment of the **Promptfoo process**, such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`. Each call uses a fresh home and Pi profile. Only the selected vendor receives a key.
- To use saved credentials or a custom vendor, set `agent_dir` to the absolute path of an existing trusted Pi profile outside the project. Promptfoo won't forward a vendor key in this mode. Pi can read and update the profile, including its model and login settings.

Inline credentials, per-eval credential overrides and arbitrary CLI arguments are unsupported. Only use trusted provider configurations. Promptfoo disables extensions, skill discovery, prompt templates, context files, project approval and Pi's automatic network checks. The selected model still needs network access.

## Quick Start

```yaml
providers:
  - pi:openai/gpt-5.5
prompts:
  - Explain the difference between a Python list and a tuple.
```

### With Working Directory

`working_dir` selects the process directory. All tools stay disabled. To evaluate a known file, pass its content explicitly.

```yaml
providers:
  - id: pi:openai/gpt-5.5
    config:
      working_dir: .
prompts:
  - 'Summarize this Python function: {{source}}'
tests:
  - vars:
      source: file://sample.py
```

### With Side Effects

:::danger

Every Pi tool is unsandboxed. Even `read` can access files outside `working_dir`. Shell and write tools run as your user, can access the selected credential or profile, and can modify or delete files. Use tools only in an isolated, disposable environment with trusted inputs and restricted credentials. Keep tools disabled for untrusted prompts and repositories.

:::

Tool use requires all three provider settings `working_dir`, `allow_unsafe_tools: true` and an explicit `tools` list. Use the smallest list the task requires.

## Configuration

| Setting                                 | Behavior                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `model`, `provider_id`                  | Select a model and optionally pin its vendor. A model in the provider ID takes precedence over `config.model`. |
| `thinking`                              | `off`, `minimal`, `low`, `medium`, `high`, or `xhigh`.                                                         |
| `working_dir`                           | Directory relative to the config file or an absolute path. Defaults to a temporary directory.                  |
| `pi_path`, `agent_dir`                  | Absolute paths to the installed executable and optional trusted profile.                                       |
| `tools`                                 | A list of `find`, `grep`, `ls`, `read`, `bash`, `edit`, or `write`. Defaults to none.                          |
| `allow_unsafe_tools`, `no_tools`        | Explicitly allow the listed tools or force all tools off. `no_tools: true` takes precedence.                   |
| `system_prompt`, `append_system_prompt` | Replace or extend the system prompt. Values appear in the process arguments. Keep secrets out of them.         |
| `timeout`                               | Process timeout in milliseconds. Defaults to 600000.                                                           |
| `max_output_bytes`                      | Output limit in bytes. Defaults to 33554432.                                                                   |

Test cases can override the model within the configured vendor and the thinking level. Execution and authentication settings belong in the provider configuration.

## Response Format

The result contains the final assistant text, finish reason, reported token usage, cost, model and tool names when available. Promptfoo omits stderr and the raw transcript and redacts the forwarded key. A nonzero exit, timeout or interrupted response fails the call.

## Caching

Each call starts a fresh session. Promptfoo does not cache results or automatically replay agent runs.

## Tracing

Promptfoo records one GenAI span per call. Pi does not emit native OpenTelemetry spans for individual tools.

## Comparing Models Through Pi

Add each model to `providers` and set its vendor's key in the process environment. The [model comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-pi/model-comparison) evaluates the same task across three vendors.

## See Also

- [Evaluate coding agents](/docs/guides/evaluate-coding-agents)
- [Pi examples](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-pi)
