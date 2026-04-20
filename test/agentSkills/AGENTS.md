# Agent Skill Tests

`test/agentSkills/promptfooPlugin.test.ts` is the contract suite for the
Promptfoo Codex plugin bundle.

## What To Protect

- The Codex bundle has exactly four skills: evals, provider setup, redteam
  setup, and redteam run.
- The existing Claude `promptfoo-evals` plugin stays separate from the Codex
  bundle.
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
