"""Exercise real Chroma persistence and the example config with local model APIs."""

import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

EXAMPLE = Path(__file__).resolve().parents[1]
REPO = EXAMPLE.parents[1]
ANSWER = "Revenue increased to 42 million dollars."
TOKENIZER_URL = (
    "https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken"
)
TOKENIZER_SHA256 = "223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7"
TOKENIZER_CACHE_KEY = hashlib.sha1(TOKENIZER_URL.encode()).hexdigest()


def run_process(command, *, cwd, env, timeout):
    # npm starts Node and Python children; kill the whole group on timeout.
    with subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True) as process:
        try:
            returncode = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            raise
        if returncode:
            raise subprocess.CalledProcessError(returncode, command)


def prepare_tokenizer(root, env):
    cache = root / "tokenizer-cache"
    cache.mkdir()
    env["TIKTOKEN_CACHE_DIR"] = str(cache)
    source = os.environ.get(
        "TIKTOKEN_CACHE_DIR",
        os.environ.get(
            "DATA_GYM_CACHE_DIR", str(Path(tempfile.gettempdir()) / "data-gym-cache")
        ),
    )
    # Read the developer cache without letting tiktoken delete corrupt entries.
    if source:
        try:
            data = (Path(source) / TOKENIZER_CACHE_KEY).read_bytes()
        except OSError:
            pass
        else:
            if hashlib.sha256(data).hexdigest() == TOKENIZER_SHA256:
                (cache / TOKENIZER_CACHE_KEY).write_bytes(data)
                return

    # Only vocabulary preparation can use the host's proxy and CA settings.
    # This environment has a temporary HOME and no model credentials.
    download_env = env.copy()
    for key in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
        "REQUESTS_CA_BUNDLE",
        "CURL_CA_BUNDLE",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
    ):
        if key in os.environ:
            download_env[key] = os.environ[key]
    run_process(
        [
            sys.executable,
            "-I",
            "-c",
            "import tiktoken; tiktoken.get_encoding('cl100k_base')",
        ],
        cwd=root,
        env=download_env,
        timeout=60,
    )


def main():
    requests = []
    errors = []

    class ModelAPI(BaseHTTPRequestHandler):
        def do_POST(self):
            try:
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                requests.append(self.path)
                if self.path == "/v1/embeddings":
                    inputs = body["input"]
                    # OpenAIEmbeddings sends either text batches or token batches.
                    count = len(inputs) if isinstance(inputs, list) else 1
                    response = {
                        "object": "list",
                        "model": body["model"],
                        "data": [
                            {"object": "embedding", "embedding": [0.1] * 8, "index": i}
                            for i in range(count)
                        ],
                        "usage": {"prompt_tokens": 3, "total_tokens": 3},
                    }
                elif self.path == "/v1/chat/completions":
                    if ANSWER not in str(
                        body["messages"]
                    ) or "The prior revenue was 40 million dollars." not in str(
                        body["messages"]
                    ):
                        raise AssertionError(
                            "Persisted document is missing from the RAG prompt"
                        )
                    response = {
                        "id": "local-rag-smoke",
                        "object": "chat.completion",
                        "created": 1,
                        "model": body["model"],
                        "choices": [
                            {
                                "index": 0,
                                "message": {"role": "assistant", "content": ANSWER},
                                "finish_reason": "stop",
                            }
                        ],
                        "usage": {
                            "prompt_tokens": 30,
                            "completion_tokens": 8,
                            "total_tokens": 38,
                        },
                    }
                else:
                    raise AssertionError(f"Unexpected API path: {self.path}")
                self.send_response(200)
            except (AssertionError, KeyError, ValueError) as error:
                errors.append(str(error))
                response = {"error": {"message": str(error)}}
                self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), ModelAPI)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        with tempfile.TemporaryDirectory(prefix="promptfoo-rag-smoke-") as directory:
            root = Path(directory)
            for name in (
                "ingest.py",
                "pdf_loader.py",
                "retrieve.py",
                "promptfooconfig.yaml",
            ):
                shutil.copyfile(EXAMPLE / name, root / name)
            endpoint = f"http://127.0.0.1:{server.server_port}/v1"
            env = {
                key: value
                for key, value in os.environ.items()
                if key in ("PATH", "SYSTEMROOT", "LANG", "LC_ALL")
            }
            home = root / "home"
            state = home / ".local" / "state"
            temporary = root / "tmp"
            state.mkdir(parents=True)
            temporary.mkdir()
            env_file = root / "empty.env"
            env_file.touch()
            # envars loads defaults before the CLI processes explicit flags.
            env.update(
                DOTENV_PATH=str(env_file),
                HOME=str(home),
                USERPROFILE=str(home),
                XDG_STATE_HOME=str(state),
                TMPDIR=str(temporary),
            )
            prepare_tokenizer(root, env)
            for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
                env[key] = env[key.lower()] = ""
            env.update(
                NO_PROXY="*",
                no_proxy="*",
                OPENAI_API_KEY="local-smoke-key",
                OPENAI_BASE_URL=endpoint,
                OPENAI_API_BASE=endpoint,
                OPENAI_API_BASE_URL=endpoint,
                PROMPTFOO_PYTHON=sys.executable,
                PYTHONPATH=str(root),
                PROMPTFOO_CONFIG_DIR=str(root / "promptfoo"),
                PROMPTFOO_DISABLE_TELEMETRY="1",
                PROMPTFOO_DISABLE_UPDATE="1",
                PROMPTFOO_DISABLE_REMOTE_GENERATION="true",
                PROMPTFOO_DISABLE_SHARING="true",
                PROMPTFOO_PASS_RATE_THRESHOLD="100",
                LANGSMITH_TRACING="false",
                LANGCHAIN_TRACING_V2="false",
                ANONYMIZED_TELEMETRY="False",
            )
            # A separate process must persist both the first and subsequent batches.
            run_process(
                [
                    sys.executable,
                    "-c",
                    "from ingest import create_vector_store; from langchain_core.documents import Document; create_vector_store([Document(page_content='Revenue increased to 42 million dollars.'), Document(page_content='The prior revenue was 40 million dollars.')], batch_size=1)",
                ],
                cwd=root,
                env=env,
                timeout=120,
            )
            if not (root / "db" / "chroma.sqlite3").is_file():
                raise AssertionError("Ingestion did not persist the Chroma database")
            output = root / "results.json"
            run_process(
                [
                    "npm",
                    "run",
                    "local",
                    "--",
                    "eval",
                    "-c",
                    str(root / "promptfooconfig.yaml"),
                    "--no-cache",
                    "--no-write",
                    "--no-share",
                    "-o",
                    str(output),
                ],
                cwd=REPO,
                env=env,
                timeout=180,
            )
            results = json.loads(output.read_text())["results"]["results"]
            if len(results) != 9:
                raise AssertionError(
                    f"Expected all nine original config cases, got {len(results)}"
                )
            for result in results:
                if (
                    not result["success"]
                    or result["score"] != 1
                    or result.get("error")
                    or result["response"].get("error")
                ):
                    raise AssertionError(f"Evaluation failed: {result}")
                if result["response"].get("output") != ANSWER:
                    raise AssertionError(
                        f"Unexpected provider output: {result['response']}"
                    )
            if (
                requests.count("/v1/embeddings") < 11
                or requests.count("/v1/chat/completions") != 9
                or errors
            ):
                raise AssertionError(
                    f"Unexpected API traffic: {requests}; errors: {errors}"
                )
            print(
                "RAG smoke passed: persisted two batches, reopened Chroma, and evaluated all 9 original config cases."
            )
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


class RagCliTest(unittest.TestCase):
    def test_persisted_retrieval_through_original_config(self):
        main()


if __name__ == "__main__":
    main()
