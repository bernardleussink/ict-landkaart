"""Lokale webserver voor de landkaart, zonder browsercache (wijzigingen zijn direct zichtbaar).

Gebruik:  python tools/serve.py [poort]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class GeenCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    poort = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
    server = ThreadingHTTPServer(("localhost", poort), partial(GeenCache, directory=str(ROOT)))
    print(f"Landkaart draait op http://localhost:{poort} (Ctrl+C om te stoppen)")
    server.serve_forever()
