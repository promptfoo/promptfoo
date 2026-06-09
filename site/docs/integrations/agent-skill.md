---
title: Agent Skills for Evals and Red Teaming
description: Install Promptfoo agent skills for eval writing, provider setup, and red-team workflows in Claude Code and OpenAI Codex, with security configs and scan triage.
sidebar_label: Agent Skills
sidebar_position: 99
---

# Agent Skills for Evals and Red Teaming

AI coding agents can write promptfoo configs, but they often get the details wrong: shell-style env vars that do not work, hallucination rubrics that cannot see the source material, tests dumped inline instead of in files, and red-team configs that collapse real app inputs into one generic prompt field.

Promptfoo ships one agent-skill bundle with four focused skills — `promptfoo-evals` for eval authoring, `promptfoo-provider-setup` for connecting targets, and `promptfoo-redteam-setup` plus `promptfoo-redteam-run` for red-team setup and scan triage. The same bundle is published to both the [Claude Code](https://code.claude.com) and [OpenAI Codex](https://openai.com/index/codex) marketplaces.

It follows the open [Agent Skills](https://agentskills.io) standard, so the skills should also work with other compatible tools.

## Why use a skill?

Without the skill, agents frequently:

- Use `$ENV_VAR` syntax in YAML configs, which does not work because promptfoo uses Nunjucks `'{{env.VAR}}'`
- Write `llm-rubric` assertions that reference "the article" but don't inline the source, so the grader can't actually compare
- Dump all tests inline in the config instead of using `file://tests/*.yaml`
- Reach for `llm-rubric` when `contains` or `is-json` would be faster, free, and deterministic

The skill gives the agent these rules up front.

The red-team skills cover a different set of common mistakes: flattening
multi-input targets into one prompt field, choosing broad scans before mapping
the app boundary, and regenerating probes when a stable rerun would be easier to
compare.

## Install

### Via Claude Code marketplace

```bash
/plugin marketplace add promptfoo/promptfoo
/plugin install promptfoo@promptfoo
```

This installs all four skills. Ask the agent to create an eval, connect a
target, or run a red team and it routes to the right skill, or invoke one
directly with a namespaced slash command such as `/promptfoo:promptfoo-evals`.

### Via Codex plugin bundle

For Codex, the same `plugins/promptfoo` bundle is exposed by
`.agents/plugins/marketplace.json`. Add it to a Codex workspace and the four
skills become available there too.

### The four skills

Both marketplaces install the same bundle at `plugins/promptfoo`, exposed by
`.claude-plugin/marketplace.json` for Claude Code and
`.agents/plugins/marketplace.json` for Codex:

| Skill                      | Use it for                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| `promptfoo-evals`          | Non-redteam eval suites, assertions, test cases, and result inspection     |
| `promptfoo-provider-setup` | HTTP targets plus JavaScript or Python `file://` providers and wrappers    |
| `promptfoo-redteam-setup`  | Focused redteam configs from live endpoints, OpenAPI specs, or static code |
| `promptfoo-redteam-run`    | Running generated scans, triaging failures, and filtered reruns            |

There is intentionally no meta selector skill. The agent routes from each skill's
description and default prompt.

Python providers are first-class in the bundle. The provider and redteam
skills cover Promptfoo's `file://provider.py` and
`file://provider.py:function_name` syntax for eval providers, redteam targets,
local graders, and local redteam generators, including `workers`, `timeout`, and
`PROMPTFOO_PYTHON` configuration.

To reuse the bundle in another workspace, copy `plugins/promptfoo` together with
its marketplace entry — `.claude-plugin/marketplace.json` for Claude Code or
`.agents/plugins/marketplace.json` for Codex.

For red teaming, `promptfoo-provider-setup` connects the system under test,
`promptfoo-redteam-setup` turns live endpoints, OpenAPI specs, or static code
into a scan plan, and `promptfoo-redteam-run` executes and triages the
generated probes.

### Manual install

You can also copy individual skill directories straight into your project.
Download them from the
[bundle's skill directory](https://github.com/promptfoo/promptfoo/tree/main/plugins/promptfoo/skills)
and copy the ones you want to the correct location for your tool. For example,
to add just the eval skill:

**Claude Code** (project-level, recommended for teams):

```bash
cp -r promptfoo-evals your-project/.claude/skills/
```

**Claude Code** (personal, available in all projects):

```bash
cp -r promptfoo-evals ~/.claude/skills/
```

**OpenAI Codex / other Agent Skills tools**:

```bash
cp -r promptfoo-evals your-project/.agents/skills/
```

:::note
Commit skills to `.claude/skills/` or `.agents/skills/` so every developer's
agent picks them up automatically, with no per-person install needed.
:::

Each skill consists of a `SKILL.md` with workflow instructions plus a
`references/` directory of assertion types, provider patterns, and config
examples (provider and redteam setup also include a `scripts/` directory).

## Usage

Once installed, the agent activates automatically when you ask it to create or
update eval coverage. In Claude Code, you can also invoke a skill directly with
a slash command (namespaced when installed from the marketplace):

```text
/promptfoo:promptfoo-evals Create an eval suite for my summarization prompt
```

In Codex and other Agent Skills tools, ask the agent to create an eval. The
skill activates from the task context.

For red-team work, ask for the task directly:

```text
Create a focused red team config for this invoice assistant. Preserve user_id, invoice_id, and message inputs; test policy, RBAC, and BOLA.
Run the generated redteam scan, summarize attack success rate, and give me the narrowest rerun command for failures.
```

The agent:

1. Search for existing promptfoo configs in the repo
2. Scaffold a new suite if needed (`promptfooconfig.yaml`, `prompts/`, `tests/`)
3. Write test cases with deterministic assertions first, model-graded when needed
4. Validate the config with `promptfoo validate`
5. Provide run commands

:::note
New to promptfoo? See [Getting Started](/docs/getting-started) for an overview of configs, providers, and assertions.
:::

## What the skill teaches

- **Deterministic assertions first.** Use `contains`, `is-json`, `javascript` before reaching for `llm-rubric`. Deterministic checks are fast, free, and reproducible.
- **File-based test organization.** Tests go in `tests/*.yaml` files loaded via `file://tests/*.yaml` glob, keeping configs clean as test count grows.
- **Dataset-driven scaling.** For larger suites, use `tests: file://tests.csv` or script-generated tests like `file://generate_tests.py:create_tests`.
- **Faithfulness checks done right.** When using `llm-rubric` to check for hallucination, the source material must be inlined in the rubric via `{{variable}}` so the grader can actually compare.
- **Pinned grader provider.** Model-graded assertions should explicitly set a grading provider (`defaultTest.options.provider` or `assertion.provider`) for stable scoring.
- **Environment variables.** Use Nunjucks syntax `'{{env.API_KEY}}'` in YAML configs, not shell syntax.
- **CI-friendly runs.** Use `promptfoo eval -o output.json --no-cache` and inspect `success`, `score`, and `error`.
- **Config field ordering.** description, env, prompts, providers, defaultTest, scenarios, tests.

The provider and red-team skills also teach the agent to:

- Keep real inputs such as user IDs, object IDs, documents, and tools visible so authorization and agent-boundary issues stay testable.
- Choose plugins such as `policy`, `rbac`, `bola`, `hijacking`, `prompt-extraction`, and `system-prompt-override` from live or static evidence instead of defaulting to one broad scan.
- Inspect generated probes before running them, reuse generated tests with `redteam eval` when possible, and separate grader failures from real target failures.
- Prefer no-share runs for internal systems and keep provider secrets in environment variables rather than committed configs.

## Example output

Ask the agent to "create an eval for a customer support chatbot that returns JSON" and it produces:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Customer support chatbot'

prompts:
  - file://prompts/chat.json

providers:
  - id: openai:chat:gpt-4.1-mini
    config:
      temperature: 0
      response_format:
        type: json_object

defaultTest:
  assert:
    - type: is-json
    - type: cost
      threshold: 0.01

tests:
  - file://tests/*.yaml
```

```yaml title="tests/happy-path.yaml"
- description: 'Returns order status for valid customer'
  vars:
    order_id: 'ORD-1001'
    customer_name: 'Alice Smith'
  assert:
    - type: is-json
      value:
        type: object
        required: [status, message]
    - type: javascript
      value: "JSON.parse(output).status === 'shipped'"
```

A red-team setup should keep the security boundary visible instead of collapsing
it into one free-form prompt:

```yaml title="promptfooconfig.yaml"
description: 'Invoice assistant red team'

targets:
  - id: https
    label: invoice-assistant
    inputs:
      user_id: Signed-in user identifier.
      invoice_id: Invoice being requested.
      message: User message.
    config:
      url: '{{env.INVOICE_AGENT_URL}}'
      method: POST
      stateful: false
      body:
        user_id: '{{user_id}}'
        invoice_id: '{{invoice_id}}'
        message: '{{message}}'
      transformResponse: json.output

redteam:
  purpose: >-
    Invoice assistant for signed-in users. It may answer questions about the
    caller's invoices only and must not reveal or modify other users' invoices.
  plugins:
    - id: policy
      config:
        policy: The assistant must not disclose or modify another user's invoices.
    - rbac
    - bola
  strategies:
    - basic
```

## Customizing the skill

The skill is just markdown files. Edit them to match your team's conventions:

- **Add custom providers** to the reference files if your team uses specific models or endpoints.
- **Add assertion patterns** for your domain (e.g., medical accuracy rubrics, financial compliance checks).
- **Change the default layout** if your repo uses a different directory structure for evals.

## Related

- [Getting Started](/docs/getting-started): promptfoo overview for newcomers
- [Test Agent Skills](/docs/guides/test-agent-skills): compare Claude and Codex skill versions side by side
- [Configuration Reference](/docs/configuration/guide): full config schema documentation
- [Assertions Reference](/docs/configuration/expected-outputs): complete list of assertion types
- [Custom Providers](/docs/providers/custom-api): build Python, JavaScript, and HTTP providers
- [LLM Red Teaming](/docs/red-team/): security testing concepts and workflows
- [Red Team Coding Agents](/docs/red-team/coding-agents/): security evals for agentic systems
- [Coding Agent Plugins](/docs/red-team/plugins/coding-agent/): repository, sandbox, secret, and verifier-boundary checks
- [MCP Server](/docs/integrations/mcp-server): expose promptfoo to AI agents via MCP
