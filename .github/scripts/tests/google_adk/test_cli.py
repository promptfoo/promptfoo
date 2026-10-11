"""Run the original ADK configs with real SDKs and loopback model fixtures."""

import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[4]
EXAMPLE = ROOT / "examples/integration-google-adk"


def isolated_environment_paths(work: Path) -> dict[str, str]:
    home = work / "home"
    state = home / ".local" / "state"
    state.mkdir(parents=True)
    temporary = work / "tmp"
    temporary.mkdir()
    env_file = work / "empty.env"
    env_file.touch()
    return {
        "HOME": str(home),
        "USERPROFILE": str(home),
        "XDG_STATE_HOME": str(state),
        "TMPDIR": str(temporary),
        # envars loads defaults before main processes the explicit --env-file flag.
        "DOTENV_PATH": str(env_file),
    }


class GoogleAdkCliTest(unittest.TestCase):
    backend = "gemini"
    cli = ("node", str(ROOT / "dist/src/entrypoint.js"))

    def test_import_time_defaults_cannot_reload_checkout_settings(self):
        with tempfile.TemporaryDirectory(prefix="promptfoo-adk-env-") as directory:
            work = Path(directory)
            checkout = work / "synthetic-checkout"
            checkout.mkdir()
            (checkout / ".env").write_text(
                "PROMPTFOO_QA_SYNTHETIC_SECRET=fixture-secret\n"
                "OPENAI_API_HOST=fixture.invalid/v1\n"
            )
            env = {"PATH": os.environ["PATH"], **isolated_environment_paths(work)}
            for key in ("HOME", "USERPROFILE", "XDG_STATE_HOME", "TMPDIR"):
                self.assertTrue(Path(env[key]).is_relative_to(work))
                self.assertTrue(Path(env[key]).is_dir())
            command = [
                "node",
                "--import",
                str(ROOT / "node_modules/tsx/dist/loader.mjs"),
                "--input-type=module",
                "-e",
                "import {pathToFileURL} from 'node:url'; "
                "await import(pathToFileURL(process.argv[1]).href); "
                "process.stdout.write(JSON.stringify({"
                "secret: process.env.PROMPTFOO_QA_SYNTHETIC_SECRET ?? null, "
                "host: process.env.OPENAI_API_HOST ?? null}));",
                str(ROOT / "src/envars.ts"),
            ]
            result = subprocess.check_output(
                command, cwd=checkout, env=env, text=True, timeout=20
            )
            self.assertEqual(json.loads(result), {"secret": None, "host": None})

            # The old startup defaults import both values from this same fixture.
            del env["DOTENV_PATH"]
            control = subprocess.check_output(
                command, cwd=checkout, env=env, text=True, timeout=20
            )
            self.assertEqual(
                json.loads(control),
                {"secret": "fixture-secret", "host": "fixture.invalid/v1"},
            )

    def run_configs(self, failure=None) -> None:
        requests = []
        recall_histories = []
        backend = self.backend

        class ModelFixture(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                expected_path = (
                    self.path.endswith(":generateContent")
                    if backend == "gemini"
                    else self.path == "/v1/chat/completions"
                )
                if not expected_path:
                    self.send_error(404)
                    return
                request = json.loads(
                    self.rfile.read(int(self.headers["Content-Length"]))
                )
                requests.append(request)
                if failure == "api-error":
                    self.respond(
                        {
                            "error": {
                                "code": 400,
                                "status": "INVALID_ARGUMENT",
                                "type": "invalid_request_error",
                                "message": "ADK fixture rejected request",
                            }
                        },
                        status=400,
                    )
                    return
                if backend == "gemini":
                    contents = request["contents"]
                    last_parts = contents[-1].get("parts", [])
                    text = " ".join(part.get("text", "") for part in last_parts)
                    instruction = json.dumps(request.get("systemInstruction", {}))
                    responses = [
                        part["functionResponse"]["response"]
                        for part in last_parts
                        if "functionResponse" in part
                    ]
                else:
                    contents = request["messages"]
                    text = contents[-1].get("content") or ""
                    instruction = " ".join(
                        item.get("content") or ""
                        for item in contents
                        if item["role"] in ("system", "developer")
                    )
                    responses = (
                        [json.loads(text)] if contents[-1]["role"] == "tool" else []
                    )
                city = "Tokyo" if "Tokyo" in json.dumps(contents) else "London"
                if failure == "wrong-tool-args":
                    city = "New York"
                if "packing" in instruction:
                    parts = [{"text": "Tokyo is clear and mild; pack a light jacket."}]
                elif responses:
                    response = responses[-1]
                    parts = [
                        {"text": response.get("report", f"{city} trip note saved.")}
                    ]
                elif "save" in text.lower():
                    parts = [
                        {
                            "functionCall": {
                                "name": "save_trip_note",
                                "args": {
                                    "city": city,
                                    "summary": "Cloudy with drizzle. Bring an umbrella.",
                                },
                            }
                        }
                    ]
                elif "earlier" in text.lower():
                    recall_histories.append(contents[:-1])
                    parts = [{"text": "We discussed London earlier."}]
                else:
                    parts = [
                        {
                            "functionCall": {
                                "name": "get_weather",
                                "args": {"city": city},
                            }
                        }
                    ]
                if backend == "gemini":
                    response = {
                        "candidates": [
                            {
                                "content": {"role": "model", "parts": parts},
                                "finishReason": "STOP",
                                "index": 0,
                            }
                        ],
                        "usageMetadata": {
                            "promptTokenCount": 10,
                            "candidatesTokenCount": 10,
                            "totalTokenCount": 20,
                        },
                        "modelVersion": "gemini-2.5-flash",
                    }
                else:
                    message = {"role": "assistant", "content": parts[0].get("text")}
                    if call := parts[0].get("functionCall"):
                        message["tool_calls"] = [
                            {
                                "id": f"call_{len(requests)}",
                                "type": "function",
                                "function": {
                                    "name": call["name"],
                                    "arguments": json.dumps(call["args"]),
                                },
                            }
                        ]
                    response = {
                        "id": f"chatcmpl-{len(requests)}",
                        "object": "chat.completion",
                        "created": 0,
                        "model": "gpt-5.4-mini",
                        "choices": [
                            {
                                "index": 0,
                                "message": message,
                                "finish_reason": (
                                    "tool_calls" if "tool_calls" in message else "stop"
                                ),
                            }
                        ],
                        "usage": {
                            "prompt_tokens": 10,
                            "completion_tokens": 10,
                            "total_tokens": 20,
                        },
                    }
                self.respond(response)

            def respond(self, response, status=200) -> None:
                body = json.dumps(response).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), ModelFixture)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="promptfoo-adk-test-") as temporary:
                work = Path(temporary)
                env = {
                    key: value
                    for key, value in os.environ.items()
                    if key in ("PATH", "SYSTEMROOT", "LANG", "LC_ALL")
                }
                env.update(isolated_environment_paths(work))
                # No inherited SDK credentials, model routing, proxies or trace exporters.
                for proxy in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
                    env[proxy] = env[proxy.lower()] = ""
                env["NO_PROXY"] = env["no_proxy"] = "*"
                env.update(
                    GOOGLE_API_KEY="local-test-key",
                    ADK_MODEL=(
                        "gemini-2.5-flash"
                        if backend == "gemini"
                        else "openai/gpt-5.4-mini"
                    ),
                    GOOGLE_GENAI_USE_VERTEXAI="false",
                    GOOGLE_GENAI_USE_ENTERPRISE="false",
                    PROMPTFOO_ENABLE_OTEL="false",
                    GOOGLE_GEMINI_BASE_URL=f"http://127.0.0.1:{server.server_port}",
                    OPENAI_API_KEY="local-test-key",
                    OPENAI_API_BASE=f"http://127.0.0.1:{server.server_port}/v1",
                    OPENAI_BASE_URL=f"http://127.0.0.1:{server.server_port}/v1",
                    LITELLM_LOCAL_MODEL_COST_MAP="True",
                    LITELLM_MODE="PRODUCTION",
                    PROMPTFOO_PYTHON=sys.executable,
                    PROMPTFOO_CONFIG_DIR=str(work / "promptfoo"),
                    PROMPTFOO_DISABLE_TELEMETRY="1",
                    PROMPTFOO_DISABLE_UPDATE="1",
                    PROMPTFOO_DISABLE_REMOTE_GENERATION="true",
                    PROMPTFOO_DISABLE_SHARING="true",
                    PROMPTFOO_PASS_RATE_THRESHOLD="100",
                )
                for name in ("promptfooconfig.yaml", "promptfooconfig.workflow.yaml"):
                    with self.subTest(config=name):
                        with socket.socket() as available:
                            available.bind(("127.0.0.1", 0))
                            trace_port = available.getsockname()[1]
                        # Preserve every original assertion; only relocate the provider
                        # and OTLP listener for this temporary evaluation.
                        config = yaml.safe_load((EXAMPLE / name).read_text())
                        provider = config["providers"][0]
                        entrypoint = provider["id"].rsplit(":", 1)[1]
                        provider["id"] = (
                            f"file://{EXAMPLE / 'provider.py'}:{entrypoint}"
                        )
                        provider["config"]["otlp_endpoint"] = (
                            f"http://127.0.0.1:{trace_port}"
                        )
                        config["tracing"]["otlp"]["http"]["port"] = trace_port
                        config_path = work / name
                        config_path.write_text(yaml.safe_dump(config))
                        output = work / f"{name}.json"
                        process = subprocess.Popen(
                            [
                                *self.cli,
                                "eval",
                                "-c",
                                str(config_path),
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
                            stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT,
                            text=True,
                            start_new_session=True,
                        )
                        try:
                            log, _ = process.communicate(timeout=180)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                            log, _ = process.communicate()
                            self.fail(f"{name} timed out:\n{log}")
                        self.assertTrue(output.is_file(), log)
                        data = json.loads(output.read_text())["results"]
                        self.assertEqual(len(data["results"]), 1)
                        row = data["results"][0]
                        if failure:
                            self.assertNotEqual(process.returncode, 0, log)
                            self.assertFalse(row["success"], row)
                            self.assertLess(row["score"], 1, row)
                            self.assertEqual(data["stats"]["successes"], 0)
                            if failure == "api-error":
                                self.assertEqual(row["score"], 0, row)
                                self.assertIn(
                                    "ADK fixture rejected request", row["error"]
                                )
                                self.assertEqual(data["stats"]["errors"], 1)
                            else:
                                self.assertFalse(row["response"].get("error"), row)
                                self.assertEqual(data["stats"]["failures"], 1)
                                self.assertEqual(data["stats"]["errors"], 0)
                                self.assertTrue(
                                    any(
                                        not item["pass"]
                                        and item["assertion"]["type"]
                                        == "trajectory:tool-args-match"
                                        for item in row["gradingResult"][
                                            "componentResults"
                                        ]
                                    ),
                                    row,
                                )
                            print(f"ADK {backend} {name}: {failure} rejected")
                            continue
                        self.assertEqual(process.returncode, 0, log)
                        self.assertEqual(data["stats"]["successes"], 1)
                        self.assertEqual(data["stats"]["failures"], 0)
                        self.assertEqual(data["stats"]["errors"], 0)
                        self.assertTrue(row["success"], row)
                        self.assertFalse(row.get("error"), row)
                        self.assertEqual(row["score"], 1, row)
                        components = row["gradingResult"]["componentResults"]
                        self.assertTrue(components, row)
                        self.assertTrue(
                            all(item["pass"] for item in components), components
                        )
                        payload = json.loads(row["response"]["output"])
                        self.assertTrue(payload["final_answer"], payload)
                        self.assertGreater(payload["event_count"], 0)
                        print(
                            f"ADK {backend} {name}: success=true score=1 errors=0; "
                            f"{len(components)} output/state/artifact/trace assertions passed"
                        )
                self.assertGreaterEqual(
                    len(requests), 2 if failure == "api-error" else 8
                )
                if failure != "api-error":
                    self.assertEqual(len(recall_histories), 1)
                    history = json.dumps(recall_histories[0])
                    for previous_turn in (
                        "What's the weather in London?",
                        "Save a short trip note for that city.",
                        "get_weather",
                        "save_trip_note",
                    ):
                        self.assertIn(previous_turn, history)
                if backend == "litellm":
                    for request in requests:
                        self.assertEqual(request["model"], "gpt-5.4-mini")
                        self.assertNotIn("max_tokens", request)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            self.assertFalse(thread.is_alive())

    def test_conversation_and_workflow(self) -> None:
        self.run_configs()

    def test_api_errors_are_not_successful_outputs(self) -> None:
        self.run_configs(failure="api-error")

    def test_wrong_tool_arguments_fail_original_trace_assertions(self) -> None:
        self.run_configs(failure="wrong-tool-args")


if __name__ == "__main__":
    unittest.main()
