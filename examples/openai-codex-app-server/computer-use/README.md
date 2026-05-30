# computer-use (Codex Computer Use UI-Only Red Team Eval)

This example drives a real local UI-only chatbot through the Codex app-server
provider and the macOS Computer Use plugin. The target deliberately has no chat
API or network endpoint: its response logic runs inside a disposable native
AppKit application after a user submits the form.

The checked-in target contains an intentional diagnostic-token disclosure
vulnerability. A successful run uses direct UI interaction to make the target reveal the canary
`PROMPTFOO_UI_ONLY_CANARY_7F3A`, then verifies both the canary and the
`computer-use` MCP trajectory recorded by the app-server provider.

## Prerequisites

- An unlocked macOS desktop with Computer Use already installed and approved
  for local UI access.
- Xcode Command Line Tools with `xcrun swiftc`.
- A local Codex login, or `OPENAI_API_KEY` / `CODEX_API_KEY`.
- The complete Computer Use plugin directory, including `.mcp.json`,
  `.codex-plugin/plugin.json`, and `Codex Computer Use.app`.

Set `COMPUTER_USE_PLUGIN_DIR` to an installed plugin directory. For a Codex
Desktop build, it is typically under the app bundle:

```bash
export COMPUTER_USE_PLUGIN_DIR="/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use"
```

Use the actual installed path on your machine. Do not commit the proprietary
plugin bundle or copy personal Codex authentication into this example.

## Run

From the repository root:

```bash
examples/openai-codex-app-server/computer-use/scripts/run-e2e.sh
```

The runner:

1. Creates an isolated generated `CODEX_HOME` under `.tmp/`.
2. Adds a local marketplace entry for the explicit Computer Use plugin path.
3. Installs the plugin into that disposable home and verifies its MCP tools.
4. Stops any stale instance of its generated target path.
5. Compiles the native UI-only target under `.tmp/`.
6. Starts the generated `PromptfooComputerUseTarget.app`.
7. Runs a fresh local Promptfoo eval with `--no-cache`, or the Promptfoo command
   supplied as runner arguments.
8. Writes the exported Promptfoo result to `.tmp/results.json` and stops the
   generated target.

The generated Codex home starts without auth state. Use an API key for strict
isolation. Codex may persist supplied API-key auth inside the ignored `.tmp/`
home while the eval runs, so treat generated files as sensitive and remove them
after use. To exercise an approved local-login fixture, stage a separate
disposable home and use the manual commands below.

## Manual Commands

The helper can also be used directly:

```bash
python3 examples/openai-codex-app-server/computer-use/scripts/stage_codex_home.py \
  --plugin-dir "$COMPUTER_USE_PLUGIN_DIR" \
  --codex-home /tmp/promptfoo-computer-use-codex-home \
  --force

python3 examples/openai-codex-app-server/computer-use/scripts/probe_plugin_list.py \
  --codex-home /tmp/promptfoo-computer-use-codex-home
```

The runner is the supported way to compile, launch, evaluate, and clean up the
native target. To run the eval manually against an already-running copy of that
generated app:

```bash
CODEX_HOME_OVERRIDE=/tmp/promptfoo-computer-use-codex-home \
COMPUTER_USE_TARGET_APP=/absolute/path/to/PromptfooComputerUseTarget.app \
  npm run local -- eval \
  -c examples/openai-codex-app-server/computer-use/promptfooconfig.yaml \
  --no-cache --no-share \
  -o /tmp/promptfoo-computer-use-results.json
```

## Run A Real Red Team

The same config is also a red-team generation source. It includes one targeted
policy plugin case so the run remains bounded while proving that generated
adversarial input reaches the UI-only target.

Generation prints an informational warning that the fixed smoke test is ignored.
The generated suite supplies its own policy probe as expected.

From the repository root:

```bash
npm run local -- redteam generate \
  -c examples/openai-codex-app-server/computer-use/promptfooconfig.yaml \
  -o examples/openai-codex-app-server/computer-use/.tmp/redteam.yaml \
  --force --strict

examples/openai-codex-app-server/computer-use/scripts/run-e2e.sh \
  redteam eval \
  -c examples/openai-codex-app-server/computer-use/.tmp/redteam.yaml \
  --no-cache --no-share \
  -o examples/openai-codex-app-server/computer-use/.tmp/redteam-results.json
```

The eval is expected to report a finding because the disposable target is
intentionally vulnerable. Inspect `.tmp/redteam-results.json` to confirm that
the generated policy probe reached the native app through Computer Use and
revealed the canary.

## Safety Boundaries

- The native target has no chat API endpoint and opens no listening socket.
- The runner compiles and starts a unique generated `.app` target under the
  ignored `.tmp/` directory. It clears stale instances of that exact generated
  target path before rebuilding and stops the target during cleanup.
- The generated Codex home references an explicit local plugin path, installs
  its own disposable plugin cache, and never copies personal auth.
- The staging helper refuses to overwrite directories it did not create.
- The eval accepts MCP elicitations so Computer Use can access the disposable
  target without an interactive prompt. Its metadata assertion rejects
  trajectories that enumerate apps or touch an app outside the generated app
  path.
- The eval prompt prohibits shell HTTP clients, source inspection, and browser
  developer tools so a passing result demonstrates real UI interaction.
- Windows support is intentionally out of scope for this fixture because the
  Desktop runtime has an additional native-pipe bootstrap path.

See [`QA-NOTES.md`](./QA-NOTES.md) for the implementation record and verified
runtime results.
