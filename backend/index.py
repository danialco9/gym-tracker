"""Vercel entrypoint: the platform imports ``app`` from this file and serves it as one Python function.

Vercel runs no uvicorn command line, so ``--proxy-headers`` from ``docker-entrypoint.sh`` becomes the same
middleware here: rate limits then see the visitor's address instead of the proxy's.
"""

import sys
from pathlib import Path

from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

# Normally the build installs this package. A function too large for that gets its dependencies
# installed when it starts instead, without this package, so the source is put on the path too.
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from gym_tracker.main import create_app

app = create_app()
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
