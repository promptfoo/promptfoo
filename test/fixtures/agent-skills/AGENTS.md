# Agent Skill Fixtures

Fixtures in this directory exercise the Codex plugin skills end to end. Keep
them deterministic, small, and safe to run locally.

## Fixture Matrix

Use directory prefixes to show ownership:

- `evals-*` for `promptfoo-evals`
- `provider-setup-*` for `promptfoo-provider-setup`
- `redteam-setup-*` for `promptfoo-redteam-setup`
- `redteam-run-*` for `promptfoo-redteam-run`

When adding a fixture, update `test/agentSkills/promptfooPlugin.test.ts` so the
expected matrix remains explicit.

## Config Rules

- Include the Promptfoo YAML schema comment in config files.
- Prefer `{{env.VAR}}` placeholders for secrets; never commit real keys.
- Keep local provider paths valid from the command working directory.
- Use `--no-cache` and `--no-share` in runnable examples.
- For generated redteam YAML with relative `file://./target.*` paths, keep the
  generated file beside the target or use repo-root-relative paths.

## Python Fixtures

- Use `file://provider.py` or `file://provider.py:function_name` intentionally.
- Expose `call_api(prompt, options, context)` unless a suffix names another
  function.
- Return dictionaries with `output`, or `error` for failures.
- For Python redteam graders, `output` should be a JSON string with `pass`,
  `score`, and `reason`.
- Anchor imports of nearby fixture app code with
  `Path(__file__).resolve().parent`.
- Run Ruff before committing Python fixture changes:

```bash
python3 -m ruff check --select F401,F841,I --fix
python3 -m ruff format --check
```

## Validation

From the repo root:

```bash
npx vitest test/agentSkills/promptfooPlugin.test.ts --run
for config in $(find test/fixtures/agent-skills -name promptfooconfig.yaml -o -name redteam.yaml | sort); do
  npm run local -- validate config -c "$config"
done
```
