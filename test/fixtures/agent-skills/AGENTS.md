# Agent Skill Fixtures

Fixtures in this directory exercise the shared plugin skills end to end. Keep
them small and safe to run locally. The eligibility eval uses a live agent;
other fixtures are deterministic.

## Fixture Matrix

Use directory prefixes to show ownership:

- `evals-*` for `promptfoo-evals`
- `provider-setup-*` for `promptfoo-provider-setup`
- `redteam-eligibility` for the live eligibility and routing eval
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
npx vitest run test/agentSkills
for config in $(find test/fixtures/agent-skills -name promptfooconfig.yaml -o -name redteam.yaml | sort); do
  npm run local -- validate config -c "$config"
done
```

For the live eligibility eval, use the preparation and run commands at the top
of `redteam-eligibility/promptfooconfig.yaml`. Preparation copies only synthetic
repositories and the real bundle to a temporary workspace, keeping expected
answers outside the evaluated agent's working directory. Inspect exported
results as well as the exit code; model access is required.
