# Codex Project Metadata

This directory holds repo-local Codex metadata: plugin marketplace entries plus
project skills that should be available while working in this repository.

## Rules

- Keep marketplace entries in `.agents/plugins/marketplace.json`.
- Keep `source.path` relative to the repo root, for example `./plugins/promptfoo`.
- Each plugin entry must include `policy.installation`, `policy.authentication`, and `category`.
- Keep marketplace root metadata limited to `name`, optional `interface.displayName`, and `plugins`.
- Do not add product gating unless explicitly requested.
- Keep repo-local project skills under `.agents/skills/<name>/SKILL.md`.
- When a repo-local Codex skill mirrors a `.claude/skills/` skill, keep the files
  byte-for-byte aligned unless the platform needs an intentional divergence.

## Validation

When changing marketplace metadata, run:

```bash
npx vitest test/agentSkills/promptfooPlugin.test.ts --run
npm run f
```

When changing repo-local Codex skills, also run:

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
for skill in .agents/skills/*; do
  python3 "$CODEX_HOME/skills/.system/skill-creator/scripts/quick_validate.py" "$skill"
done
npx vitest test/agentSkills/promptfooPlugin.test.ts --run
```
