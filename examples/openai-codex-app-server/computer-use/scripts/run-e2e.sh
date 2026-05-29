#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$EXAMPLE_DIR" rev-parse --show-toplevel)"
CODEX_HOME_DIR="$EXAMPLE_DIR/.tmp/codex-home"
TARGET_APP_DIR="$EXAMPLE_DIR/.tmp/PromptfooComputerUseTarget.app"
TARGET_APP_BINARY="$TARGET_APP_DIR/Contents/MacOS/PromptfooComputerUseTarget"

: "${COMPUTER_USE_PLUGIN_DIR:?Set COMPUTER_USE_PLUGIN_DIR to the installed Computer Use plugin directory.}"

mkdir -p "$EXAMPLE_DIR/.tmp"

python3 "$SCRIPT_DIR/stage_codex_home.py" \
  --plugin-dir "$COMPUTER_USE_PLUGIN_DIR" \
  --codex-home "$CODEX_HOME_DIR" \
  --force

python3 "$SCRIPT_DIR/probe_plugin_list.py" --codex-home "$CODEX_HOME_DIR"

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
  while IFS= read -r pid; do
    if [[ -z "$pid" ]]; then
      continue
    fi
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" == "$TARGET_APP_BINARY" ]]; then
      terminate_process "$pid"
    fi
  done < <(pgrep -f "$TARGET_APP_BINARY" || true)
}

cleanup() {
  terminate_process "${TARGET_PID:-}"
  terminate_target_processes
}
trap cleanup EXIT

terminate_target_processes
rm -rf -- "$TARGET_APP_DIR"
mkdir -p \
  "$TARGET_APP_DIR/Contents/MacOS" \
  "$EXAMPLE_DIR/.tmp/clang-module-cache" \
  "$EXAMPLE_DIR/.tmp/swift-module-cache"
cp "$EXAMPLE_DIR/target/Info.plist" "$TARGET_APP_DIR/Contents/Info.plist"
CLANG_MODULE_CACHE_PATH="$EXAMPLE_DIR/.tmp/clang-module-cache" \
SWIFT_MODULE_CACHE_PATH="$EXAMPLE_DIR/.tmp/swift-module-cache" \
  xcrun swiftc "$EXAMPLE_DIR/target/App.swift" -o "$TARGET_APP_BINARY"

"$TARGET_APP_BINARY" >"$EXAMPLE_DIR/.tmp/target.log" 2>&1 &
TARGET_PID=$!
sleep 1
if ! kill -0 "$TARGET_PID" 2>/dev/null; then
  cat "$EXAMPLE_DIR/.tmp/target.log" >&2
  exit 1
fi

CODEX_HOME_OVERRIDE="$CODEX_HOME_DIR" \
COMPUTER_USE_TARGET_APP="$TARGET_APP_DIR" \
PROMPTFOO_DISABLE_TELEMETRY=true \
PROMPTFOO_DISABLE_UPDATE=true \
npm --prefix "$REPO_ROOT" run local -- eval \
  -c "$EXAMPLE_DIR/promptfooconfig.yaml" \
  --no-cache \
  --no-share \
  -o "$EXAMPLE_DIR/.tmp/results.json"
