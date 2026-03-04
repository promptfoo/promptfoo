---
title: Agent Skill for Writing Evals
description: Install an agent skill that teaches Claude Code and OpenAI Codex to create promptfoo eval suites automatically.
sidebar_label: Agent Skill
---

# Agent Skill for Writing Evals

The `promptfoo-evals` agent skill teaches AI coding agents how to create and maintain promptfoo evaluation suites. It works with [Claude Code](https://code.claude.com), [OpenAI Codex](https://openai.com/index/codex), and any tool that supports the [Agent Skills](https://agentskills.io) standard.

When installed, the agent knows how to scaffold configs, write test cases with appropriate assertions, choose providers, and validate the result — following promptfoo conventions.

## Install

Clone or download the skill directory from the [promptfoo repo](https://github.com/promptfoo/promptfoo/tree/main/.claude/skills/promptfoo-evals), then copy it to the correct location for your tool:

**Claude Code** (project-level — recommended for teams):

```bash
cp -r promptfoo-evals your-project/.claude/skills/
```

**Claude Code** (personal — available in all projects):

```bash
cp -r promptfoo-evals ~/.claude/skills/
```

**OpenAI Codex**:

```bash
cp -r promptfoo-evals your-project/.agents/skills/
```

The skill contains two files:

| File                       | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `skill.md`                 | Workflow instructions the agent follows                 |
| `references/cheatsheet.md` | Assertion types, provider patterns, and config examples |

## Usage

Once installed, the agent activates automatically when you ask it to create or update eval coverage. You can also invoke it directly:

```
/promptfoo-evals Create an eval suite for my summarization prompt
```

The agent will:

1. Search for existing promptfoo configs in the repo
2. Scaffold a new suite if needed (`promptfooconfig.yaml`, `prompts/`, `tests/`)
3. Write test cases with deterministic assertions first, model-graded when needed
4. Validate the config with `promptfoo validate`
5. Provide run commands

## What the skill teaches

The skill encodes these promptfoo best practices:

- **Deterministic assertions first.** Use `contains`, `is-json`, `javascript` before reaching for `llm-rubric`. Deterministic checks are fast, free, and reproducible.
- **File-based test organization.** Tests go in `tests/*.yaml` files loaded via `file://tests/*.yaml` glob, keeping configs clean as test count grows.
- **Faithfulness checks done right.** When using `llm-rubric` to check for hallucination, the source material must be inlined in the rubric via `{{variable}}` so the grader can actually compare.
- **Environment variables.** Use Nunjucks syntax `'{{env.API_KEY}}'` in YAML configs, not shell syntax.
- **Config field ordering.** description, env, prompts, providers, defaultTest, scenarios, tests.

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

## Customizing the skill

The skill is just markdown files — edit them to match your team's conventions:

- **Add custom providers** to the cheatsheet if your team uses specific models or endpoints.
- **Add assertion patterns** for your domain (e.g., medical accuracy rubrics, financial compliance checks).
- **Change the default layout** if your repo uses a different directory structure for evals.

## Related

- [Configuration Reference](/docs/configuration/guide) — full config schema documentation
- [Assertions Reference](/docs/configuration/expected-outputs) — complete list of assertion types
- [Custom Providers](/docs/providers/custom-api) — building Python, JavaScript, and HTTP providers
- [MCP Server](/docs/integrations/mcp-server) — expose promptfoo to AI agents via MCP
