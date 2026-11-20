---
sidebar_label: Agent Client Protocol
title: Evaluate agents over the Agent Client Protocol
description: Run GitHub Copilot CLI, Google Antigravity, Cursor Agent, Hermes Agent, and DeepSeek Harness as Promptfoo providers over the Agent Client Protocol.
---

Promptfoo starts the selected agent as a local subprocess and drives its [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) server over standard input and output. Install and authenticate the agent on the machine running the eval.

| Provider          | Executable and arguments | Setup                                                                                                                                                                                           |
| ----------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp:copilot`     | `copilot --acp --stdio`  | Sign in with Copilot CLI or provide `COPILOT_GITHUB_TOKEN`. The preset uses the CLI's [ACP server](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server).              |
| `acp:antigravity` | `agy acp`                | Sign in with `agy` or configure its Gemini API key mode before using `GEMINI_API_KEY`. See [Google's ACP guide](https://antigravity.google/docs/cli/acp/).                                      |
| `acp:cursor`      | `agent acp`              | Run `agent login` or supply `CURSOR_API_KEY`. The [Cursor CLI](https://cursor.com/docs/cli/acp) recognizes existing credentials at startup.                                                     |
| `acp:hermes`      | `hermes acp`             | Configure a model and install the ACP extra. Verify the installation with `hermes acp --check`. See the [Hermes ACP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp). |
| `acp:deepseek`    | `dsh --profile acp`      | Install [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and configure its model credentials. The Python distribution of `dsh` also requires `DSH_HOME`.                     |

## Example

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Return the first word in alphabetical order. Words: {{words}}.'
providers:
  - acp:copilot
  - acp:cursor
tests:
  - vars:
      words: 'cedar, birch, maple'
    assert:
      - type: icontains
        value: birch
```

The [five-agent comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-acp) uses the same test across all five presets.

## Configuration

| Option        | Behavior                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `command`     | Executable on PATH or a path relative to the config. Required for the generic `acp` provider. On Windows, select a directly executable binary or use `node` with a JavaScript entry point. |
| `args`        | Array of literal arguments. Replaces the preset's arguments. Prompt text is sent over ACP.                                                                                                 |
| `pass_env`    | The child inherits a minimal shell environment plus preset-specific variables. List additional variable names here, e.g. `[GEMINI_API_KEY]` for a Gemini-backed Hermes profile.            |
| `working_dir` | Workspace relative to the config. Each call otherwise starts in a fresh temporary directory. Set `copy_working_dir: true` to evaluate independent copies of a fixture directory.           |
| `auth_method` | ID of an advertised ACP authentication method. Configure any interactive sign-in before starting the eval.                                                                                 |
| `mode`        | Agent-specific ACP session mode ID. Omit to use the agent's configured default.                                                                                                            |
| `model`       | Value for the agent's advertised ACP model selector. For agents without this selector, choose the model in the agent's own settings.                                                       |
| `timeout_ms`  | Deadline for startup, authentication, and the prompt turn. Defaults to 120000.                                                                                                             |

For a Copilot CLI [bring-your-own-key provider](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-llm-models), configure the CLI's `providers.json` or include `COPILOT_PROVIDER_BASE_URL`, `COPILOT_PROVIDER_API_KEY`, `COPILOT_PROVIDER_TYPE`, and `COPILOT_MODEL` in `pass_env`.

To use another ACP v1 agent, set `id: acp` and provide its launch command. For example, this runs the Copilot preset's underlying transport directly:

```yaml
providers:
  - id: acp
    config:
      command: copilot
      args: ['--acp', '--stdio']
      pass_env: [COPILOT_GITHUB_TOKEN]
```

## Sessions and results

Each eval row gets a new process and ACP session. The agent's own configuration controls its tools, persistent memory, credentials and access to the machine. Promptfoo provides no client-side terminal or filesystem tools, adds no MCP servers, and declines ACP permission requests. For workspace tasks, use a disposable directory and configure the agent's own sandbox as appropriate.

Promptfoo concatenates the agent's text updates into `response.output`. The session ID, stop reason, tool-call count and permission-request count are available under `response.metadata.acp`. Tool output and private reasoning are excluded from the answer. Timeouts, protocol errors, cancellations, and empty answers surface as provider errors.
