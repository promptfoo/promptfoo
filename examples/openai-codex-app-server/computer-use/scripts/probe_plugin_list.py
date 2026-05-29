#!/usr/bin/env python3
"""Install and verify Computer Use inside an isolated Codex home."""

from __future__ import annotations

import argparse
import json
import os
import select
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

PLUGIN_NAME = "computer-use"
PLUGIN_SKILL_NAME = "computer-use:computer-use"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex-home", required=True, type=Path)
    parser.add_argument("--codex-path", default="codex")
    parser.add_argument("--timeout", default=30.0, type=float)
    return parser.parse_args()


def request(process: subprocess.Popen[str], request_id: int, method: str, params: object) -> None:
    assert process.stdin is not None
    process.stdin.write(json.dumps({"id": request_id, "method": method, "params": params}) + "\n")
    process.stdin.flush()


def notify(process: subprocess.Popen[str], method: str, params: object) -> None:
    assert process.stdin is not None
    process.stdin.write(json.dumps({"method": method, "params": params}) + "\n")
    process.stdin.flush()


def read_response(process: subprocess.Popen[str], request_id: int, timeout: float) -> dict[str, Any]:
    assert process.stdout is not None
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        readable, _, _ = select.select([process.stdout], [], [], max(0, deadline - time.monotonic()))
        if not readable:
            break
        line = process.stdout.readline()
        if not line:
            break
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("id") == request_id:
            if "error" in message:
                raise RuntimeError(f"{request_id=} failed: {message['error']}")
            return message.get("result", {})
    raise TimeoutError(f"timed out waiting for JSON-RPC response {request_id}")


def find_plugin(result: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]] | None:
    for marketplace in result.get("marketplaces", []):
        for plugin in marketplace.get("plugins", []):
            if plugin.get("name") == PLUGIN_NAME:
                return marketplace, plugin
    return None


def find_mcp_server(result: dict[str, Any]) -> dict[str, Any] | None:
    for server in result.get("data", []):
        if server.get("name") == PLUGIN_NAME:
            return server
    return None


def main() -> None:
    args = parse_args()
    codex_home = args.codex_home.expanduser().resolve()
    env = {**os.environ, "CODEX_HOME": str(codex_home)}
    process = subprocess.Popen(
        [args.codex_path, "app-server", "--listen", "stdio://"],
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    next_request_id = 1

    def call(method: str, params: object) -> dict[str, Any]:
        nonlocal next_request_id
        request_id = next_request_id
        next_request_id += 1
        request(process, request_id, method, params)
        return read_response(process, request_id, args.timeout)

    try:
        call(
            "initialize",
            {
                "clientInfo": {
                    "name": "promptfoo_computer_use_probe",
                    "title": "Promptfoo Computer Use Plugin Probe",
                    "version": "1",
                },
                "capabilities": {"experimentalApi": True},
            },
        )
        notify(process, "initialized", {})
        effective_config = call("config/read", {"includeLayers": False}).get("config", {})
        configured_marketplaces = sorted(effective_config.get("marketplaces", {}).keys())
        result = call("plugin/list", {"marketplaceKinds": ["local"]})
        match = find_plugin(result)
        if match is None:
            raise RuntimeError(
                f"computer-use plugin was not discovered; configured marketplaces: "
                f"{configured_marketplaces!r}; plugin/list response: "
                + json.dumps(result, indent=2, sort_keys=True)
            )
        marketplace, plugin = match
        marketplace_name = marketplace.get("name", "<unnamed>")
        if plugin.get("installed") is not True:
            marketplace_path = marketplace.get("path")
            if not isinstance(marketplace_path, str) or not marketplace_path:
                raise RuntimeError(
                    f"computer-use plugin cannot be installed without a local marketplace path: "
                    f"{marketplace!r}"
                )
            call(
                "plugin/install",
                {"marketplacePath": marketplace_path, "pluginName": PLUGIN_NAME},
            )
            result = call("plugin/list", {"marketplaceKinds": ["local"]})
            match = find_plugin(result)
            if match is None:
                raise RuntimeError("computer-use plugin disappeared after plugin/install")
            marketplace, plugin = match
            marketplace_name = marketplace.get("name", "<unnamed>")
        if plugin.get("installed") is not True:
            raise RuntimeError(f"computer-use plugin is not installed: {plugin!r}")
        if plugin.get("enabled") is not True:
            raise RuntimeError(f"computer-use plugin is not enabled: {plugin!r}")
        marketplace_path = marketplace.get("path")
        detail = call(
            "plugin/read",
            {"marketplacePath": marketplace_path, "pluginName": PLUGIN_NAME},
        ).get("plugin", {})
        skill_names = sorted(skill.get("name") for skill in detail.get("skills", []))
        if PLUGIN_SKILL_NAME not in skill_names:
            raise RuntimeError(f"computer-use plugin does not expose its skill: {detail!r}")
        if PLUGIN_NAME not in detail.get("mcpServers", []):
            raise RuntimeError(f"computer-use plugin does not declare its MCP server: {detail!r}")
        mcp_server = find_mcp_server(
            call("mcpServerStatus/list", {"detail": "toolsAndAuthOnly"})
        )
        if mcp_server is None:
            raise RuntimeError("computer-use MCP server is not visible after plugin/install")
        tools = sorted(mcp_server.get("tools", {}))
        if not tools:
            raise RuntimeError("computer-use MCP server did not expose any tools")
        print(
            f"verified installed and enabled {PLUGIN_NAME!r} plugin in marketplace "
            f"{marketplace_name!r}; MCP tools: {', '.join(tools)}"
        )
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        if process.returncode not in (0, -15):
            assert process.stderr is not None
            stderr = process.stderr.read().strip()
            if stderr:
                print(stderr, file=sys.stderr)


if __name__ == "__main__":
    main()
