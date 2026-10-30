"""Capture each level's target pattern at 2x for visual review.

    EDGE_ATTACH_PORT=9238 python tools/pattern_shots.py
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request

import websocket

PORT = int(os.environ.get("EDGE_ATTACH_PORT", "9238"))
BASE = os.environ.get("FOLDYSSEY_URL", "http://127.0.0.1:4173/")
LEVELS = ["corner", "mirror-gate", "diamond", "octagram", "rosette", "grand-rosette"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(OUT, exist_ok=True)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class CDP:
    def __init__(self, url: str):
        self.ws = websocket.create_connection(url, suppress_origin=True, timeout=30)
        self._id = 0

    def send(self, method, params=None):
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == mid:
                return m.get("result", {})

    def ev(self, expr):
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        return r.get("result", {}).get("value")

    def wait(self, expr, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            if self.ev(expr):
                return True
            time.sleep(0.2)
        return False


def main() -> int:
    ws = None
    for _ in range(40):
        try:
            for t in json.loads(opener.open(f"http://127.0.0.1:{PORT}/json/list", timeout=3).read()):
                if t.get("type") == "page":
                    ws = t["webSocketDebuggerUrl"]
                    break
            if ws:
                break
        except Exception:
            time.sleep(0.4)
    if not ws:
        raise SystemExit("devtools not reachable")

    cdp = CDP(ws)
    cdp.send("Page.enable")
    cdp.send("Runtime.enable")
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 980, "deviceScaleFactor": 1, "mobile": False})
    cdp.send("Page.navigate", {"url": BASE})
    cdp.wait("document.readyState === 'complete' && !!document.querySelector('.hero__stage svg')", 20)

    for lid in LEVELS:
        cdp.ev(f"location.hash = '#/puzzle/{lid}'")
        ok = cdp.wait("!!document.querySelector('.target-frame')", 10)
        if not ok:
            print("skip", lid)
            continue
        time.sleep(1.2)
        box = cdp.ev(
            "(()=>{const e=document.querySelector('.target-frame');const r=e.getBoundingClientRect();"
            "return {x:r.x,y:r.y,width:r.width,height:r.height}})()"
        )
        if not box:
            print("no box", lid)
            continue
        shot = cdp.send(
            "Page.captureScreenshot",
            {
                "format": "png",
                "clip": {"x": box["x"], "y": box["y"], "width": box["width"], "height": box["height"], "scale": 2},
            },
        )
        path = os.path.join(OUT, f"pattern-{lid}.png")
        with open(path, "wb") as f:
            f.write(base64.b64decode(shot["data"]))
        print("saved", path)

    cdp.ws.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
