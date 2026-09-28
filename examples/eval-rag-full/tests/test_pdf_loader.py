"""Check PDF extraction and ingestion using an actual local HTTP server."""

import importlib
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import requests
from pypdf import PdfWriter
from pypdf.errors import PdfReadError
from pypdf.generic import (
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
    NumberObject,
)

# The shared example runner invokes this suite from the repository root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdf_loader import load_pdf_pages


def make_pdf() -> bytes:
    writer = PdfWriter()
    for text in ["First page", "Second page", ""]:
        page = writer.add_blank_page(612, 792)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {
                NameObject("/Font"): DictionaryObject(
                    {NameObject("/F1"): writer._add_object(font)}
                )
            }
        )
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 10 Tf 24 740 Td ({text}) Tj ET".encode())
        page[NameObject("/Contents")] = writer._add_object(stream)
    writer.add_metadata(
        {
            "/Producer": "Fixture",
            "/Creator": "  PDF author  ",
            "/Title": "  Report  ",
            "/CreationDate": "D:20240203040506+02'00'",
            "/ModDate": "unknown",
            "/file_path": "  original  ",
            "/page_count": "  3  ",
        }
    )
    writer._info[NameObject("/number")] = NumberObject(7)
    writer.set_page_label(0, 2, style="/r")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


class PDFLoaderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        pdf = make_pdf()
        cls.request_paths = []
        cls.release_stalled_request = threading.Event()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args) -> None:
                pass

            def do_GET(self) -> None:
                cls.request_paths.append(self.path)
                if self.path == "/stalled.pdf":
                    cls.release_stalled_request.wait(timeout=5)
                    return
                if self.path == "/redirect.pdf":
                    self.send_response(302)
                    self.send_header("Location", "/report%20one.pdf")
                    self.end_headers()
                    return
                status, content = {
                    "/report%20one.pdf": (200, pdf),
                    "/invalid.pdf": (200, b"not a PDF"),
                    "/partial.pdf": (206, pdf),
                }.get(self.path, (404, b"missing"))
                self.send_response(status)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}/"
        cls.proxy_environment = patch.dict(
            os.environ, {"NO_PROXY": "127.0.0.1", "no_proxy": "127.0.0.1"}
        )
        cls.proxy_environment.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.proxy_environment.stop()

    def test_page_text_and_metadata(self) -> None:
        url = self.base_url + "report%20one.pdf"
        with patch("pdf_loader.requests.get", wraps=requests.get) as request:
            pages = load_pdf_pages(url)
        self.assertEqual(request.call_args.kwargs["timeout"], (10, 60))
        self.assertEqual(
            [page.page_content for page in pages], ["First page", "Second page", ""]
        )
        for index, page in enumerate(pages):
            self.assertEqual(
                page.metadata,
                {
                    "producer": "Fixture",
                    "creator": "PDF author",
                    "creationdate": "2024-02-03T04:05:06+02:00",
                    "title": "Report",
                    "moddate": "unknown",
                    "file_path": "  original  ",
                    "page_count": "  3  ",
                    "number": "7",
                    "source": url,
                    "total_pages": 3,
                    "page": index,
                    "page_label": ["i", "ii", "iii"][index],
                },
            )

    def test_redirect_keeps_original_source(self) -> None:
        url = self.base_url + "redirect.pdf"
        self.assertEqual(load_pdf_pages(url)[0].metadata["source"], url)

    def test_download_requires_complete_success(self) -> None:
        for filename, status in [("missing.pdf", 404), ("partial.pdf", 206)]:
            with (
                self.subTest(filename=filename),
                self.assertRaisesRegex(ValueError, str(status)),
            ):
                load_pdf_pages(self.base_url + filename)

    def test_malformed_pdf_fails(self) -> None:
        with self.assertRaises(PdfReadError):
            load_pdf_pages(self.base_url + "invalid.pdf")

    def test_stalled_download_times_out(self) -> None:
        try:
            with self.assertRaises(requests.exceptions.ReadTimeout):
                load_pdf_pages(self.base_url + "stalled.pdf", timeout=(1, 0.05))
        finally:
            self.release_stalled_request.set()

    def test_ingestion_keeps_filename_and_page_metadata(self) -> None:
        with patch.dict(os.environ, {"OPENAI_API_KEY": "local-test-key"}):
            ingest = importlib.import_module("ingest")
        with patch.object(ingest, "BASE_URL", self.base_url):
            filename, chunks = ingest.process_single_pdf("report one.pdf")
            self.assertEqual(filename, "report one.pdf")
            self.assertEqual(
                [chunk.page_content for chunk in chunks], ["First page", "Second page"]
            )
            self.assertEqual([chunk.metadata["page"] for chunk in chunks], [0, 1])
            self.assertTrue(
                all(
                    chunk.metadata["source"] == self.base_url + "report%20one.pdf"
                    for chunk in chunks
                )
            )
            self.assertIn("/report%20one.pdf", self.request_paths)
            with self.assertLogs(level="ERROR"):
                self.assertEqual(
                    ingest.process_single_pdf("missing.pdf"), ("missing.pdf", [])
                )
            with (
                patch.object(
                    ingest,
                    "load_pdf_pages",
                    side_effect=requests.exceptions.ReadTimeout("Download stalled"),
                ),
                self.assertLogs(level="ERROR"),
            ):
                self.assertEqual(
                    ingest.process_single_pdf("stalled.pdf"), ("stalled.pdf", [])
                )


if __name__ == "__main__":
    unittest.main()
