"""Exercise every original OpenAI Agents eval case with real SDKs over HTTP."""

import asyncio
import importlib.metadata
import io
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from fixture import ResponsesFixture

ROOT = Path(__file__).resolve().parents[4]
EXAMPLE = ROOT / "examples/openai-agents"

# Node's existing yaml dependency avoids introducing a Python runtime dependency.
RELOCATE_CONFIG = """
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
const [source, example, port, endpoint] = process.argv.slice(1);
const config = yaml.parse(fs.readFileSync(source, 'utf8'));
for (const provider of config.providers) {
  const entrypoint = provider.id.split(':').at(-1);
  provider.id = `file://${path.join(example, 'agent_provider.py')}:${entrypoint}`;
  provider.config.otlp_endpoint = endpoint;
}
config.tracing.otlp.http.port = Number(port);
process.stdout.write(JSON.stringify(config));
"""


def isolated_environment_paths(work: Path) -> dict[str, str]:
    home = work / "home"
    home.mkdir()
    temporary = work / "tmp"
    temporary.mkdir()
    env_file = work / "empty.env"
    env_file.touch()
    return {
        "HOME": str(home),
        "USERPROFILE": str(home),
        "XDG_STATE_HOME": str(home / ".local" / "state"),
        "TMPDIR": str(temporary),
        # envars loads defaults before main processes the explicit --env-file flag.
        "DOTENV_PATH": str(env_file),
    }


class EnvironmentIsolationTests(unittest.TestCase):
    def test_import_time_defaults_cannot_reload_checkout_settings(self):
        with tempfile.TemporaryDirectory(prefix="promptfoo-agents-env-") as directory:
            work = Path(directory)
            checkout = work / "synthetic-checkout"
            checkout.mkdir()
            (checkout / ".env").write_text(
                "PROMPTFOO_QA_SYNTHETIC_SECRET=fixture-secret\n"
                "OPENAI_API_HOST=fixture.invalid/v1\n"
            )
            env = {"PATH": os.environ["PATH"], **isolated_environment_paths(work)}
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

            # Prove this fixture catches the original eager-loading failure.
            del env["DOTENV_PATH"]
            control = subprocess.check_output(
                command, cwd=checkout, env=env, text=True, timeout=20
            )
            self.assertEqual(
                json.loads(control),
                {"secret": "fixture-secret", "host": "fixture.invalid/v1"},
            )

    def test_sdk_snapshots_are_removed_with_the_temporary_workspace(self):
        from agents.sandbox.snapshot import LocalSnapshot
        from agents.sandbox.snapshot_defaults import default_local_snapshot_base_dir

        with tempfile.TemporaryDirectory(prefix="promptfoo-agents-state-") as directory:
            work = Path(directory)
            env = isolated_environment_paths(work)
            with patch.dict(os.environ, env, clear=True):
                self.assertEqual(Path.home(), work / "home")
                self.assertEqual(Path(os.environ["USERPROFILE"]), work / "home")
                base = default_local_snapshot_base_dir()
                self.assertTrue(base.is_relative_to(work))
                snapshot = LocalSnapshot(id="fixture-snapshot", base_path=base)
                asyncio.run(snapshot.persist(io.BytesIO(b"synthetic snapshot")))
            artifact = base / "fixture-snapshot.tar"
            self.assertEqual(artifact.read_bytes(), b"synthetic snapshot")
        self.assertFalse(artifact.exists())


class OpenAIAgentsCliTest(unittest.TestCase):
    cli = ("node", str(ROOT / "dist/src/entrypoint.js"))

    def run_config(self, failure: str | None = None) -> None:
        fixture = ResponsesFixture(failure)
        errors = []
        exports = []
        with socket.socket() as available:
            available.bind(("127.0.0.1", 0))
            trace_port = available.getsockname()[1]

        class Handler(BaseHTTPRequestHandler):
            def read_payload(self):
                self.connection.settimeout(10)
                if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
                    chunks = []
                    size = int(self.rfile.readline().split(b";", 1)[0], 16)
                    total = 0
                    while size:
                        total += size
                        assert 0 < size <= total <= 8 * 1024 * 1024
                        chunks.append(self.rfile.read(size))
                        assert self.rfile.read(2) == b"\r\n"
                        size = int(self.rfile.readline().split(b";", 1)[0], 16)
                    while self.rfile.readline() not in (b"", b"\r\n"):
                        pass
                    return b"".join(chunks)
                size = int(self.headers.get("Content-Length", "0"))
                assert 0 <= size <= 8 * 1024 * 1024
                return self.rfile.read(size)

            def do_POST(self):
                try:
                    payload = self.read_payload()
                    if self.path == "/node-spans":
                        # Node already writes these spans to its local store. Keep
                        # its optional external exporter local without duplicating
                        # spans or confusing them with Python-wrapper protobuf.
                        assert "resourceSpans" in json.loads(payload)
                        self.respond(b"{}")
                        return
                    if self.path == "/v1/traces":
                        content_type = self.headers["Content-Type"]
                        exports.append((content_type, payload))
                        request = urllib.request.Request(
                            f"http://127.0.0.1:{trace_port}/v1/traces",
                            data=payload,
                            headers={"Content-Type": content_type},
                            method="POST",
                        )
                        # Do not inherit host proxy settings, including in this parent.
                        opener = urllib.request.build_opener(
                            urllib.request.ProxyHandler({})
                        )
                        with opener.open(request, timeout=10) as response:
                            self.respond(
                                response.read(),
                                response.status,
                                response.headers["Content-Type"],
                            )
                        return
                    assert self.path == "/v1/responses", self.path
                    assert self.headers.get("Authorization") == "Bearer local-test-key"
                    if failure == "api-error":
                        self.respond(
                            json.dumps(
                                {
                                    "error": {
                                        "message": "Agents fixture rejected request",
                                        "type": "invalid_request_error",
                                        "code": "fixture_error",
                                    }
                                }
                            ).encode(),
                            400,
                        )
                        return
                    response = fixture.response(json.loads(payload))
                    self.respond(json.dumps(response).encode())
                except Exception as exc:
                    errors.append(f"{self.path}: {exc!r}")
                    self.respond(
                        json.dumps({"error": {"message": str(exc)}}).encode(), 400
                    )

            def respond(self, payload, status=200, content_type="application/json"):
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(
                prefix="promptfoo-agents-cli-"
            ) as temporary:
                work = Path(temporary)
                # Each provider owns a SQLite file beside its source. Copy the actual
                # example so profiles never share a database or write into the checkout.
                example = work / "example"
                shutil.copytree(
                    EXAMPLE,
                    example,
                    ignore=shutil.ignore_patterns(
                        "*.sqlite3*", "__pycache__", ".venv", ".env", ".env.*"
                    ),
                )
                try:
                    importlib.metadata.version("opentelemetry-sdk")
                    optional = True
                except importlib.metadata.PackageNotFoundError:
                    optional = False
                profile = os.environ.get("PROMPTFOO_EXAMPLE_PROFILE")
                if profile:
                    self.assertEqual(optional, profile == "openai-agents-otel")
                endpoint = f"http://127.0.0.1:{server.server_port}"
                env = {
                    key: value
                    for key, value in os.environ.items()
                    if key in ("PATH", "SYSTEMROOT", "LANG", "LC_ALL")
                }
                for proxy in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
                    env[proxy] = env[proxy.lower()] = ""
                env["NO_PROXY"] = env["no_proxy"] = "*"
                env.update(isolated_environment_paths(work))
                env.update(
                    PYTHONDONTWRITEBYTECODE="1",
                    OPENAI_API_KEY="local-test-key",
                    OPENAI_AGENT_MODEL="gpt-6-luna",
                    OPENAI_BASE_URL=f"{endpoint}/v1",
                    OPENAI_API_BASE=f"{endpoint}/v1",
                    OPENAI_AGENTS_DISABLE_TRACING="0",
                    PROMPTFOO_ENABLE_OTEL="true" if optional else "false",
                    OTEL_EXPORTER_OTLP_ENDPOINT=endpoint,
                    PROMPTFOO_OTEL_ENDPOINT=f"{endpoint}/node-spans",
                    PROMPTFOO_PYTHON=sys.executable,
                    PROMPTFOO_CONFIG_DIR=str(work / "promptfoo"),
                    PROMPTFOO_DISABLE_TELEMETRY="1",
                    PROMPTFOO_DISABLE_UPDATE="1",
                    PROMPTFOO_DISABLE_REMOTE_GENERATION="true",
                    PROMPTFOO_DISABLE_SHARING="true",
                    PROMPTFOO_PASS_RATE_THRESHOLD="100",
                )
                config = json.loads(
                    subprocess.check_output(
                        [
                            "node",
                            "--input-type=module",
                            "-e",
                            RELOCATE_CONFIG,
                            str(EXAMPLE / "promptfooconfig.yaml"),
                            str(example),
                            str(trace_port),
                            endpoint,
                        ],
                        cwd=ROOT,
                        env=env,
                        text=True,
                        timeout=20,
                    )
                )
                self.assertEqual(
                    [len(test["assert"]) for test in config["tests"]],
                    [15, 4, 7, 8, 21, 10],
                )
                config_path = work / "config.json"
                config_path.write_text(json.dumps(config))
                output = work / "results.json"
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
                    log, _ = process.communicate(timeout=240)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    log, _ = process.communicate()
                    self.fail(f"CLI timed out:\n{log}")
                evidence = os.environ.get("PROMPTFOO_EXAMPLE_EVIDENCE_DIR")
                if evidence:
                    destination = Path(evidence)
                    destination.mkdir(parents=True, exist_ok=True)
                    name = failure or "positive"
                    (destination / f"{name}.log").write_text(log)
                    (destination / f"{name}-requests.json").write_text(
                        json.dumps(fixture.requests, indent=2)
                    )
                    if output.is_file():
                        shutil.copyfile(output, destination / f"{name}-results.json")
                self.assertFalse(errors, (errors, log))
                self.assertTrue(output.is_file(), log)
                self.assertFalse(
                    list(Path(env["TMPDIR"]).glob("sandbox-local-*")),
                    "SDK sandbox cleanup left a workspace after the CLI exited",
                )
                data = json.loads(output.read_text())["results"]
                rows = data["results"]
                self.assertEqual(len(rows), 6, log)
                if failure in ("api-error", "failed", "incomplete", "refusal"):
                    self.assertNotEqual(process.returncode, 0, log)
                    self.assertEqual(data["stats"]["errors"], 6, data["stats"])
                    expected = {
                        "api-error": "Agents fixture rejected request",
                        "failed": "ModelBehaviorError",
                        "incomplete": "ModelBehaviorError",
                        "refusal": "ModelRefusalError",
                    }[failure]
                    for row in rows:
                        self.assertFalse(row["success"], row)
                        self.assertEqual(row["score"], 0, row)
                        self.assertIn(expected, row["error"])
                elif failure == "wrong-tool-args":
                    self.assertNotEqual(process.returncode, 0, log)
                    self.assertEqual(data["stats"]["errors"], 0, data["stats"])
                    self.assertEqual(data["stats"]["failures"], 2, data["stats"])
                    for row in rows:
                        if row["success"]:
                            continue
                        self.assertTrue(
                            any(
                                not item["pass"]
                                and item["assertion"]["type"]
                                == "trajectory:tool-args-match"
                                for item in row["gradingResult"]["componentResults"]
                            ),
                            row,
                        )
                else:
                    self.assertEqual(process.returncode, 0, log)
                    self.assertEqual(data["stats"]["successes"], 6, data["stats"])
                    self.assertEqual(data["stats"]["failures"], 0)
                    self.assertEqual(data["stats"]["errors"], 0)
                    for row in rows:
                        self.assertTrue(row["success"], row)
                        self.assertFalse(row.get("error"), row)
                        self.assertEqual(row["score"], 1, row)
                        usage = row["response"]["tokenUsage"]
                        self.assertGreater(usage["numRequests"], 0)
                        self.assertEqual(usage["prompt"], 20 * usage["numRequests"])
                        self.assertEqual(usage["cached"], 3 * usage["numRequests"])
                        self.assertEqual(
                            usage["completionDetails"]["reasoning"],
                            2 * usage["numRequests"],
                        )
                        self.assertTrue(
                            all(
                                item["pass"]
                                for item in row["gradingResult"]["componentResults"]
                            ),
                            row,
                        )
                    self.assertEqual(fixture.judges, 1)
                    self.assertEqual(len(fixture.histories), 1)
                    self.assertEqual(len(fixture.sandbox_directories), 1)
                    for directory in fixture.sandbox_directories:
                        self.assertFalse(
                            Path(directory).exists(),
                            "SDK sandbox cleanup left its workspace behind",
                        )
                    self.assertTrue(
                        any(kind == "application/json" for kind, _ in exports)
                    )
                    protobuf = [
                        payload
                        for kind, payload in exports
                        if kind == "application/x-protobuf"
                    ]
                    self.assertEqual(bool(protobuf), optional)
                    if optional:
                        from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
                            ExportTraceServiceRequest,
                        )

                        spans = [
                            span
                            for payload in protobuf
                            for resource in ExportTraceServiceRequest.FromString(
                                payload
                            ).resource_spans
                            for scope in resource.scope_spans
                            for span in scope.spans
                        ]
                        wrappers = {
                            span.span_id.hex(): span
                            for span in spans
                            if span.name.startswith("python call_")
                        }
                        self.assertEqual(len(wrappers), 6)
                        sdk_spans = [
                            span
                            for kind, payload in exports
                            if kind == "application/json"
                            for resource in json.loads(payload)["resourceSpans"]
                            for scope in resource["scopeSpans"]
                            for span in scope["spans"]
                        ]
                        parents = {
                            (span.get("parentSpanId"), span["traceId"])
                            for span in sdk_spans
                        }
                        self.assertTrue(
                            {
                                (span_id, span.trace_id.hex())
                                for span_id, span in wrappers.items()
                            }.issubset(parents)
                        )
                print(
                    f"Agents original config: {failure or 'success=true score=1 errors=0; all 65 assertions passed'}; wrapper OTLP={optional}"
                )
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            self.assertFalse(thread.is_alive())

    def test_original_config(self):
        self.run_config()

    def test_api_error(self):
        self.run_config("api-error")

    def test_failed_response(self):
        self.run_config("failed")

    def test_incomplete_response(self):
        self.run_config("incomplete")

    def test_refusal_response(self):
        self.run_config("refusal")

    def test_wrong_arguments(self):
        self.run_config("wrong-tool-args")


if __name__ == "__main__":
    unittest.main()
