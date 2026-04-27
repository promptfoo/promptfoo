"""Azure OpenAI Agents SDK provider for the Toolathlon PoC."""

from __future__ import annotations

import asyncio
import json
import os
import traceback
from pathlib import Path
from typing import Any

from agents import Agent, ModelSettings, Runner, trace
from agents.mcp import MCPServerStdio
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel
from openai import AsyncAzureOpenAI
from promptfoo_tracing import configure_promptfoo_tracing

SYSTEM_PROMPT = (
    "You are a careful operations agent. Use the filesystem and sqlite tools to "
    "complete the user's task. Verify your work."
)
DEFAULT_AZURE_API_VERSION = "2025-04-01-preview"
DEFAULT_AZURE_DEPLOYMENT = "gpt-5.5"


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _serialize(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _serialize(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return _serialize(value.model_dump(mode="json"))
    if hasattr(value, "__dict__"):
        return _serialize(
            {
                key: item
                for key, item in vars(value).items()
                if not key.startswith("_") and key not in {"agent"}
            }
        )
    return str(value)


def _json_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(_serialize(value), ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(value)


def _field(value: Any, *names: str) -> Any:
    for name in names:
        if isinstance(value, dict) and name in value:
            return value[name]
        if hasattr(value, name):
            return getattr(value, name)
    return None


def _extract_token_usage(raw_responses: list[Any]) -> dict[str, int]:
    usage = {"total": 0, "prompt": 0, "completion": 0}
    for response in raw_responses:
        response_usage = getattr(response, "usage", None)
        if response_usage is None:
            continue
        usage["total"] += int(getattr(response_usage, "total_tokens", 0) or 0)
        usage["prompt"] += int(
            getattr(response_usage, "input_tokens", None)
            or getattr(response_usage, "prompt_tokens", 0)
            or 0
        )
        usage["completion"] += int(
            getattr(response_usage, "output_tokens", None)
            or getattr(response_usage, "completion_tokens", 0)
            or 0
        )
    return usage


def _tool_calls_from_items(items: list[Any]) -> list[dict[str, Any]]:
    tool_calls_by_id: dict[str, dict[str, Any]] = {}
    tool_calls_without_id: list[dict[str, Any]] = []
    for item in items:
        item_type = getattr(item, "type", None)
        if item_type not in {"tool_call_item", "tool_call_output_item"}:
            continue
        raw_item = getattr(item, "raw_item", None)
        origin = getattr(item, "tool_origin", None)
        call_id = _field(raw_item, "call_id", "id") or _field(item, "call_id", "id")
        record = (
            tool_calls_by_id.setdefault(str(call_id), {})
            if call_id
            else {}
        )
        record.setdefault("origin", _serialize(origin))
        record.setdefault("raw", _serialize(raw_item))
        name = (
            _field(raw_item, "name", "tool_name")
            or _field(origin, "tool_name", "agent_tool_name", "name")
        )
        arguments = _field(raw_item, "arguments", "input")
        if name is not None:
            record["name"] = name
        if arguments is not None:
            record["arguments"] = arguments
        if item_type == "tool_call_output_item":
            record["output"] = _serialize(getattr(item, "output", None))
        if call_id is None:
            tool_calls_without_id.append(record)

    return [
        {"call_id": call_id, **record}
        for call_id, record in tool_calls_by_id.items()
    ] + tool_calls_without_id


def _trace_kwargs(
    *, workflow_name: str, session_id: str, tracing_context: Any
) -> dict[str, Any]:
    trace_kwargs: dict[str, Any] = {
        "workflow_name": workflow_name,
        "group_id": session_id,
        "metadata": {"conversation_id": session_id, "workflow.kind": "toolathlon-mcp"},
    }
    if tracing_context is not None:
        trace_kwargs["trace_id"] = tracing_context.sdk_trace_id
        trace_kwargs["metadata"]["evaluation.id"] = tracing_context.evaluation_id
        trace_kwargs["metadata"]["test.case.id"] = tracing_context.test_case_id
    return trace_kwargs


def _session_id(context: dict[str, Any]) -> str:
    evaluation_id = context.get("evaluationId", "local-eval")
    test_case_id = context.get("testCaseId", "default-test")
    repeat_index = context.get("repeatIndex")
    if repeat_index is None:
        return f"toolathlon-azure-{evaluation_id}-{test_case_id}"
    return f"toolathlon-azure-{evaluation_id}-{test_case_id}-repeat-{repeat_index}"


async def _run_agent(prompt: str, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    config = options.get("config", {})
    workspace = Path(_require_env("PROMPTFOO_TOOLATHLON_WORKSPACE")).resolve()
    db_path = Path(_require_env("PROMPTFOO_TOOLATHLON_DB")).resolve()
    if not workspace.exists():
        raise ValueError(f"Workspace does not exist: {workspace}")
    if not db_path.exists():
        raise ValueError(f"SQLite database does not exist: {db_path}")

    deployment = str(config.get("azure_deployment") or DEFAULT_AZURE_DEPLOYMENT)
    api_version = str(config.get("azure_api_version") or DEFAULT_AZURE_API_VERSION)
    max_turns = int(config.get("max_turns", 20))
    session_id = _session_id(context)

    tracing_context = configure_promptfoo_tracing(
        context=context,
        otlp_endpoint=str(config.get("otlp_endpoint", "http://localhost:4318")),
    )

    client = AsyncAzureOpenAI(
        api_key=_require_env("AZURE_API_KEY"),
        azure_endpoint=_require_env("AZURE_API_BASE").rstrip("/"),
        api_version=api_version,
    )
    model = OpenAIChatCompletionsModel(model=deployment, openai_client=client)

    fs_server = MCPServerStdio(
        {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", str(workspace)],
        },
        cache_tools_list=True,
        name="filesystem",
        client_session_timeout_seconds=30,
    )
    sqlite_server = MCPServerStdio(
        {
            "command": "uvx",
            "args": ["mcp-server-sqlite", "--db-path", str(db_path)],
        },
        cache_tools_list=True,
        name="sqlite",
        client_session_timeout_seconds=30,
    )

    task_prompt = (
        f"Workspace path: {workspace}\n"
        f"SQLite database path: {db_path}\n"
        "When the user refers to /workspace, use the workspace path above.\n\n"
        f"{prompt}"
    )

    async with fs_server, sqlite_server:
        agent = Agent(
            name="Toolathlon Azure Operations Agent",
            instructions=SYSTEM_PROMPT,
            model=model,
            model_settings=ModelSettings(include_usage=True, tool_choice="auto"),
            mcp_servers=[fs_server, sqlite_server],
        )
        with trace(
            **_trace_kwargs(
                workflow_name="Toolathlon Azure MCP PoC",
                session_id=session_id,
                tracing_context=tracing_context,
            )
        ):
            result = await Runner.run(agent, task_prompt, max_turns=max_turns)

    final_output = _json_text(result.final_output)
    tool_calls = _tool_calls_from_items(list(result.new_items))
    metadata = {
        "turns": len(getattr(result, "raw_responses", []) or []),
        "tool_calls": tool_calls,
        "toolCalls": tool_calls,
        "model": deployment,
        "azure_api_version": api_version,
        "workspace": str(workspace),
        "database": str(db_path),
        "last_agent": getattr(getattr(result, "last_agent", None), "name", None),
    }
    return {
        "output": final_output,
        "metadata": metadata,
        "tokenUsage": _extract_token_usage(list(getattr(result, "raw_responses", []) or [])),
    }


def call_api(prompt: str, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Run the Toolathlon task through Azure-hosted gpt-5.5 and local MCP servers."""
    try:
        return asyncio.run(_run_agent(prompt, options, context))
    except Exception as exc:
        traceback.print_exc()
        return {"error": f"{type(exc).__name__}: {exc}", "output": f"Error: {exc}"}
