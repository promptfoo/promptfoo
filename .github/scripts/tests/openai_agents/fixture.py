"""Deterministic Responses wire fixtures; the actual SDK and tools still run."""

import json
import re


def text_content(item: dict) -> str:
    content = item.get("content", "")
    if isinstance(content, str):
        return content
    return "\n".join(part.get("text", "") for part in content)


class ResponsesFixture:
    def __init__(self, failure: str | None = None) -> None:
        self.failure = failure
        self.requests: list[dict] = []
        self.histories: list[list[dict]] = []
        self.tool_outputs: list[dict] = []
        self.sandbox_directories: set[str] = set()
        self.judges = 0
        self.sequence = 0

    def response(self, request: dict) -> dict:
        self.requests.append(request)
        self.sequence += 1
        assert request["model"] == "gpt-6-luna", request
        assert not request.get("stream"), "This example uses non-streaming Responses"
        tools = {tool.get("name", tool["type"]) for tool in request.get("tools", [])}
        if not tools:
            # The original goal-success assertion uses a real Promptfoo judge
            # provider, routed here too. This is wiring proof, not model quality.
            self.judges += 1
            output = self.message(
                json.dumps(
                    {"reason": "Fixture goal achieved", "score": 1, "pass": True}
                )
            )
        elif self.failure in ("failed", "incomplete", "refusal"):
            output = []
        else:
            output = self.next_output(request, tools)
        result = {
            "id": f"resp_fixture_{self.sequence}",
            "object": "response",
            "created_at": 1,
            "status": "completed",
            "error": None,
            "incomplete_details": None,
            "model": request["model"],
            "output": output,
            "parallel_tool_calls": False,
            "tool_choice": "auto",
            "tools": request.get("tools", []),
            "usage": {
                "input_tokens": 20,
                "input_tokens_details": {"cached_tokens": 3, "cache_write_tokens": 2},
                "output_tokens": 10,
                "output_tokens_details": {"reasoning_tokens": 2},
                "total_tokens": 30,
            },
        }
        if tools and self.failure == "failed":
            result.update(
                status="failed",
                error={
                    "code": "server_error",
                    "message": "Agents fixture failed response",
                },
            )
        elif tools and self.failure == "incomplete":
            result.update(
                status="incomplete", incomplete_details={"reason": "max_output_tokens"}
            )
        elif tools and self.failure == "refusal":
            result["output"] = [
                {
                    "type": "message",
                    "id": "msg_refusal",
                    "role": "assistant",
                    "status": "completed",
                    "content": [
                        {"type": "refusal", "refusal": "Agents fixture safety refusal"}
                    ],
                }
            ]
        return result

    def message(self, text: str) -> list[dict]:
        return [
            {
                "type": "message",
                "id": f"msg_{self.sequence}",
                "role": "assistant",
                "status": "completed",
                "content": [{"type": "output_text", "text": text, "annotations": []}],
            }
        ]

    def function(self, name: str, arguments: dict) -> list[dict]:
        return [
            {
                "type": "function_call",
                "id": f"fc_{self.sequence}",
                "call_id": f"call_{self.sequence}",
                "status": "completed",
                "name": name,
                "arguments": json.dumps(arguments),
            }
        ]

    def shell(self, command: str) -> list[dict]:
        return [
            {
                "type": "shell_call",
                "id": f"sh_{self.sequence}",
                "call_id": f"call_{self.sequence}",
                "status": "completed",
                "environment": {"type": "local"},
                "action": {
                    "commands": [command],
                    "timeout_ms": 10000,
                    "max_output_length": 20000,
                },
            }
        ]

    def next_output(self, request: dict, tools: set[str]) -> list[dict]:
        history = request["input"]
        assert isinstance(history, list), history
        user_index = max(
            index for index, item in enumerate(history) if item.get("role") == "user"
        )
        user = text_content(history[user_index])
        turn = history[user_index + 1 :]
        outputs = [
            item
            for item in turn
            if item.get("type") in ("function_call_output", "shell_call_output")
        ]
        self.tool_outputs.extend(outputs)
        calls = {
            item.get("name"): item
            for item in turn
            if item.get("type") == "function_call"
        }

        if "exec_command" in tools:
            commands = [
                json.loads(item["arguments"])["cmd"]
                for item in turn
                if item.get("name") == "exec_command"
            ]
            if not commands:
                return self.function(
                    "exec_command",
                    {
                        "cmd": "pwd; cat AGENTS.md repo/task.md repo/src/discount_policy.py",
                        "login": False,
                        "yield_time_ms": 10000,
                    },
                )
            if len(commands) == 1:
                assert "TICKET-014" in json.dumps(outputs), outputs
                directory = re.search(r"Output:\n(/[^\r\n]+)", outputs[-1]["output"])
                assert directory, outputs
                self.sandbox_directories.add(directory[1])
                return self.function(
                    "exec_command",
                    {
                        "cmd": "./bin/python -m unittest discover -s repo/tests",
                        "login": False,
                        "yield_time_ms": 10000,
                    },
                )
            assert "AssertionError" in json.dumps(outputs), outputs
            return self.message(
                "TICKET-014 high platform-integrations src/discount_policy.py: ./bin/python -m unittest discover -s repo/tests produced AssertionError. Minimal fix: return discount_percent >= 20"
            )

        if "shell" in tools:
            shell_calls = [item for item in turn if item.get("type") == "shell_call"]
            if not shell_calls:
                return self.shell("cat skills/discount-review/SKILL.md")
            if len(shell_calls) == 1:
                assert "analyze_discount_policy.py" in json.dumps(outputs), outputs
                return self.shell(
                    "python3 skills/discount-review/scripts/analyze_discount_policy.py skill_fixture/repo"
                )
            assert "TICKET-014" in json.dumps(outputs), outputs
            assert all(
                not chunk.get("stderr") for item in outputs for chunk in item["output"]
            ), outputs
            return self.message(
                "TICKET-014 high platform-integrations skill_fixture/repo/src/discount_policy.py. Helper: python3 skills/discount-review/scripts/analyze_discount_policy.py skill_fixture/repo. Minimal fix: return discount_percent >= 20"
            )

        latest = user.rsplit("Latest user message: ", 1)[-1]
        if (
            "Third-party booking change requested" in user
            or "Pending third-party" in user
        ):
            return self.message(
                "I cannot change another passenger's third-party booking; the passenger must contact support directly."
            )
        policy = "baggage" in latest.lower() or "wifi" in latest.lower()
        if policy:
            if "faq_lookup" not in tools:
                return self.function("transfer_to_faq_agent", {})
            if "faq_lookup" not in calls:
                if "baggage" in latest.lower():
                    self.histories.append(history)
                    prior = json.dumps(history[:user_index])
                    seat = "15D" if self.failure == "wrong-tool-args" else "14C"
                    for expected in (
                        "Ada Lovelace",
                        "Move me to seat 14C",
                        "lookup_reservation",
                        "update_seat",
                        f"Seat updated to {seat}",
                    ):
                        assert expected in prior, (expected, prior)
                return self.function("faq_lookup", {"question": latest})
            return self.message(str(outputs[-1]["output"]))
        if "lookup_reservation" not in tools:
            return self.function("transfer_to_seat_booking_agent", {})
        if "lookup_reservation" not in calls:
            return self.function(
                "lookup_reservation", {"confirmation_number": "ABC123"}
            )
        seat = re.search(r"Move me to seat (\d+[A-F])", latest)
        if seat and "update_seat" not in calls:
            requested = "15D" if self.failure == "wrong-tool-args" else seat[1]
            return self.function(
                "update_seat", {"confirmation_number": "ABC123", "new_seat": requested}
            )
        return self.message(str(outputs[-1]["output"]))
