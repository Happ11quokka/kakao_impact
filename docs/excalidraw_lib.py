#!/usr/bin/env python3
"""Excalidraw 플로우차트 생성용 공용 프리미티브.

`gen_chatbot_*` 스크립트들이 공유한다. 각 스크립트는 Canvas 인스턴스를
하나 만들고 box/diamond/freetext/zone/edge 로 요소를 쌓은 뒤 save() 한다.
전역 상태 대신 인스턴스에 elements/seed 를 담아 스크립트당 독립 실행된다.
"""
import json

# 공용 색 팔레트 (stroke/배경 쌍은 각 스크립트가 필요에 따라 골라 쓴다)
ENTRY = ("#a5d8ff", "#1971c2")   # 진입 노드
BOT = ("#d0bfff", "#6741d9")     # 챗봇 처리
SUP = ("#ffd8a8", "#e8590c")     # Supervisor / 검증
AI = ("#96f2d7", "#0c8599")      # AI 호출 / 분기
RESP = ("#b2f2bb", "#2f9e44")    # 응답 출력
REF = ("#e9ecef", "#868e96")     # 외부 의존 / 참조
WARN = ("#ffc9c9", "#e03131")    # 안전 / 경고
STATE = ("#fff3bf", "#f08c00")   # 인메모리 상태 / 결과


class Canvas:
    """Excalidraw 요소를 쌓아 .excalidraw(JSON)로 직렬화한다."""

    def __init__(self, seed_base: int = 1000):
        self.elements: list[dict] = []
        self._seed = seed_base

    def nseed(self) -> int:
        self._seed += 7919
        return self._seed

    def box(self, eid, x, y, w, h, label, *, bg="#ffffff", stroke="#1e1e1e",
            font=14, align="center", sw=2):
        tid = eid + "_t"
        rect = {
            "id": eid, "type": "rectangle", "x": x, "y": y, "width": w, "height": h,
            "angle": 0, "strokeColor": stroke, "backgroundColor": bg,
            "fillStyle": "solid", "strokeWidth": sw, "strokeStyle": "solid",
            "roughness": 0, "opacity": 100, "groupIds": [], "frameId": None,
            "roundness": {"type": 3}, "seed": self.nseed(), "version": 1,
            "versionNonce": self.nseed(), "isDeleted": False,
            "boundElements": [{"type": "text", "id": tid}], "updated": 1,
            "link": None, "locked": False,
        }
        lines = label.split("\n")
        th = font * 1.25 * len(lines)
        text = {
            "id": tid, "type": "text", "x": x + 8, "y": y + (h - th) / 2,
            "width": w - 16, "height": th, "angle": 0, "strokeColor": stroke,
            "backgroundColor": "transparent", "fillStyle": "solid",
            "strokeWidth": sw, "strokeStyle": "solid", "roughness": 0,
            "opacity": 100, "groupIds": [], "frameId": None, "roundness": None,
            "seed": self.nseed(), "version": 1, "versionNonce": self.nseed(),
            "isDeleted": False, "boundElements": [], "updated": 1, "link": None,
            "locked": False, "fontSize": font, "fontFamily": 1, "text": label,
            "textAlign": align, "verticalAlign": "middle", "containerId": eid,
            "originalText": label, "autoResize": True, "lineHeight": 1.25,
        }
        self.elements.append(rect)
        self.elements.append(text)
        return rect

    def diamond(self, eid, x, y, w, h, label, *, bg="#c3fae8", stroke="#0c8599",
                font=14):
        tid = eid + "_t"
        self.elements.append({
            "id": eid, "type": "diamond", "x": x, "y": y, "width": w, "height": h,
            "angle": 0, "strokeColor": stroke, "backgroundColor": bg,
            "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
            "roughness": 0, "opacity": 100, "groupIds": [], "frameId": None,
            "roundness": None, "seed": self.nseed(), "version": 1,
            "versionNonce": self.nseed(), "isDeleted": False,
            "boundElements": [{"type": "text", "id": tid}], "updated": 1,
            "link": None, "locked": False,
        })
        th = font * 1.25 * len(label.split("\n"))
        self.elements.append({
            "id": tid, "type": "text", "x": x + 8, "y": y + (h - th) / 2,
            "width": w - 16, "height": th, "angle": 0, "strokeColor": stroke,
            "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 2,
            "strokeStyle": "solid", "roughness": 0, "opacity": 100, "groupIds": [],
            "frameId": None, "roundness": None, "seed": self.nseed(), "version": 1,
            "versionNonce": self.nseed(), "isDeleted": False, "boundElements": [],
            "updated": 1, "link": None, "locked": False, "fontSize": font,
            "fontFamily": 1, "text": label, "textAlign": "center",
            "verticalAlign": "middle", "containerId": eid, "originalText": label,
            "autoResize": True, "lineHeight": 1.25,
        })
        return self.elements[-2]

    def freetext(self, x, y, label, *, font=20, color="#1e1e1e", align="left"):
        lines = label.split("\n")
        width = max(len(l) for l in lines) * font * 0.62
        self.elements.append({
            "id": f"ft_{self.nseed()}", "type": "text", "x": x, "y": y,
            "width": width, "height": font * 1.25 * len(lines), "angle": 0,
            "strokeColor": color, "backgroundColor": "transparent",
            "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
            "roughness": 0, "opacity": 100, "groupIds": [], "frameId": None,
            "roundness": None, "seed": self.nseed(), "version": 1,
            "versionNonce": self.nseed(), "isDeleted": False, "boundElements": [],
            "updated": 1, "link": None, "locked": False, "fontSize": font,
            "fontFamily": 1, "text": label, "textAlign": align,
            "verticalAlign": "top", "containerId": None, "originalText": label,
            "autoResize": True, "lineHeight": 1.25,
        })

    def zone(self, x, y, w, h, bg, title, tc):
        self.elements.append({
            "id": f"zone_{self.nseed()}", "type": "rectangle", "x": x, "y": y,
            "width": w, "height": h, "angle": 0, "strokeColor": tc,
            "backgroundColor": bg, "fillStyle": "solid", "strokeWidth": 2,
            "strokeStyle": "dashed", "roughness": 0, "opacity": 100,
            "groupIds": [], "frameId": None, "roundness": {"type": 3},
            "seed": self.nseed(), "version": 1, "versionNonce": self.nseed(),
            "isDeleted": False, "boundElements": [], "updated": 1, "link": None,
            "locked": False,
        })
        self.freetext(x + 16, y + 12, title, font=19, color=tc)

    def edge(self, a, b, *, label=None, dashed=False, color="#1e1e1e", sw=2,
             start="right", end="left", curve=None):
        def anchor(el, side):
            x, y, w, h = el["x"], el["y"], el["width"], el["height"]
            return {"left": (x, y + h / 2), "right": (x + w, y + h / 2),
                    "top": (x + w / 2, y), "bottom": (x + w / 2, y + h)}[side]
        sx, sy = anchor(a, start)
        ex, ey = anchor(b, end)
        aid = f"arr_{self.nseed()}"
        pts = [[0, 0]] + ([[p[0] - sx, p[1] - sy] for p in curve] if curve else []) + [[ex - sx, ey - sy]]
        arrow = {
            "id": aid, "type": "arrow", "x": sx, "y": sy,
            "width": abs(ex - sx), "height": abs(ey - sy), "angle": 0,
            "strokeColor": color, "backgroundColor": "transparent",
            "fillStyle": "solid", "strokeWidth": sw,
            "strokeStyle": "dashed" if dashed else "solid", "roughness": 0,
            "opacity": 100, "groupIds": [], "frameId": None,
            "roundness": {"type": 2}, "seed": self.nseed(), "version": 1,
            "versionNonce": self.nseed(), "isDeleted": False, "boundElements": [],
            "updated": 1, "link": None, "locked": False, "points": pts,
            "lastCommittedPoint": None,
            "startBinding": {"elementId": a["id"], "focus": 0, "gap": 6},
            "endBinding": {"elementId": b["id"], "focus": 0, "gap": 6},
            "startArrowhead": None, "endArrowhead": "triangle",
        }
        a.setdefault("boundElements", []).append({"type": "arrow", "id": aid})
        b.setdefault("boundElements", []).append({"type": "arrow", "id": aid})
        self.elements.append(arrow)
        if label:
            self.freetext((sx + ex) / 2 - len(label) * 3.4, (sy + ey) / 2 - 18,
                          label, font=12, color=color)

    def save(self, out_path: str) -> int:
        doc = {
            "type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
            "elements": self.elements,
            "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
            "files": {},
        }
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        return len(self.elements)
