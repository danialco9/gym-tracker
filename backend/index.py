"""Vercel entrypoint: the platform imports ``app`` from this file and serves it as one Python function.

Vercel runs no uvicorn command line, so ``--proxy-headers`` from ``docker-entrypoint.sh`` becomes the same
middleware here: rate limits then see the visitor's address instead of the proxy's.
"""

from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from gym_tracker.main import create_app

app = create_app()
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
