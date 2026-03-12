#!/usr/bin/env python3
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent / "workspace"
LOG_MAP = {
    "/sms": ROOT / "mock-sms.log",
    "/email": ROOT / "mock-email.log",
    "/social": ROOT / "mock-social.log",
}


class Handler(BaseHTTPRequestHandler):
    def _write_log(self, body: str):
        parsed = urlparse(self.path)
        target = LOG_MAP.get(parsed.path)
        if not target:
            return False
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": self.command,
            "path": parsed.path,
            "query": parse_qs(parsed.query),
            "body": body,
            "headers": {
                "Content-Type": self.headers.get("Content-Type", ""),
            },
        }
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry) + "\n")
        return True

    def _read_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return ""
        return self.rfile.read(length).decode("utf-8", errors="replace")

    def _respond(self, ok: bool):
        payload = json.dumps({"ok": ok}).encode("utf-8")
        self.send_response(200 if ok else 404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        ok = self._write_log(self._read_body())
        self._respond(ok)

    def do_GET(self):
        ok = self._write_log("")
        self._respond(ok)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8877), Handler)
    server.serve_forever()
