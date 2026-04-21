# Agent Plugin Bundles

This directory contains agent plugin bundles. Read this file before editing
`plugins/promptfoo` or adding another plugin bundle.

## Promptfoo Codex Plugin

`plugins/promptfoo` is the Codex plugin bundle. Keep the public surface to the
four focused skills unless the product decision changes:

- `promptfoo-evals`
- `promptfoo-provider-setup`
- `promptfoo-redteam-setup`
- `promptfoo-redteam-run`

Do not add a meta selector skill. Codex should route from each skill's
frontmatter description and `agents/openai.yaml` default prompt.

## Skill Layout

Each skill should keep:

- `SKILL.md` for concise workflow instructions and routing boundaries
- `agents/openai.yaml` for UI metadata
- `references/*.md` for concrete examples and longer patterns
- `scripts/*` only when deterministic helper code is useful

Keep examples one reference hop away from `SKILL.md`; avoid README-style files
inside skill folders.

## Provider And Redteam Assumptions

- Treat Python providers as first-class alongside JavaScript providers.
- Cover `file://provider.py` and `file://provider.py:function_name` wherever
  provider examples mention local code.
- Redteam setup/run skills assume remote generation is available. Do not add
  local-only or `PROMPTFOO_DISABLE_REMOTE_GENERATION` guidance unless the
  product direction changes.
- Deterministic local providers are acceptable for fixtures and QA examples,
  but the skills should steer real scans toward Promptfoo's normal generation
  and grading paths.

## Validation

From the repo root:

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
python3 "$CODEX_HOME/skills/.system/skill-creator/scripts/quick_validate.py" plugins/promptfoo/skills/promptfoo-evals
python3 "$CODEX_HOME/skills/.system/skill-creator/scripts/quick_validate.py" plugins/promptfoo/skills/promptfoo-provider-setup
python3 "$CODEX_HOME/skills/.system/skill-creator/scripts/quick_validate.py" plugins/promptfoo/skills/promptfoo-redteam-setup
python3 "$CODEX_HOME/skills/.system/skill-creator/scripts/quick_validate.py" plugins/promptfoo/skills/promptfoo-redteam-run
npx vitest test/agentSkills/promptfooPlugin.test.ts --run
npm run f
```
