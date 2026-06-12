# openai-codex-plugin (OpenAI Codex Plugin Example)

Compare two versions of one Codex plugin against the same input and workspace.

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
CODEX_SECURITY_PLUGIN_BASELINE="$PWD/../../../plugins/codex-security" \
npm run local -- eval -c examples/openai-codex-plugin/promptfooconfig.yaml --no-cache
```

Use distinct plugin paths or package versions to compare released and candidate
plugin versions. Package and path sources are executable code; evaluate only
trusted plugin inputs and export artifacts only to trusted directories.
