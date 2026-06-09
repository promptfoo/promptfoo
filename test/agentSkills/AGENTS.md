# Agent Skill Tests

`test/agentSkills/promptfooPlugin.test.ts` is the contract suite for the
Promptfoo plugin bundle (shared across Codex and Claude Code).

## What To Protect

- The shared `plugins/promptfoo` bundle has exactly four skills: evals, provider
  setup, redteam setup, and redteam run.
- The bundle ships both a `.codex-plugin/plugin.json` and a
  `.claude-plugin/plugin.json`, and is exposed by both
  `.agents/plugins/marketplace.json` (Codex) and the repo-root
  `.claude-plugin/marketplace.json` (Claude Code) with matching plugin name
  `promptfoo`.
- The repo-local Claude copy of `promptfoo-evals` stays byte-for-byte aligned
  with the shared bundle's `promptfoo-evals` skill.
- Every repo-local Claude skill uses canonical `SKILL.md` casing so discovery
  stays predictable.
- Shared repo-local contributor skills stay aligned between `.claude/skills/`
  and `.agents/skills/`.
- Skill bodies stay concise; detailed examples live in `references/`.
- `agents/openai.yaml` files keep short descriptions, default prompts, and
  implicit invocation aligned with each skill.
- Fixture configs remain parseable, secret-free, and runnable with local
  `file://` providers.
- Python provider fixtures must stay executable and compatible with
  `file://provider.py:function_name`.

## Test Commands

Run from the repo root:

```bash
source ~/.nvm/nvm.sh && nvm use
npx vitest test/agentSkills/promptfooPlugin.test.ts --run
```

For Python fixture edits, also run the same Ruff command as CI:

```bash
python3 -m ruff check --select F401,F841,I --fix
python3 -m ruff format --check
```

If you add or rename a fixture directory, update the expected fixture matrix in
`promptfooPlugin.test.ts` and validate every fixture config:

```bash
for config in $(find test/fixtures/agent-skills -name promptfooconfig.yaml -o -name redteam.yaml | sort); do
  npm run local -- validate config -c "$config"
done
```

For bundle behavior changes, also run a live Promptfoo skill eval with positive
and near-miss routing prompts, following `site/docs/guides/test-agent-skills.md`.
