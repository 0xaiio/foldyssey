"""Browser check for the AI design companion (Edge + CDP).

Runs against whatever FOLDYSSEY_URL points at (local preview or the published
site). Reports whether the real model call succeeded or failed, and always
verifies the rest of the app still works afterwards.

    EDGE_ATTACH_PORT=9234 python tools/ai_check.py
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request

import websocket

PORT = int(os.environ.get("EDGE_ATTACH_PORT", "9234"))
BASE = os.environ.get("FOLDYSSEY_URL", "http://127.0.0.1:4173/")
PROMPT = os.environ.get("FOLDYSSEY_AI_PROMPT", "喜庆的八瓣红色窗花，适合春节挂窗")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(OUT, exist_ok=True)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class CDP:
    def __init__(self, ws_url: str):
        self.ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=60)
        self._id = 0
        self.issues: list[str] = []

    def send(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        mid = self._id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            self._track(msg)

    def _track(self, msg: dict) -> None:
        m = msg.get("method")
        if m == "Runtime.exceptionThrown":
            d = msg.get("params", {}).get("exceptionDetails", {})
            self.issues.append("exception: " + str(d.get("text"))[:200])
        elif m == "Runtime.consoleAPICalled" and msg.get("params", {}).get("type") == "error":
            args = msg["params"].get("args", [])
            self.issues.append("console.error: " + " ".join(str(a.get("value", "")) for a in args)[:200])
        elif m == "Log.entryAdded":
            e = msg.get("params", {}).get("entry", {})
            if e.get("level") == "error":
                self.issues.append("log.error: " + str(e.get("text"))[:200])

    def eval(self, expr: str):
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in r:
            self.issues.append("eval: " + str(r["exceptionDetails"])[:160])
            return None
        return r.get("result", {}).get("value")

    def wait_for(self, expr: str, timeout: float, label: str) -> bool:
        end = time.time() + timeout
        while time.time() < end:
            if self.eval(expr):
                return True
            time.sleep(0.3)
        self.issues.append(f"timeout: {label}")
        return False

    def shot(self, name: str) -> str:
        d = self.send("Page.captureScreenshot", {"format": "png"})
        p = os.path.join(OUT, name)
        with open(p, "wb") as f:
            f.write(base64.b64decode(d["data"]))
        return p


def target() -> str:
    for _ in range(40):
        try:
            for t in json.loads(opener.open(f"http://127.0.0.1:{PORT}/json/list", timeout=3).read()):
                if t.get("type") == "page":
                    return t["webSocketDebuggerUrl"]
        except Exception:
            time.sleep(0.4)
    raise SystemExit("edge devtools not reachable")


results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def main() -> int:
    cdp = CDP(target())
    cdp.send("Page.enable")
    cdp.send("Runtime.enable")
    cdp.send("Log.enable")
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 980, "deviceScaleFactor": 1, "mobile": False})
    cdp.send("Page.navigate", {"url": BASE})
    cdp.wait_for("document.readyState === 'complete' && !!document.querySelector('.hero__stage svg')", 20, "home")

    check("home: AI entry in nav", "AI 灵感" in (cdp.eval("document.body.innerText") or ""))

    cdp.eval("location.hash = '#/ai'")
    ok = cdp.wait_for("!!document.querySelector('.prompt-input')", 15, "ai page")
    check("ai: page renders (lazy chunk loaded)", ok)
    if not ok:
        print("\nissues:", cdp.issues[:6])
        return 1

    check("ai: disclosure line present", "无需 API Key" in (cdp.eval("document.body.innerText") or ""))
    cdp.shot("20-ai-idle.png")

    # type the prompt through the native setter so React sees it
    typed = cdp.eval(
        "(()=>{const t=document.querySelector('.prompt-input');if(!t)return false;"
        "const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;"
        f"set.call(t,{json.dumps(PROMPT)});t.dispatchEvent(new Event('input',{{bubbles:true}}));return true}})()"
    )
    check("ai: prompt accepted", bool(typed))
    time.sleep(0.3)

    clicked = cdp.eval(
        "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('生成设计'));"
        "if(!b||b.disabled)return false;b.click();return true})()"
    )
    check("ai: generate button clickable", bool(clicked))
    cdp.shot("21-ai-loading.png")

    end = time.time() + 60
    state = ""
    while time.time() < end:
        state = cdp.eval(
            "document.querySelector('.ai-preview')?'success':"
            "(document.querySelector('.ai-error')?'error':"
            "(document.querySelector('.ai-loading')?'loading':'idle'))"
        ) or ""
        if state in ("success", "error"):
            break
        time.sleep(0.5)

    if state == "success":
        title = cdp.eval("document.querySelector('.ai-preview')?.closest('.reveal')?.querySelector('h3')?.textContent || ''")
        chips = cdp.eval("[...document.querySelectorAll('.ai-chips .chip')].map(c=>c.innerText).join(' | ')")
        check("ai: model returned a renderable design", True, str(title))
        check("ai: geometry summary shown", "刀" in (chips or ""), str(chips)[:80])
        check("ai: preview has real paths",
              (cdp.eval("document.querySelectorAll('.ai-preview svg path').length") or 0) >= 1,
              str(cdp.eval("document.querySelectorAll('.ai-preview svg path').length")))
        cdp.shot("22-ai-success.png")

        # An immediate second request must be refused by the client-side
        # interval, and the previous design must survive the failure.
        cdp.eval(
            "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='再生成一张');"
            "if(b){b.click();return true}return false})()"
        )
        time.sleep(1.2)
        rate_msg = cdp.eval("document.querySelector('.ai-error p')?.textContent || ''")
        check("ai: rate limit refuses a second call within 5s", "秒后再生成" in (rate_msg or ""), str(rate_msg)[:40])
        check("ai: previous design is kept after a failed retry",
              cdp.eval("!!document.querySelector('.ai-preview')"),
              "")
        cdp.shot("24-ai-rate-limit.png")

        cdp.eval(
            "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='在工坊中打开');"
            "if(b){b.click();return true}return false})()"
        )
        time.sleep(1.2)
        check("ai -> studio: hand-off lands in the studio",
              cdp.eval("!!document.querySelector('.studio')"),
              str(cdp.eval("location.hash")))
        check("studio: opened with the AI cut count",
              (cdp.eval("document.body.innerText") or "").count("切口") >= 1,
              "")
        cdp.shot("23-ai-to-studio.png")
    else:
        msg = cdp.eval("document.querySelector('.ai-error p')?.textContent || ''")
        kind_ok = cdp.eval("!!document.querySelector('.ai-error .btn')")
        check("ai: failure is shown with an actionable message", bool(msg) and bool(kind_ok), str(msg)[:90])
        cdp.shot("22-ai-error.png")

    # the rest of the app must be unaffected
    cdp.eval("location.hash = '#/puzzle/diamond'")
    cdp.wait_for("!!document.querySelector('.stage-badge')", 10, "puzzle after ai")
    time.sleep(1.8)  # let the fold animation settle so the packet renders per-patch
    check("core: puzzle still works after the AI page",
          (cdp.eval("document.querySelectorAll('.stage-card svg path').length") or 0) >= 4,
          str(cdp.eval("document.querySelectorAll('.stage-card svg path').length")))

    noise = [i for i in cdp.issues if "favicon" not in i.lower() and "timeout: " not in i]
    print("\nconsole issues:", len(noise))
    for i in noise[:10]:
        print("  -", i[:200])

    # mobile layout of the new page
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
    cdp.eval("location.hash = '#/ai'")
    cdp.wait_for("!!document.querySelector('.prompt-input')", 10, "ai mobile")
    time.sleep(0.8)
    check("ai mobile: no horizontal overflow",
          cdp.eval("document.documentElement.scrollWidth <= window.innerWidth + 2"),
          str(cdp.eval("document.documentElement.scrollWidth")) + " vs " + str(cdp.eval("window.innerWidth")))
    cdp.eval(
        "(()=>{const b=document.querySelector('.example-chip');if(b){b.click();return true}return false})()"
    )
    time.sleep(0.3)
    cdp.shot("25-ai-mobile.png")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    cdp.ws.close()
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
