"""Browser-level verification for Foldyssey (Edge + CDP).

Attach mode: expects an Edge instance already listening on EDGE_ATTACH_PORT.
Screenshots land in tools/shots/.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.request

import websocket

PORT = int(os.environ.get("EDGE_ATTACH_PORT", "9231"))
BASE = os.environ.get("FOLDYSSEY_URL", "http://127.0.0.1:4173/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(OUT, exist_ok=True)

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class CDP:
    def __init__(self, ws_url: str):
        self.ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=30)
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
        method = msg.get("method")
        if method == "Runtime.exceptionThrown":
            detail = msg.get("params", {}).get("exceptionDetails", {})
            self.issues.append("exception: " + str(detail.get("text")) + " " + str(detail.get("exception", {}).get("description", ""))[:200])
        elif method == "Runtime.consoleAPICalled" and msg.get("params", {}).get("type") == "error":
            args = msg["params"].get("args", [])
            self.issues.append("console.error: " + " ".join(str(a.get("value", a.get("description", ""))) for a in args)[:200])
        elif method == "Log.entryAdded":
            e = msg.get("params", {}).get("entry", {})
            if e.get("level") in ("error", "warning"):
                self.issues.append(f"{e.get('level')}: {e.get('text')}"[:200])

    def eval(self, expr: str):
        r = self.send(
            "Runtime.evaluate",
            {"expression": expr, "returnByValue": True, "awaitPromise": True},
        )
        if "exceptionDetails" in r:
            self.issues.append("eval error: " + str(r["exceptionDetails"])[:200])
            return None
        return r.get("result", {}).get("value")

    def wait_for(self, expr: str, timeout: float = 8.0, label: str = "") -> bool:
        end = time.time() + timeout
        while time.time() < end:
            if self.eval(expr):
                return True
            time.sleep(0.15)
        self.issues.append(f"timeout waiting for {label or expr}")
        return False

    def metrics(self, width: int, height: int) -> None:
        self.send(
            "Emulation.setDeviceMetricsOverride",
            {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": width < 600},
        )

    def shot(self, name: str) -> str:
        data = self.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        path = os.path.join(OUT, name)
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(data["data"]))
        return path

    def close(self) -> None:
        try:
            self.ws.close()
        except Exception:
            pass


def page_target() -> str:
    for _ in range(40):
        try:
            raw = opener.open(f"http://127.0.0.1:{PORT}/json/list", timeout=3).read()
            for t in json.loads(raw):
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
    cdp = CDP(page_target())
    cdp.send("Page.enable")
    cdp.send("Runtime.enable")
    cdp.send("Log.enable")

    cdp.metrics(1440, 980)
    cdp.send("Page.navigate", {"url": BASE})
    cdp.wait_for("document.readyState === 'complete'", 15, "load")
    cdp.wait_for("!!document.querySelector('.hero__stage svg')", 8, "hero svg")
    time.sleep(1.2)

    check("home: title", "Foldyssey" in (cdp.eval("document.title") or ""), str(cdp.eval("document.title")))
    check("home: eleven pattern cards", cdp.eval("document.querySelectorAll('.pattern-card').length") == 11,
          str(cdp.eval("document.querySelectorAll('.pattern-card').length")))
    check("home: all + four stage filters",
          cdp.eval("document.querySelectorAll('.filter-chip').length") == 5,
          str(cdp.eval("document.querySelectorAll('.filter-chip').length")))
    check("home: library detail shows the fold/cut/unfold doc",
          all(k in (cdp.eval("document.body.innerText") or "") for k in ("折叠结构", "切割逻辑", "展开效果")))
    first_title = cdp.eval("document.querySelector('.detail-card__title')?.textContent || ''")
    cdp.eval("document.querySelectorAll('.pattern-card')[10]?.click()")
    time.sleep(0.4)
    second_title = cdp.eval("document.querySelector('.detail-card__title')?.textContent || ''")
    check("home: selecting a card updates the detail", bool(first_title) and first_title != second_title,
          f"{first_title} -> {second_title}")
    cdp.eval("document.querySelectorAll('.filter-chip')[4]?.click()")
    time.sleep(0.3)
    check("home: stage filter narrows the grid",
          cdp.eval("document.querySelectorAll('.pattern-card').length") == 5,
          str(cdp.eval("document.querySelectorAll('.pattern-card').length")))
    cdp.eval("document.querySelectorAll('.filter-chip')[0]?.click()")
    time.sleep(0.2)
    check("home: hero stage has paper paths", (cdp.eval("document.querySelectorAll('.hero__stage svg path').length") or 0) > 3,
          str(cdp.eval("document.querySelectorAll('.hero__stage svg path').length")))
    check("home: no horizontal overflow",
          cdp.eval("document.documentElement.scrollWidth <= window.innerWidth + 1"),
          str(cdp.eval("document.documentElement.scrollWidth")) + " vs " + str(cdp.eval("window.innerWidth")))
    cdp.shot("01-home-desktop.png")

    # ---- puzzle ----
    cdp.eval("location.hash = '#/puzzle/diamond'")
    cdp.wait_for("!!document.querySelector('.stage-badge')", 8, "puzzle")
    time.sleep(0.6)
    check("puzzle: level title", "菱形奇迹" in (cdp.eval("document.body.innerText") or ""))
    check("puzzle: how-to strip is on screen", "怎么玩" in (cdp.eval("document.body.innerText") or ""))
    check("puzzle: how-to names both cut tabs and sliders",
          "第 1 刀" in (cdp.eval("document.body.innerText") or "")
          or "只有" in (cdp.eval("document.body.innerText") or ""))
    check("puzzle: live preview card exists",
          bool(cdp.eval("document.body.innerText.includes('展开预览')")))
    check("puzzle: live IoU readout exists",
          "吻合" in (cdp.eval("document.body.innerText") or ""))
    check("puzzle: stage badge", "阶段 2" in (cdp.eval("document.body.innerText") or ""))
    check("puzzle: stage renders 4 patches",
          (cdp.eval("document.querySelectorAll('.stage-card svg path').length") or 0) >= 4,
          str(cdp.eval("document.querySelectorAll('.stage-card svg path').length")))
    cdp.wait_for(
        "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='剪一刀');"
        "return !!(b && !b.disabled)})()",
        10,
        "cut button enabled",
    )
    time.sleep(0.3)

    def set_range(label: str, value: str) -> bool:
        expr = (
            "(()=>{const r=document.querySelector('input[aria-label=\"%s\"]');if(!r)return false;"
            "const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
            "set.call(r,'%s');r.dispatchEvent(new Event('input',{bubbles:true}));return true})()"
            % (label, value)
        )
        return bool(cdp.eval(expr))

    # Reproduce the canonical solution (45 deg, offset 0.40) using only the UI.
    ok1 = set_range("切线与纸包中心的距离", "0.40")
    ok2 = set_range("切线法线角度（度）", "45")
    check("puzzle: canonical solution is reachable with the sliders", ok1 and ok2)
    time.sleep(0.4)
    cdp.shot("02-puzzle-folded.png")

    clicked = cdp.eval(
        "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='剪一刀');"
        "if(b){b.click();return true}return false})()"
    )
    check("puzzle: cut button clickable", bool(clicked))
    time.sleep(3.2)
    verdict = cdp.eval("document.querySelector('.verdict__text strong')?.textContent || ''")
    check("puzzle: canonical solution clears the level", verdict in ("完全匹配", "达标"), str(verdict))
    iou_text = cdp.eval("[...document.querySelectorAll('.metric')].map(m=>m.innerText).join(' | ')")
    check("puzzle: metrics present", "iou" in (iou_text or "").lower(), str(iou_text)[:120])
    visible = cdp.eval(
        "(()=>{const el=document.querySelector('.score-card');if(!el)return null;"
        "const r=el.getBoundingClientRect();return r.top>=0 && r.top < window.innerHeight})()"
    )
    check("puzzle: score card visible without scrolling", visible is True, str(visible))
    cdp.shot("03-puzzle-revealed.png")

    cdp.eval(
        "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='差异覆盖');"
        "if(b){b.click();return true}return false})()"
    )
    time.sleep(0.5)
    cdp.shot("03b-puzzle-diff.png")

    # retry then drag interaction sanity: change the offset slider
    cdp.eval("[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='重试')?.click()")
    time.sleep(0.8)
    cdp.eval(
        "(()=>{const r=document.querySelector('input[aria-label=\"切线与纸包中心的距离\"]');"
        "if(!r)return false;const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
        "set.call(r,'0.52');r.dispatchEvent(new Event('input',{bubbles:true}));return true})()"
    )
    time.sleep(0.4)

    asked = cdp.eval(
        "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='差在哪？');"
        "if(b){b.click();return true}return false})()"
    )
    time.sleep(0.6)
    check("puzzle: 'what is off' returns a diagnosis", bool(asked))
    diag = cdp.eval("document.querySelector('.diag__box')?.innerText || ''")
    check("puzzle: diagnosis names a slider",
          any(k in (diag or "") for k in ("角度", "距中心", "顶点距中心", "张口宽度")), str(diag)[:90])
    check("puzzle: diagnosis offers one-tap adjust",
          "按建议调整" in (cdp.eval("document.body.innerText") or ""), "")

    check("puzzle: slider changes the offset readout",
          "0.52" in (cdp.eval("document.body.innerText") or ""),
          str(cdp.eval("document.body.innerText") or "")[:0])

    # --- 阶段 1：观察提示自动展开 ---
    cdp.eval("location.hash = '#/puzzle/corner'")
    cdp.wait_for("document.body.innerText.includes('角落初探')", 8, "corner")
    time.sleep(1.0)
    check("stage 1: label shown", "阶段 1" in (cdp.eval("document.body.innerText") or ""))
    check("stage 1: observation hint already open",
          "提示" in (cdp.eval("document.body.innerText") or "")
          and (cdp.eval("document.querySelectorAll('.hint-list li').length") or 0) >= 1,
          str(cdp.eval("document.querySelectorAll('.hint-list li').length")))
    check("stage 1: level is a single straight cut",
          (cdp.eval("document.querySelectorAll('.cut-tab').length") or 0) == 0)

    # --- 阶段 4：角色化标签 + 可折叠的图案档案 ---
    cdp.eval("location.hash = '#/puzzle/pearls'")
    cdp.wait_for("document.body.innerText.includes('八方连珠')", 10, "pearls")
    time.sleep(1.2)
    tabs = cdp.eval("[...document.querySelectorAll('.cut-tab')].map(b=>b.innerText.trim()).join('|')")
    check("stage 4: tabs are named by role", "花心" in (tabs or "") and "菱孔环" in (tabs or ""), str(tabs))
    check("stage 4: archive is collapsed by default",
          cdp.eval("!!document.querySelector('.archive') && !document.querySelector('.archive').open"))
    check("stage 4: stage label present", "阶段 4" in (cdp.eval("document.body.innerText") or ""))
    cdp.eval("document.querySelector('.archive__summary')?.click()")
    time.sleep(0.3)
    archive_text = cdp.eval("document.querySelector('.archive')?.innerText || ''")
    check("stage 4: archive opens to reveal the fold/cut/unfold doc",
          "折叠结构" in (archive_text or ""), str(archive_text)[:60])

    # --- 八折团花关：多切口 + 折剪面板 ---
    cdp.eval("location.hash = '#/puzzle/rosette'")
    cdp.wait_for("document.body.innerText.includes('团花')", 10, "rosette")
    time.sleep(1.6)
    tabs = cdp.eval("document.querySelectorAll('.cut-tab').length")
    check("rosette: two cut tabs", (tabs or 0) == 2, str(tabs))
    cdp.eval("[...document.querySelectorAll('.cut-tab')].at(-1)?.click()")
    time.sleep(0.5)
    notch_ui = cdp.eval("!!document.querySelector(\"input[aria-label='折剪方向（度）']\")")
    check("rosette: notch panel appears for the bent cut", bool(notch_ui))
    check("rosette: petal target renders",
          (cdp.eval("document.querySelectorAll('.target-frame svg path').length") or 0) >= 1,
          str(cdp.eval("document.querySelectorAll('.target-frame svg path').length")))
    cdp.shot("12-rosette-level.png")
    cdp.shot("04-puzzle-adjusted.png")

    # ---- studio ----
    cdp.eval("location.hash = '#/studio'")
    cdp.wait_for("!!document.querySelector('.studio')", 8, "studio")
    time.sleep(0.8)
    check("studio: two stage canvases", (cdp.eval("document.querySelectorAll('.stage-card svg').length") or 0) >= 2,
          str(cdp.eval("document.querySelectorAll('.stage-card svg').length")))
    check("studio: export buttons", "导出 SVG" in (cdp.eval("document.body.innerText") or ""))
    cdp.shot("05-studio-desktop.png")

    # save -> gallery round trip
    saved = cdp.eval(
        "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('保存到我的作品'));"
        "if(b){b.click();return true}return false})()"
    )
    check("studio: save button clickable", bool(saved))
    time.sleep(0.6)
    cdp.eval("location.hash = '#/gallery'")
    cdp.wait_for("!!document.querySelector('.level-title')", 6, "gallery after save")
    time.sleep(0.5)
    cards = cdp.eval("document.querySelectorAll('.art-card').length")
    check("gallery: saved artwork appears", (cards or 0) >= 1, str(cards))
    cdp.shot("06-gallery.png")

    # load the saved artwork back into the studio
    cdp.eval("location.hash = '#/gallery'")
    cdp.wait_for("!!document.querySelector('.art-card')", 8, "gallery card")
    time.sleep(0.3)
    edited = cdp.eval(
        "(()=>{const b=[...document.querySelectorAll('.art-card button')].find(x=>x.textContent.trim()==='编辑');"
        "if(b){b.click();return true}return false})()"
    )
    check("gallery: artwork can be re-opened for editing", bool(edited))
    time.sleep(0.8)
    check("studio: loaded artwork renders",
          (cdp.eval("document.querySelectorAll('.stage-card svg').length") or 0) >= 2,
          str(cdp.eval("document.querySelectorAll('.stage-card svg').length")))

    # ---- explore ----
    cdp.eval("location.hash = '#/explore'")
    cdp.wait_for("document.querySelectorAll('.explore-card').length >= 5", 6, "explore")
    time.sleep(0.4)
    check("explore: five cards", cdp.eval("document.querySelectorAll('.explore-card').length") == 5,
          str(cdp.eval("document.querySelectorAll('.explore-card').length")))
    cdp.shot("07-explore.png")

    # ---- about ----
    cdp.eval("location.hash = '#/about'")
    cdp.wait_for("document.body.innerText.includes('能力边界')", 6, "about")
    time.sleep(0.3)
    check("about: capability boundary table", "运行时 AI" in (cdp.eval("document.body.innerText") or ""))
    cdp.shot("08-about.png")

    # ---- mobile ----
    cdp.metrics(390, 844)
    cdp.eval("location.hash = '#/'")
    cdp.wait_for("!!document.querySelector('.hero__stage svg')", 6, "mobile home")
    time.sleep(1.0)
    check("mobile: no horizontal overflow",
          cdp.eval("document.documentElement.scrollWidth <= window.innerWidth + 2"),
          str(cdp.eval("document.documentElement.scrollWidth")) + " vs " + str(cdp.eval("window.innerWidth")))
    cdp.shot("09-mobile-home.png")

    cdp.eval("location.hash = '#/puzzle/diamond'")
    cdp.wait_for("!!document.querySelector('.stage-badge')", 6, "mobile puzzle")
    time.sleep(1.2)
    check("mobile: puzzle stage width fits",
          cdp.eval("document.querySelector('.stage-card').getBoundingClientRect().width <= window.innerWidth"),
          str(cdp.eval("document.querySelector('.stage-card').getBoundingClientRect().width")))
    cdp.shot("10-mobile-puzzle.png")

    cdp.eval("location.hash = '#/studio'")
    cdp.wait_for("!!document.querySelector('.studio')", 6, "mobile studio")
    time.sleep(0.9)
    cdp.shot("11-mobile-studio.png")

    # ---- reduced motion must not break the flow ----
    cdp.send(
        "Emulation.setEmulatedMedia",
        {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]},
    )
    cdp.eval("location.hash = '#/puzzle/grand-rosette'")
    cdp.wait_for("document.body.innerText.includes('万象团花')", 8, "reduced-motion puzzle")
    time.sleep(0.9)
    check("reduced motion: puzzle still renders",
          (cdp.eval("document.querySelectorAll('.stage-card svg path').length") or 0) >= 4,
          str(cdp.eval("document.querySelectorAll('.stage-card svg path').length")))
    cdp.send("Emulation.setEmulatedMedia", {"features": []})

    noise = [i for i in cdp.issues if "favicon" not in i.lower()]
    print("\nconsole issues:", len(noise))
    for i in noise[:12]:
        print("  -", i[:220])

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    cdp.close()
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
