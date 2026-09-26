"""Regression checks for the example's HTTP transport dependencies."""

import ssl
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

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


class ProcessPoolTest(unittest.TestCase):
    def test_worker_stderr_does_not_block_results(self) -> None:
        # Isolate the process pool from unittest's __main__ and bound regressions
        # with a timeout: an undrained stderr pipe otherwise blocks indefinitely.
        worker_script = (
            "import sys; sys.path.insert(0, sys.argv[1]); "
            "import anyio; from anyio import to_process; "
            "from dependencies_test import write_worker_stderr; "
            "assert anyio.run(to_process.run_sync, write_worker_stderr) == 1024 * 1024"
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


if __name__ == "__main__":
    unittest.main()
