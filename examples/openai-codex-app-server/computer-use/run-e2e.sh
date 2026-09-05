#!/usr/bin/env bash
set -euo pipefail
umask 077

EXAMPLE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TMP_DIR="$EXAMPLE_DIR/.tmp"
CODEX_HOME_DIR="$TMP_DIR/codex-home"
CODEX_HOME_MARKER="$CODEX_HOME_DIR/.promptfoo-computer-use-fixture"
WORKSPACE_DIR="$TMP_DIR/workspace"
TARGET_APP_DIR="$TMP_DIR/PromptfooComputerUseTarget.app"
TARGET_APP_BINARY="$TARGET_APP_DIR/Contents/MacOS/PromptfooComputerUseTarget"
PROMPTFOO_COMMAND=(npx promptfoo@latest)

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

for command in codex node ps xcrun; do
  require_command "$command"
done

if [[ -z "${OPENAI_API_KEY:-}" && -z "${CODEX_API_KEY:-}" ]]; then
  echo "Set OPENAI_API_KEY or CODEX_API_KEY; this isolated runner does not copy local Codex login state." >&2
  exit 1
fi

: "${COMPUTER_USE_PLUGIN_DIR:?Set COMPUTER_USE_PLUGIN_DIR to the installed Computer Use plugin directory.}"
if [[ ! -d "$COMPUTER_USE_PLUGIN_DIR" ]]; then
  echo "Computer Use plugin directory not found: $COMPUTER_USE_PLUGIN_DIR" >&2
  exit 1
fi

PLUGIN_DIR="$(cd -- "$COMPUTER_USE_PLUGIN_DIR" && pwd -P)"
node --input-type=module - "$PLUGIN_DIR" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const pluginDir = fs.realpathSync(process.argv[2]);
const manifestPath = path.join(pluginDir, '.codex-plugin/plugin.json');
const mcpPath = path.join(pluginDir, '.mcp.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.name !== 'computer-use') {
  throw new Error(`Expected computer-use plugin, found ${JSON.stringify(manifest.name)}`);
}

const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
const command = mcp.mcpServers?.['computer-use']?.command;
if (typeof command !== 'string' || command.length === 0) {
  throw new Error('Computer Use plugin has no MCP launcher');
}
const launcher = fs.realpathSync(path.resolve(pluginDir, command));
const relativeLauncher = path.relative(pluginDir, launcher);
if (relativeLauncher.startsWith('..') || path.isAbsolute(relativeLauncher)) {
  throw new Error('Computer Use MCP launcher must stay inside the plugin directory');
}
if (!fs.statSync(launcher).isFile() || (fs.statSync(launcher).mode & 0o111) === 0) {
  throw new Error('Computer Use MCP launcher must be an executable file');
}
NODE

if REPO_ROOT="$(git -C "$EXAMPLE_DIR" rev-parse --show-toplevel 2>/dev/null)" &&
  [[ "$EXAMPLE_DIR" == "$REPO_ROOT/examples/openai-codex-app-server/computer-use" ]] &&
  [[ "$(node -e 'process.stdout.write(require(process.argv[1]).name ?? "")' "$REPO_ROOT/package.json")" == "promptfoo" ]]; then
  LOCAL_ENTRYPOINT="$REPO_ROOT/node_modules/.bin/tsx"
  if [[ ! -x "$LOCAL_ENTRYPOINT" ]]; then
    echo "Promptfoo source dependencies are missing; run npm ci in $REPO_ROOT" >&2
    exit 1
  fi
  PROMPTFOO_COMMAND=("$LOCAL_ENTRYPOINT" "$REPO_ROOT/src/localEntrypoint.ts")
else
  require_command npx
fi

DISABLE_REMOTE_GENERATION=""
if (($# == 0)); then
  # The bundled config's redteam case is already materialized, so the default smoke
  # run must not depend on remote generation (or its email-verification prompt).
  # Custom commands keep remote grading available.
  DISABLE_REMOTE_GENERATION=true
  set -- eval \
    -c "$EXAMPLE_DIR/promptfooconfig.yaml" \
    --no-cache \
    --no-share \
    -o "$TMP_DIR/results.json"
fi

if [[ -L "$TMP_DIR" || (-e "$TMP_DIR" && ! -d "$TMP_DIR") ]]; then
  echo "Refusing unsafe generated-artifact path: $TMP_DIR" >&2
  exit 1
fi
mkdir -p "$TMP_DIR"
if [[ "$(cd -- "$TMP_DIR" && pwd -P)" != "$TMP_DIR" ]]; then
  echo "Refusing generated-artifact path outside the example: $TMP_DIR" >&2
  exit 1
fi
chmod 700 "$TMP_DIR"

# Keep Promptfoo's own state (database, logs, evalLastWritten) inside the disposable
# tree so red-team artifacts never land in the caller's ~/.promptfoo.
PROMPTFOO_STATE_DIR="$TMP_DIR/promptfoo-home"
mkdir -p "$PROMPTFOO_STATE_DIR"
chmod 700 "$PROMPTFOO_STATE_DIR"

# Register target-process cleanup before the first fallible Codex command so a failed
# preflight cannot leave a stale, intentionally vulnerable target running.
terminate_process() {
  local pid="${1:-}"
  if [[ -z "$pid" ]]; then
    return
  fi
  kill "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null || true
      return
    fi
    sleep 0.1
  done
  kill -9 "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

terminate_target_processes() {
  local command
  local pid
  while read -r pid command; do
    if [[ "$command" == "$TARGET_APP_BINARY" ]]; then
      terminate_process "$pid"
    fi
  done < <(ps -axo pid=,command=)
}

cleanup() {
  terminate_process "${TARGET_PID:-}"
  terminate_target_processes
}
trap cleanup EXIT

terminate_target_processes

if [[ -L "$CODEX_HOME_DIR" ]]; then
  echo "Refusing to replace symlinked Codex home: $CODEX_HOME_DIR" >&2
  exit 1
fi
if [[ -e "$CODEX_HOME_DIR" ]]; then
  if [[ ! -f "$CODEX_HOME_MARKER" || -L "$CODEX_HOME_MARKER" ]]; then
    echo "Refusing to replace unmarked Codex home: $CODEX_HOME_DIR" >&2
    exit 1
  fi
  rm -rf -- "$CODEX_HOME_DIR"
fi
mkdir -p "$CODEX_HOME_DIR"
chmod 700 "$CODEX_HOME_DIR"
printf '%s\n' 'generated by promptfoo computer-use example' >"$CODEX_HOME_MARKER"

MARKETPLACE_NAME="promptfoo-computer-use"
MARKETPLACE_ROOT="$CODEX_HOME_DIR/marketplace"
mkdir -p "$MARKETPLACE_ROOT/.agents/plugins" "$MARKETPLACE_ROOT/plugins"
ln -s "$PLUGIN_DIR" "$MARKETPLACE_ROOT/plugins/computer-use"
node --input-type=module - "$MARKETPLACE_ROOT/.agents/plugins/marketplace.json" <<'NODE'
import fs from 'node:fs';

const marketplace = {
  name: 'promptfoo-computer-use',
  interface: { displayName: 'Promptfoo Computer Use fixture' },
  plugins: [
    {
      name: 'computer-use',
      source: { source: 'local', path: './plugins/computer-use' },
    },
  ],
};
fs.writeFileSync(process.argv[2], `${JSON.stringify(marketplace, null, 2)}\n`);
NODE

isolated_codex() {
  env -i \
    CODEX_HOME="$CODEX_HOME_DIR" \
    HOME="${HOME:?HOME must be set}" \
    LANG="${LANG:-C}" \
    LOGNAME="${LOGNAME:-${USER:-}}" \
    PATH="$PATH" \
    SHELL="${SHELL:-/bin/bash}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    USER="${USER:-}" \
    codex "$@"
}

isolated_codex features enable plugins
isolated_codex plugin marketplace add --json "$MARKETPLACE_ROOT" \
  >"$TMP_DIR/marketplace-add.json"
isolated_codex plugin add --json "computer-use@$MARKETPLACE_NAME" \
  >"$TMP_DIR/plugin-add.json"
isolated_codex plugin list --json >"$TMP_DIR/plugin-list.json"

rm -rf -- "$WORKSPACE_DIR"
mkdir -p "$WORKSPACE_DIR"

rm -rf -- "$TARGET_APP_DIR"
mkdir -p \
  "$TARGET_APP_DIR/Contents/MacOS" \
  "$TMP_DIR/clang-module-cache" \
  "$TMP_DIR/swift-module-cache"
cp "$EXAMPLE_DIR/target/Info.plist" "$TARGET_APP_DIR/Contents/Info.plist"
CLANG_MODULE_CACHE_PATH="$TMP_DIR/clang-module-cache" \
  SWIFT_MODULE_CACHE_PATH="$TMP_DIR/swift-module-cache" \
  xcrun swiftc "$EXAMPLE_DIR/target/App.swift" -o "$TARGET_APP_BINARY"

"$TARGET_APP_BINARY" >"$TMP_DIR/target.log" 2>&1 &
TARGET_PID=$!
sleep 1
if ! kill -0 "$TARGET_PID" 2>/dev/null; then
  cat "$TMP_DIR/target.log" >&2
  exit 1
fi

(
  cd "$EXAMPLE_DIR"
  if [[ -n "$DISABLE_REMOTE_GENERATION" ]]; then
    export PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true
  fi
  CODEX_HOME_OVERRIDE="$CODEX_HOME_DIR" \
    COMPUTER_USE_WORKING_DIR="$WORKSPACE_DIR" \
    COMPUTER_USE_TARGET_APP="$TARGET_APP_DIR" \
    PROMPTFOO_CONFIG_DIR="$PROMPTFOO_STATE_DIR" \
    PROMPTFOO_DISABLE_TELEMETRY=true \
    PROMPTFOO_DISABLE_UPDATE=true \
    "${PROMPTFOO_COMMAND[@]}" "$@"
)
