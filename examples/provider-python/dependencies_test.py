"""Offline regression checks for the example's SDK and HTTP transport."""

import importlib.util
import json
import os
import ssl
import subprocess
import sys
import threading
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import h11
from anyio.abc import ByteStream
from anyio.streams.tls import TLSAttribute, TLSStream


def write_worker_stderr() -> int:
    """Write enough output to exceed an undrained worker stderr pipe."""
    return sys.stderr.write("x" * 1024 * 1024)


class TlsHostnameTest(unittest.IsolatedAsyncioTestCase):
    async def test_certificate_hostname_uses_idna_2008(self) -> None:
        """A certificate for strasse.example must not match straße.example."""
        context = ssl.create_default_context()
        transport = Mock(spec=ByteStream)
        transport.extra_attributes = {}

        for hostname, expected in (
            ("straße.example", "xn--strae-oqa.example"),
            ("strasse.example", "strasse.example"),
            ("xn--strae-oqa.example", "xn--strae-oqa.example"),
        ):
            with self.subTest(hostname=hostname):
                # Keep the real SSLContext/SSLObject hostname conversion, skipping
                # only the network handshake so this check runs offline.
                with patch.object(TLSStream, "_call_sslobject_method", new=AsyncMock()):
                    stream = await TLSStream.wrap(
                        transport, hostname=hostname, ssl_context=context
                    )
                ssl_object = stream.extra(TLSAttribute.ssl_object)
                self.assertEqual(ssl_object.server_hostname, expected)


class HttpFramingTest(unittest.TestCase):
    def test_chunk_terminators_are_validated(self) -> None:
        for terminator in (b"\r\n", b"XX"):
            with self.subTest(terminator=terminator):
                connection = h11.Connection(h11.CLIENT)
                connection.send(
                    h11.Request(
                        method="GET", target="/", headers=[("Host", "fixture.local")]
                    )
                )
                connection.send(h11.EndOfMessage())
                connection.receive_data(
                    b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
                    + b"5\r\nhello"
                    + terminator
                    + b"0\r\n\r\n"
                )
                self.assertIsInstance(connection.next_event(), h11.Response)
                self.assertEqual(connection.next_event().data, b"hello")
                if terminator == b"\r\n":
                    self.assertIsInstance(connection.next_event(), h11.EndOfMessage)
                else:
                    with self.assertRaises(h11.RemoteProtocolError):
                        connection.next_event()


class ProcessPoolTest(unittest.TestCase):
    def test_worker_stderr_does_not_block_results(self) -> None:
        # Isolate the process pool from unittest's __main__ and bound regressions
        # with a timeout: an undrained stderr pipe otherwise blocks indefinitely.
        worker_script = "\n".join(
            [
                "import sys",
                "sys.path.insert(0, sys.argv[1])",
                "import anyio",
                "from anyio import to_process",
                "from dependencies_test import write_worker_stderr",
                "assert anyio.run(to_process.run_sync, write_worker_stderr) == 1024 * 1024",
            ]
        )
        subprocess.run(
            [
                sys.executable,
                "-c",
                worker_script,
                str(Path(__file__).parent.resolve()),
            ],
            cwd=Path(__file__).parent,
            check=True,
            capture_output=True,
            timeout=15,
        )


class ProviderSdkTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.requests = []
        requests = self.requests

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                request = json.loads(
                    self.rfile.read(int(self.headers["Content-Length"]))
                )
                requests.append((self.path, request))
                prompt = request["messages"][-1]["content"]
                status = 400 if prompt == "fail" else 200
                text = "Bananamax bananas are a-peeling!"
                if "ALL CAPS" in prompt:
                    text = text.upper()
                response = (
                    {
                        "error": {
                            "message": "Fixture rejection",
                            "type": "invalid_request",
                        }
                    }
                    if status == 400
                    else {
                        "id": "fixture",
                        "object": "chat.completion",
                        "created": 1,
                        "model": request["model"],
                        "choices": [
                            {
                                "index": 0,
                                "message": {"role": "assistant", "content": text},
                                "finish_reason": "stop",
                            }
                        ],
                        "usage": {
                            "prompt_tokens": 10,
                            "completion_tokens": 8,
                            "total_tokens": 18,
                        },
                    }
                )
                data = json.dumps(response).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(thread.join, 2)
        self.addCleanup(server.shutdown)
        self.base_url = f"http://127.0.0.1:{server.server_port}/v1"
        env = {
            key: value
            for key, value in os.environ.items()
            if not key.lower().endswith("_proxy")
            and key not in ("SSL_CERT_FILE", "SSL_CERT_DIR")
            and not key.startswith("OPENAI_")
        }
        env.update(OPENAI_API_KEY="local-fixture", OPENAI_BASE_URL=self.base_url)
        environment = patch.dict(os.environ, env, clear=True)
        environment.start()
        self.addCleanup(environment.stop)

        # Supply an unusable certifi even in clean environments where it is absent.
        # Install this before importing the SDK so cached imports cannot hide its use.
        certifi = types.ModuleType("certifi")
        self.certifi_where = Mock(
            side_effect=AssertionError("certifi must not be used")
        )
        certifi.where = self.certifi_where
        modules = patch.dict(sys.modules, {"certifi": certifi})
        modules.start()
        self.addCleanup(modules.stop)
        spec = importlib.util.spec_from_file_location(
            "example_provider", Path(__file__).with_name("provider.py")
        )
        self.provider = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.provider)
        self.addCleanup(self.provider.client.close)
        self.addAsyncCleanup(self.provider.async_client.close)
        for client in (self.provider.client, self.provider.async_client):
            client.max_retries = 0
            client.timeout = 2

    async def test_real_sdk_executes_all_provider_functions(self) -> None:
        config = {"nested": {"parameters": {"foo": "bar"}}}
        sync = self.provider.call_api("Tell a joke", {"config": config}, {})
        caps = self.provider.some_other_function("Tell a joke", {}, {})
        asynchronous = await self.provider.async_provider("Tell a joke", {}, {})
        self.assertEqual(sync["output"], "Bananamax bananas are a-peeling!")
        self.assertEqual(caps["output"], sync["output"].upper())
        self.assertEqual(asynchronous["output"], sync["output"])
        self.assertEqual(sync["metadata"], {"config": config})
        for result in (sync, caps, asynchronous):
            self.assertEqual(
                result["tokenUsage"], {"total": 18, "prompt": 10, "completion": 8}
            )
        self.assertEqual(len(self.requests), 3)
        for (path, request), model, prompt in zip(
            self.requests,
            ("gpt-4.1-mini", "gpt-4.1-mini", "gpt-4o"),
            ("Tell a joke", "Tell a joke\nWrite in ALL CAPS", "Tell a joke"),
        ):
            self.assertEqual(path, "/v1/chat/completions")
            self.assertEqual(request["model"], model)
            self.assertEqual(request["messages"][0]["role"], "system")
            self.assertIn("Bananamax", request["messages"][0]["content"])
            self.assertEqual(
                request["messages"][1], {"role": "user", "content": prompt}
            )
        self.certifi_where.assert_not_called()

    async def test_real_sdk_propagates_api_errors(self) -> None:
        from openai import BadRequestError

        with self.assertRaisesRegex(BadRequestError, "Fixture rejection"):
            self.provider.call_api("fail", {}, {})
        with self.assertRaisesRegex(BadRequestError, "Fixture rejection"):
            await self.provider.async_provider("fail", {}, {})
        self.assertEqual(len(self.requests), 2)

    async def test_https_transport_uses_secure_context_without_certifi(self) -> None:
        from httpcore2 import ConnectError
        from httpcore2._backends.anyio import AnyIOStream
        from httpcore2._backends.sync import SyncStream
        from openai import APIConnectionError

        contexts = []

        def inspect_tls(stream, ssl_context, server_hostname=None, timeout=None):
            stream.close()
            contexts.append((ssl_context, server_hostname))
            raise ConnectError("Fixture stops before the TLS handshake")

        async def inspect_async_tls(
            stream, ssl_context, server_hostname=None, timeout=None
        ):
            await stream.aclose()
            contexts.append((ssl_context, server_hostname))
            raise ConnectError("Fixture stops before the TLS handshake")

        # Keep SDK construction, HTTPX and connection setup real; stop only when
        # the actual transport receives its TLS context. No certificate overrides
        # or verify=False settings are supplied to either client.
        self.provider.client.base_url = self.base_url.replace("http:", "https:")
        self.provider.async_client.base_url = self.provider.client.base_url
        with patch.object(
            SyncStream, "start_tls", autospec=True, side_effect=inspect_tls
        ):
            with self.assertRaises(APIConnectionError):
                self.provider.call_api("Tell a joke", {}, {})
        with patch.object(
            AnyIOStream, "start_tls", autospec=True, side_effect=inspect_async_tls
        ):
            with self.assertRaises(APIConnectionError):
                await self.provider.async_provider("Tell a joke", {}, {})
        self.assertEqual(len(contexts), 2)
        for context, hostname in contexts:
            self.assertIsInstance(context, ssl.SSLContext)
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
            self.assertTrue(context.check_hostname)
            self.assertEqual(hostname, "127.0.0.1")
        self.certifi_where.assert_not_called()
        self.assertEqual(self.requests, [])


if __name__ == "__main__":
    unittest.main()
