---
title: Agent Skill for Writing Evals
description: Install an agent skill that teaches AI coding agents to create Promptfoo eval suites with best-practice assertions, provider configs, and test organization.
sidebar_label: Agent Skill
sidebar_position: 99
---

# Agent Skill for Writing Evals

AI coding agents can write promptfoo configs, but they often get the details wrong — shell-style env vars that don't work, hallucination rubrics that can't see the source material, tests dumped inline instead of in files. The `promptfoo-evals` skill fixes this by teaching your agent promptfoo's conventions and common pitfalls.

It works with [Claude Code](https://code.claude.com) and [OpenAI Codex](https://openai.com/index/codex). Because it follows the open [Agent Skills](https://agentskills.io) standard, it should also work with other compatible tools.

## Why use a skill?

Without the skill, agents frequently:

- Use `$ENV_VAR` syntax in YAML configs (doesn't work — promptfoo uses Nunjucks `'{{env.VAR}}'`)
- Write `llm-rubric` assertions that reference "the article" but don't inline the source, so the grader can't actually compare
- Dump all tests inline in the config instead of using `file://tests/*.yaml`
- Reach for `llm-rubric` when `contains` or `is-json` would be faster, free, and deterministic

The skill encodes these patterns so the agent gets them right the first time.

## Install

### Via Claude Code marketplace

```bash
/plugin marketplace add promptfoo/promptfoo
/plugin install promptfoo-evals@promptfoo
```

### Manual install

Download the [skill directory](https://github.com/promptfoo/promptfoo/tree/main/.claude/skills/promptfoo-evals) and copy it to the correct location for your tool:

**Claude Code** (project-level — recommended for teams):

```bash
cp -r promptfoo-evals your-project/.claude/skills/
```

**Claude Code** (personal — available in all projects):

```bash
cp -r promptfoo-evals ~/.claude/skills/
```

**OpenAI Codex / other Agent Skills tools**:

```bash
cp -r promptfoo-evals your-project/.agents/skills/
```

:::note
For team adoption, commit the skill to your repo's skill directory (`.claude/skills/` for Claude Code, `.agents/skills/` for Codex). Every developer's agent picks it up automatically — no per-person install needed.
:::

The core skill consists of two files:

| File                       | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `SKILL.md`                 | Workflow instructions the agent follows                 |
| `references/cheatsheet.md` | Assertion types, provider patterns, and config examples |

## Usage

Once installed, the agent activates automatically when you ask it to create or update eval coverage. In Claude Code, you can also invoke it directly with a slash command:

```text
/promptfoo-evals Create an eval suite for my summarization prompt
```

In Codex and other Agent Skills tools, simply ask the agent to create an eval — the skill activates based on the task context.

The agent will:

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

- [Getting Started](/docs/getting-started) — promptfoo overview for newcomers
- [Configuration Reference](/docs/configuration/guide) — full config schema documentation
- [Assertions Reference](/docs/configuration/expected-outputs) — complete list of assertion types
- [Custom Providers](/docs/providers/custom-api) — building Python, JavaScript, and HTTP providers
- [MCP Server](/docs/integrations/mcp-server) — expose promptfoo to AI agents via MCP
