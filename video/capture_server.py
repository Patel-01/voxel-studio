"""Receives frames posted by the in-page capture script and writes them to video/frames/<shot>/<n>.jpg.

    .venv\\Scripts\\python.exe video\\capture_server.py
"""

from __future__ import annotations

import http.server
import re
from pathlib import Path

FRAMES = Path(__file__).parent / "frames"
PORT = 8138


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:8137")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        """Serves the in-page recording scripts (video/*_capture.js) so the page can import them."""
        match = re.fullmatch(r"/([a-z_]+_capture\.js)", self.path.split("?")[0])
        script = Path(__file__).parent / match.group(1) if match else None
        if not script or not script.exists():
            self.send_response(404)
            self.end_headers()
            return
        body = script.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript")
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        match = re.fullmatch(r"/f/([a-z_]+)/(\d+)\.(jpg|json)", self.path)
        if not match:
            self.send_response(404)
            self.end_headers()
            return
        shot, index, ext = match.groups()
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        folder = FRAMES / shot
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{int(index):05d}.{ext}").write_bytes(body)
        self.send_response(204)
        self._cors()
        self.end_headers()

    def log_message(self, *args) -> None:
        pass


if __name__ == "__main__":
    FRAMES.mkdir(parents=True, exist_ok=True)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as server:
        print(f"capture server on {PORT}")
        server.serve_forever()
