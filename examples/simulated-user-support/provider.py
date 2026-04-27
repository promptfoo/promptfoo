import json
import os
import time
from pathlib import Path
from typing import Any

THIS_DIR = Path(__file__).resolve().parent
import sys

if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

import agent
import simulated_user
import tools
from seeds import init_state, scenario_config

DEFAULT_MAX_TURNS = 12
TURN_TIMEOUT_SECONDS = 90
OVERALL_TIMEOUT_SECONDS = 8 * 60


def call_api(prompt: str, options: dict, context: dict) -> dict:
    config = options.get("config", {}) if options else {}
    vars_ = (context or {}).get("vars") or (context or {}).get("test", {}).get("vars", {}) or {}
    scenario_id = vars_.get("scenario_id") or config.get("scenario_id") or "A"
    scenario = scenario_config(scenario_id)
    persona = vars_.get("persona") or scenario["persona"]
    hidden_goal = vars_.get("hidden_goal") or scenario["hidden_goal"]
    agent_model = vars_.get("agent_model") or config.get("agent_model")
    user_model = vars_.get("user_model") or config.get("user_model")
    max_turns = int(vars_.get("max_turns") or config.get("max_turns") or DEFAULT_MAX_TURNS)

    started = time.monotonic()
    state = init_state(scenario_id)
    history: list[dict[str, Any]] = []
    tool_log: list[dict[str, Any]] = []
    token_usage = {"total": 0, "prompt": 0, "completion": 0}
    done = False
    turns = 0

    user_msg = simulated_user.open(scenario_id, persona, hidden_goal)
    history.append({"role": "user", "content": user_msg})

    for turn in range(max_turns):
        turns = turn + 1
        _check_timeout(started)
        turn_started = time.monotonic()
        assistant_msg, tool_calls = agent.respond(history, model=agent_model)
        if time.monotonic() - turn_started > TURN_TIMEOUT_SECONDS:
            raise TimeoutError(f"Agent turn exceeded {TURN_TIMEOUT_SECONDS}s")

        assistant_entry = {
            "role": "assistant",
            "content": assistant_msg,
            "tool_calls": [{"id": tc.id, "name": tc.name, "args": tc.args} for tc in tool_calls],
        }
        history.append(assistant_entry)

        if tool_calls:
            for tc in tool_calls:
                result = tools.dispatch(tc.name, tc.args, state)
                tool_log.append({"name": tc.name, "args": tc.args, "result": result})
                history.append({"role": "tool", "tool_use_id": tc.id, "name": tc.name, "content": json.dumps(result)})
            continue

        _check_timeout(started)
        user_reply, done = simulated_user.respond(scenario_id, persona, hidden_goal, history, model=user_model)
        history.append({"role": "user", "content": user_reply})
        if done:
            break

    metadata = {
        "scenario_id": scenario_id,
        "tool_log": tool_log,
        "final_state": state,
        "turns": turns,
        "user_satisfied": done,
        "agent_model": agent_model or os.getenv("SIMUSER_AGENT_MODEL"),
        "user_model": user_model or os.getenv("SIMUSER_USER_MODEL"),
        "provider": os.getenv("SIMUSER_PROVIDER", "anthropic"),
    }
    output = render_transcript(history) + "\n\n=== SIMUSER_METADATA ===\n" + json.dumps(metadata, indent=2, sort_keys=True)
    return {"output": output, "metadata": metadata, "tokenUsage": token_usage}


def _check_timeout(started: float) -> None:
    if time.monotonic() - started > OVERALL_TIMEOUT_SECONDS:
        raise TimeoutError(f"Simulated-user evaluation exceeded {OVERALL_TIMEOUT_SECONDS}s")


def render_transcript(history: list[dict[str, Any]]) -> str:
    lines = ["=== Simulated support transcript ==="]
    for item in history:
        role = item.get("role")
        if role == "user":
            if item.get("content"):
                lines.append(f"Customer: {item['content']}")
        elif role == "assistant":
            content = item.get("content") or ""
            calls = item.get("tool_calls") or []
            if content:
                lines.append(f"Agent: {content}")
            for call in calls:
                lines.append(f"Agent tool call: {call['name']}({json.dumps(call['args'], sort_keys=True)})")
        elif role == "tool":
            lines.append(f"Tool result ({item.get('name')}): {item.get('content')}")
    return "\n".join(lines)


if __name__ == "__main__":
    os.environ.setdefault("SIMUSER_PROVIDER", "stub")
    print(call_api("", {}, {"vars": {"scenario_id": os.getenv("SCENARIO_ID", "A")}})["output"])
