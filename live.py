"""Run the living voxel world in your browser.

    .venv\\Scripts\\python.exe live.py            # export the island if needed, serve, open the page
    .venv\\Scripts\\python.exe live.py --no-open  # serve only
"""

from __future__ import annotations

import functools
import http.server
import sys
import webbrowser
from pathlib import Path

WEB = Path(__file__).parent / "web"
PORT = 8137


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")  # always serve the latest files
        super().end_headers()

    def log_message(self, *args) -> None:  # keep the console quiet
        pass


def main() -> None:
    data = WEB / "data" / "world.json"
    if not data.exists():
        from export_world import export
        print("exported", export())
    handler = functools.partial(Handler, directory=str(WEB))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as server:
        page = "city/" if "city" in sys.argv else "paint/" if "paint" in sys.argv else ""
        url = f"http://127.0.0.1:{PORT}/" + page
        print(f"Serving at {url}  (Ctrl+C to stop). Living world: /   Miniature City: /city/   Worldbrush: /paint/")
        if "--no-open" not in sys.argv:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
