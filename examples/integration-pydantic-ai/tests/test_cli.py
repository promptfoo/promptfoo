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
from typing import ClassVar
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[3]


def fixture_environment(work: pathlib.Path, port: int) -> dict[str, str]:
    env = {
        key: value
        for key, value in os.environ.items()
        if key in ("PATH", "SYSTEMROOT", "LANG", "LC_ALL")
    }
    home = work / "home"
    home.mkdir()
    temporary = work / "tmp"
    temporary.mkdir()
    env_file = work / "empty.env"
    env_file.touch()
    for proxy in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        env[proxy] = env[proxy.lower()] = ""
    env["NO_PROXY"] = env["no_proxy"] = "*"
    env.update(
        HOME=str(home),
        USERPROFILE=str(home),
        TMPDIR=str(temporary),
        # envars loads defaults before main processes the explicit --env-file flag.
        DOTENV_PATH=str(env_file),
        PYTHONDONTWRITEBYTECODE="1",
        OPENAI_API_KEY="fixture-not-a-real-key",
        OPENAI_API_HOST="",
        OPENAI_API_BASE_URL=f"http://127.0.0.1:{port}/v1",
        OPENAI_BASE_URL=f"http://127.0.0.1:{port}/v1",
        PROMPTFOO_PYTHON=sys.executable,
        PROMPTFOO_CONFIG_DIR=str(work / "promptfoo"),
        PROMPTFOO_DISABLE_TELEMETRY="1",
        PROMPTFOO_DISABLE_UPDATE="1",
        PROMPTFOO_DISABLE_REMOTE_GENERATION="true",
        PROMPTFOO_PASS_RATE_THRESHOLD="100",
    )
    return env


class EnvironmentIsolationTests(unittest.TestCase):
    def test_parent_credentials_and_settings_are_not_inherited(self):
        parent = {
            "PATH": os.environ["PATH"],
            "ANTHROPIC_API_KEY": "synthetic-parent-key",
            "AWS_SECRET_ACCESS_KEY": "synthetic-parent-secret",
            "DOTENV_PATH": "/synthetic/parent.env",
            "DOTENV_CONFIG_PATH": "/synthetic/legacy.env",
            "DOTENV_OVERRIDE": "true",
            "DOTENV_CONFIG_OVERRIDE": "true",
            "NODE_OPTIONS": "--require=/synthetic/preload.cjs",
            "PROMPTFOO_PASS_RATE_THRESHOLD": "0",
            "HTTPS_PROXY": "http://synthetic.invalid",
        }
        with tempfile.TemporaryDirectory(prefix="promptfoo-pydantic-env-") as directory:
            work = pathlib.Path(directory)
            with patch.dict(os.environ, parent, clear=True):
                env = fixture_environment(work, 12345)
            for key in parent.keys() - {
                "PATH",
                "DOTENV_PATH",
                "HTTPS_PROXY",
                "PROMPTFOO_PASS_RATE_THRESHOLD",
            }:
                self.assertNotIn(key, env)
            self.assertEqual(pathlib.Path(env["DOTENV_PATH"]).read_text(), "")
            self.assertEqual(env["HOME"], str(work / "home"))
            self.assertEqual(env["USERPROFILE"], env["HOME"])
            self.assertEqual(env["HTTPS_PROXY"], "")
            self.assertEqual(env["PROMPTFOO_PASS_RATE_THRESHOLD"], "100")

    def test_import_time_defaults_cannot_override_fixture_settings(self):
        with tempfile.TemporaryDirectory(prefix="promptfoo-pydantic-env-") as directory:
            work = pathlib.Path(directory)
            checkout = work / "synthetic-checkout"
            checkout.mkdir()
            (checkout / ".env").write_text(
                "OPENAI_API_KEY=synthetic-checkout-key\n"
                "OPENAI_API_BASE_URL=https://fixture.invalid/v1\n"
                "PROMPTFOO_QA_SYNTHETIC_SECRET=synthetic-checkout-secret\n"
            )
            with patch.dict(os.environ, {"DOTENV_OVERRIDE": "true"}):
                env = fixture_environment(work, 12345)
            inspect_environment = (
                "import {pathToFileURL} from 'node:url'; "
                "await import(pathToFileURL(process.argv[1]).href); "
                "process.stdout.write(JSON.stringify({"
                "key: process.env.OPENAI_API_KEY, "
                "base: process.env.OPENAI_API_BASE_URL, "
                "secret: process.env.PROMPTFOO_QA_SYNTHETIC_SECRET ?? null}));"
            )
            command = [
                "node",
                "--import",
                str(ROOT / "node_modules/tsx/dist/loader.mjs"),
                "--input-type=module",
                "-e",
                inspect_environment,
                str(ROOT / "src/envars.ts"),
            ]
            result = subprocess.check_output(
                command, cwd=checkout, env=env, text=True, timeout=20
            )
            self.assertEqual(
                json.loads(result),
                {
                    "key": "fixture-not-a-real-key",
                    "base": "http://127.0.0.1:12345/v1",
                    "secret": None,
                },
            )

            # Prove the inherited override and implicit .env reproduced the old failure.
            del env["DOTENV_PATH"]
            env["DOTENV_OVERRIDE"] = "true"
            control = subprocess.check_output(
                command, cwd=checkout, env=env, text=True, timeout=20
            )
            self.assertEqual(
                json.loads(control),
                {
                    "key": "synthetic-checkout-key",
                    "base": "https://fixture.invalid/v1",
                    "secret": "synthetic-checkout-secret",
                },
            )


class ModelFixture(http.server.BaseHTTPRequestHandler):
    tool_calls: ClassVar[list[str]] = []

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
        ModelFixture.tool_calls = []
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), ModelFixture)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="promptfoo-pydantic-") as directory:
                work = pathlib.Path(directory)
                output = work / "eval.json"
                env = fixture_environment(work, server.server_port)
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
                        "--env-file",
                        env["DOTENV_PATH"],
                        "-j",
                        "1",
                        "-o",
                        str(output),
                    ],
                    cwd=ROOT,
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
