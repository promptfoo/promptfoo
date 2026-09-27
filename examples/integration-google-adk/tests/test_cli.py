"""Run both ADK examples with real SDKs and a loopback Gemini fixture."""

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

ROOT = Path(__file__).resolve().parents[3]
EXAMPLE = ROOT / "examples/integration-google-adk"


class GoogleAdkCliTest(unittest.TestCase):
    def test_conversation_and_workflow(self) -> None:
        requests = []

        class GeminiFixture(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                if not self.path.endswith(":generateContent"):
                    self.send_error(404)
                    return
                request = json.loads(
                    self.rfile.read(int(self.headers["Content-Length"]))
                )
                requests.append(request)
                contents = request.get("contents", [])
                last_parts = contents[-1].get("parts", [])
                text = " ".join(part.get("text", "") for part in last_parts)
                instruction = json.dumps(request.get("systemInstruction", {}))
                city = "Tokyo" if "Tokyo" in json.dumps(contents) else "London"
                responses = [
                    part["functionResponse"]
                    for part in last_parts
                    if "functionResponse" in part
                ]
                if "packing" in instruction:
                    parts = [{"text": "Tokyo is clear and mild; pack a light jacket."}]
                elif responses:
                    response = responses[-1]["response"]
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
                body = json.dumps(
                    {
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
                ).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), GeminiFixture)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="promptfoo-adk-test-") as temporary:
                work = Path(temporary)
                env = {
                    key: value
                    for key, value in os.environ.items()
                    if not key.startswith(("GOOGLE_", "GEMINI_", "ADK_", "OTEL_"))
                    and key.lower() not in ("all_proxy", "http_proxy", "https_proxy")
                }
                # Empty values prevent implicit dotenv from restoring proxies.
                for proxy in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
                    env[proxy] = env[proxy.lower()] = ""
                env["NO_PROXY"] = env["no_proxy"] = "*"
                env.update(
                    GOOGLE_API_KEY="local-test-key",
                    # Existing values also prevent root dotenv from changing routing.
                    ADK_MODEL="gemini-2.5-flash",
                    GOOGLE_GENAI_USE_VERTEXAI="false",
                    GOOGLE_GENAI_USE_ENTERPRISE="false",
                    PROMPTFOO_ENABLE_OTEL="false",
                    GOOGLE_GEMINI_BASE_URL=f"http://127.0.0.1:{server.server_port}",
                    PROMPTFOO_PYTHON=sys.executable,
                    PROMPTFOO_CONFIG_DIR=str(work / "promptfoo"),
                    PROMPTFOO_DISABLE_TELEMETRY="1",
                    PROMPTFOO_DISABLE_UPDATE="1",
                    PROMPTFOO_DISABLE_REMOTE_GENERATION="true",
                )
                for name in ("promptfooconfig.yaml", "promptfooconfig.workflow.yaml"):
                    with self.subTest(config=name):
                        with socket.socket() as available:
                            available.bind(("127.0.0.1", 0))
                            trace_port = available.getsockname()[1]
                        # Preserve every original assertion; only relocate the provider
                        # and OTLP listener for this temporary evaluation.
                        config = (
                            (EXAMPLE / name)
                            .read_text()
                            .replace(
                                "file://provider.py",
                                f"file://{EXAMPLE / 'provider.py'}",
                            )
                        )
                        config = config.replace(
                            "localhost:4318", f"127.0.0.1:{trace_port}"
                        )
                        config = config.replace("port: 4318", f"port: {trace_port}")
                        config_path = work / name
                        config_path.write_text(config)
                        output = work / f"{name}.json"
                        process = subprocess.Popen(
                            [
                                "npm",
                                "run",
                                "local",
                                "--",
                                "eval",
                                "-c",
                                str(config_path),
                                "--no-cache",
                                "--no-share",
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
                        self.assertEqual(process.returncode, 0, log)
                        data = json.loads(output.read_text())["results"]
                        self.assertEqual(data["stats"]["successes"], 1)
                        self.assertEqual(data["stats"]["failures"], 0)
                        self.assertEqual(data["stats"]["errors"], 0)
                        self.assertEqual(len(data["results"]), 1)
                        row = data["results"][0]
                        self.assertTrue(row["success"], row)
                        self.assertFalse(row.get("error"), row)
                        self.assertEqual(row["score"], 1, row)
                        components = row["gradingResult"]["componentResults"]
                        self.assertTrue(components, row)
                        self.assertTrue(
                            all(item["pass"] for item in components), components
                        )
                self.assertGreaterEqual(len(requests), 8)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
