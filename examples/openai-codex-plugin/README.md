# openai-codex-plugin (OpenAI Codex Plugin Example)

Compare two versions of one Codex plugin against the same input and workspace.

## Run the example

```bash
npx promptfoo@latest init --example openai-codex-plugin
cd openai-codex-plugin
```

Set `CODEX_PLUGIN_WORKSPACE` to the repository under evaluation, then set
`CODEX_SECURITY_PLUGIN_CURRENT` and `CODEX_SECURITY_PLUGIN_BASELINE` to trusted
Codex Security plugin directories. Promptfoo creates an isolated Codex home per
test/provider case, installs only the requested plugin, and deletes the runtime
after the result is recorded.

```bash
CODEX_PLUGIN_WORKSPACE="$PWD/../../.." \
CODEX_SECURITY_PLUGIN_CURRENT="$PWD/../../../plugins/codex-security" \
CODEX_SECURITY_PLUGIN_BASELINE="/trusted/distinct/codex-security-baseline" \
npm run local -- eval -c examples/openai-codex-plugin/promptfooconfig.yaml --no-cache
```

The current and baseline values must be distinct plugin paths or pinned package
versions to compare released and candidate plugin versions. Package and path
sources are executable code; evaluate only trusted plugin inputs. The example
asserts deterministic `security-scan` blocked-scan evidence, not only JSON syntax, and
exports artifacts only to trusted directories.
