"""Run the MLflow example through a real local gateway and a model HTTP fixture."""

import http.server
import json
import os
import pathlib
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from typing import Any, ClassVar


class ModelFixture(http.server.BaseHTTPRequestHandler):
    requests: ClassVar[list[dict[str, Any]]] = []
    accepted = True

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.requests.append(request)
        is_answer = any(
            "Answer the following question concisely" in str(message.get("content"))
            for message in request["messages"]
        )
        if is_answer:
            content = (
                "A unified proxy offers routing, cost controls and fallback security."
                if self.accepted
                else "Cabbage."
            )
        else:
            content = json.dumps(
                {
                    "reason": "Local fixture grading.",
                    "pass": self.accepted,
                    "score": int(self.accepted),
                }
            )
        response = {
            "id": "fixture-chat",
            "object": "chat.completion",
            "created": 1,
            "model": request["model"],
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 8, "total_tokens": 18},
        }
        data = json.dumps(response).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


def run_smoke(repo, output):
    output.mkdir(parents=True, exist_ok=True)
    readme = (repo / "examples/provider-mlflow-gateway/README.md").read_text()
    # Exercise the documented server command, using isolated storage and a free port.
    commands = [
        line for line in readme.splitlines() if line.startswith(".venv/bin/mlflow ")
    ]
    if len(commands) != 1:
        raise RuntimeError(
            "README must contain one POSIX .venv/bin/mlflow server command"
        )
    startup = shlex.split(commands[0])
    startup[0] = str(pathlib.Path(sys.executable).parent / "mlflow")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    startup[startup.index("--port") + 1] = str(port)
    uri = f"http://127.0.0.1:{port}"
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.lower().endswith("_proxy")
        and not key.startswith(("MLFLOW_", "OPENAI_", "ANTHROPIC_"))
    }
    # Empty values prevent implicit dotenv from restoring proxies.
    for proxy in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        env[proxy] = env[proxy.lower()] = ""
    env["NO_PROXY"] = env["no_proxy"] = "*"
    env.update(
        MLFLOW_DISABLE_AGENT_HINT="1",
        MLFLOW_ENABLE_TELEMETRY="false",
        LITELLM_LOCAL_MODEL_COST_MAP="True",
        PROMPTFOO_CONFIG_DIR=str(output / "promptfoo"),
        PROMPTFOO_DISABLE_TELEMETRY="1",
        PROMPTFOO_DISABLE_REMOTE_GENERATION="true",
        MLFLOW_GATEWAY_URL=uri,
        # Only this isolated test server routes to the loopback HTTP model fixture.
        MLFLOW_GATEWAY_API_BASE_ALLOWED_SCHEMES="http,https",
        MLFLOW_GATEWAY_API_BASE_ALLOW_PRIVATE_IPS="true",
        OPENBLAS_NUM_THREADS="1",
        OMP_NUM_THREADS="1",
    )
    ModelFixture.requests = []
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    backend = http.server.ThreadingHTTPServer(("127.0.0.1", 0), ModelFixture)
    thread = threading.Thread(target=backend.serve_forever, daemon=True)
    thread.start()
    server = None
    try:
        with (output / "server.log").open("w") as log:
            server = subprocess.Popen(
                startup
                + [
                    "--workers",
                    "1",
                    "--backend-store-uri",
                    f"sqlite:///{output}/mlflow.db",
                    "--artifacts-destination",
                    str(output / "artifacts"),
                ],
                cwd=output,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if server.poll() is not None:
                    raise RuntimeError("MLflow exited before becoming healthy")
                try:
                    with opener.open(uri + "/health", timeout=1) as response:
                        if response.status == 200:
                            break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.2)
            else:
                raise RuntimeError("MLflow did not become healthy")

            # MLflow's store API configures the same gateway resources as its UI.
            # Keep setup in a subprocess so SDK environment state stays isolated.
            setup = """
import sys
from mlflow.tracking._tracking_service.utils import _get_store
from mlflow.entities import GatewayEndpointModelConfig, GatewayModelLinkageType
store = _get_store(sys.argv[1])
secret = store.create_gateway_secret(
    secret_name="fixture-key", secret_value={"api_key": "fixture-not-a-real-key"},
    provider="openai", auth_config={"api_base": sys.argv[2]},
)
model = store.create_gateway_model_definition(
    name="fixture-model", secret_id=secret.secret_id, provider="openai", model_name="gpt-4.1-mini",
)
store.create_gateway_endpoint(
    name="my-chat-endpoint", usage_tracking=False,
    model_configs=[GatewayEndpointModelConfig(
        model_definition_id=model.model_definition_id, linkage_type=GatewayModelLinkageType.PRIMARY,
    )],
)
"""
            subprocess.run(
                [
                    sys.executable,
                    "-c",
                    setup,
                    uri,
                    f"http://127.0.0.1:{backend.server_port}/v1",
                ],
                env=env,
                check=True,
                timeout=60,
            )
            for accepted in (True, False):
                ModelFixture.accepted = accepted
                result_path = output / ("passing.json" if accepted else "failing.json")
                result = subprocess.run(
                    [
                        "npm",
                        "run",
                        "local",
                        "--",
                        "eval",
                        "-c",
                        "examples/provider-mlflow-gateway/promptfooconfig.yaml",
                        "--no-cache",
                        "--no-share",
                        "-o",
                        str(result_path),
                    ],
                    cwd=repo,
                    env=env,
                    timeout=120,
                    check=False,
                )
                data = json.loads(result_path.read_text())["results"]
                rows = data["results"]
                assert len(rows) == 2, data["stats"]
                assert data["stats"]["errors"] == 0, data["stats"]
                assert (result.returncode == 0) == accepted, result.returncode
                for row in rows:
                    assert row["success"] == accepted, row
                    assert row["score"] == int(accepted), row
                    assert not row["response"].get("error"), row
                print(
                    "Verified",
                    "passing" if accepted else "failing",
                    data["stats"],
                    flush=True,
                )
            assert len(ModelFixture.requests) >= 5, (
                "The gateway must route answers and grading requests"
            )
    except BaseException:
        log_path = output / "server.log"
        if log_path.exists():
            print(log_path.read_text(), file=sys.stderr)
        raise
    finally:
        if server is not None:
            try:
                os.killpg(server.pid, signal.SIGTERM)
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(server.pid, signal.SIGKILL)
                server.wait()
            except ProcessLookupError:
                server.wait()
        backend.shutdown()
        backend.server_close()
        thread.join(timeout=5)


class GatewaySmokeTests(unittest.TestCase):
    def test_documented_server_routes_passing_and_failing_evaluations(self):
        repo = pathlib.Path(__file__).resolve().parents[3]
        with tempfile.TemporaryDirectory(prefix="promptfoo-mlflow-") as output:
            run_smoke(repo, pathlib.Path(output))


if __name__ == "__main__":
    unittest.main()
