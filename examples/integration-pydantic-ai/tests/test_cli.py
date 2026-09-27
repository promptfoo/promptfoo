"""Exercise the installed PydanticAI SDK and example with a local model transport."""

import http.server
import json
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import threading
import unittest


class ModelFixture(http.server.BaseHTTPRequestHandler):
    tool_calls = []

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path.endswith("/chat/completions"):
            # The original example also grades the Tokyo response via llm-rubric.
            payload = {
                "id": "fixture-judge",
                "object": "chat.completion",
                "created": 1,
                "model": request["model"],
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(
                                {"pass": True, "score": 1, "reason": "Local fixture"}
                            ),
                        },
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 10,
                    "total_tokens": 20,
                },
            }
        else:
            inputs = request.get("input", [])
            prompt = json.dumps(inputs).lower()
            city = (
                "New York"
                if "new york" in prompt
                else ("Tokyo" if "tokyo" in prompt else "London")
            )
            result = next(
                (
                    item
                    for item in reversed(inputs)
                    if isinstance(item, dict)
                    and item.get("type") == "function_call_output"
                ),
                None,
            )
            if result is None:
                name, arguments = "get_weather", {"location": city}
                self.tool_calls.append(city)
            else:
                # Feed the real weather tool's result into PydanticAI's structured-output tool.
                name = "final_result"
                arguments = result["output"]
                if isinstance(arguments, str):
                    arguments = json.loads(arguments)
            payload = {
                "id": "resp_" + name,
                "object": "response",
                "created_at": 1,
                "status": "completed",
                "model": request["model"],
                "output": [
                    {
                        "id": "fc_" + name,
                        "type": "function_call",
                        "status": "completed",
                        "call_id": "call_" + name,
                        "name": name,
                        "arguments": json.dumps(arguments),
                    }
                ],
                "parallel_tool_calls": True,
                "tool_choice": "auto",
                "tools": request.get("tools", []),
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 10,
                    "total_tokens": 20,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens_details": {"reasoning_tokens": 0},
                },
            }
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


class ExampleCliTests(unittest.TestCase):
    def test_real_sdk_runs_tools_and_returns_structured_weather(self):
        repo = pathlib.Path(__file__).resolve().parents[3]
        ModelFixture.tool_calls = []
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), ModelFixture)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="promptfoo-pydantic-") as directory:
                output = pathlib.Path(directory) / "eval.json"
                env = {
                    key: value
                    for key, value in os.environ.items()
                    if not key.lower().endswith("_proxy")
                    and not key.startswith(
                        ("OPENAI_", "ANTHROPIC_", "AZURE_", "GOOGLE_")
                    )
                }
                env.update(
                    OPENAI_API_KEY="fixture-not-a-real-key",
                    OPENAI_BASE_URL=f"http://127.0.0.1:{server.server_port}/v1",
                    PROMPTFOO_PYTHON=sys.executable,
                    PROMPTFOO_CONFIG_DIR=str(pathlib.Path(directory) / "promptfoo"),
                    PROMPTFOO_DISABLE_TELEMETRY="1",
                    PROMPTFOO_DISABLE_REMOTE_GENERATION="true",
                )
                process = subprocess.Popen(
                    [
                        "npm",
                        "run",
                        "local",
                        "--",
                        "eval",
                        "-c",
                        "examples/integration-pydantic-ai/promptfooconfig.yaml",
                        "--no-cache",
                        "--no-share",
                        "-j",
                        "1",
                        "-o",
                        str(output),
                    ],
                    cwd=repo,
                    env=env,
                    start_new_session=True,
                )
                try:
                    process.wait(timeout=120)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                    raise
                self.assertEqual(process.returncode, 0)
                data = json.loads(output.read_text())["results"]
                self.assertEqual(data["stats"]["errors"], 0)
                rows = data["results"]
                self.assertEqual(len(rows), 3)
                expected = {"London": "18°C", "New York": "22°C", "Tokyo": "16°C"}
                for row in rows:
                    self.assertTrue(row["success"], row)
                    self.assertEqual(row["score"], 1, row)
                    self.assertFalse(row.get("error"), row)
                    weather = row["response"]["output"]
                    self.assertEqual(
                        weather["temperature"], expected[weather["location"]]
                    )
                self.assertCountEqual(ModelFixture.tool_calls, expected.keys())
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
