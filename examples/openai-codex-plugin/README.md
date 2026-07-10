# openai-codex-plugin (OpenAI Codex Plugin Example)

Compare two versions of one Codex plugin against the same input and workspace.

## Run the example

```bash
npx promptfoo@latest init --example openai-codex-plugin
cd openai-codex-plugin
```

Set `CODEX_PLUGIN_WORKSPACE` to the repository under evaluation, then set
`CODEX_PLUGIN_CURRENT` and `CODEX_PLUGIN_BASELINE` to trusted
Codex plugin directories. Promptfoo creates an isolated Codex home per
test/provider case, installs only the requested plugin, and deletes the runtime
after the result is recorded.

```bash
CODEX_PLUGIN_WORKSPACE="$PWD/../../.." \
CODEX_PLUGIN_CURRENT="$PWD/../../../plugins/demo-plugin" \
CODEX_PLUGIN_BASELINE="/trusted/distinct/codex-plugin-baseline" \
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

The current and baseline values must be distinct plugin paths or pinned package
versions to compare released and candidate plugin versions. Package and path
sources are executable code; evaluate only trusted plugin inputs. The example
asserts observed `demo-skill` skill-call evidence plus execution/source identity, not only JSON syntax, and
exports artifacts only to trusted directories.
