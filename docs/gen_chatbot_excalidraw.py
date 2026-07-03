#!/usr/bin/env python3
"""유로그 카카오톡 챗봇 아키텍처 — 챗봇 전용 Excalidraw 생성기.

챗봇 내부(시나리오 디스패처 → 감정 분류 파이프라인 → 응답 + 인메모리 상태)만 정리.
외부 채널·백엔드는 작은 참조 노드로만 표시.
"""
from excalidraw_lib import Canvas, ENTRY, AI, SUP, RESP, REF

c = Canvas()

c.freetext(60, 24, "유로그 카카오톡 챗봇 — 감정 분류 파이프라인", font=30)
c.freetext(62, 66, "webhook → 콜백 분기 → 1차 분류 → Supervisor 검증 → 응답", font=15, color="#868e96")

# 메인 흐름 (단일 세로 컬럼)
mx, mw = 200, 360

webhook = c.box("webhook", mx, 130, mw, 56,
                "POST /webhook  (FastAPI)\nuser_id · 발화 · callback_url 추출",
                bg=ENTRY[0], stroke=ENTRY[1], font=13)

cb = c.diamond("cb", mx + 20, 230, mw - 40, 66,
               "콜백 분기  callback_url?", bg="#c3fae8", stroke=AI[1], font=13)

classify = c.box("classify", mx, 340, mw, 56,
                 "① classify_emotion()\nGPT 1차 분류 · 감정 20종 + 오타 보정",
                 bg=AI[0], stroke=AI[1], font=13)

sup = c.box("sup", mx - 30, 440, mw + 60, 122,
            "★ ② Supervisor 검증\n"
            "시나리오 goal 검증 (기록아님 / 일상기록 / 원석 최대 3개)\n"
            "과소·과잉 분류 교정 · 허용목록 밖 = 실패\n"
            "출력 JSON {pass, corrected_result, reason}\n"
            "pass=false 이고 교정값≠1차 일 때만 덮어씀",
            bg=SUP[0], stroke=SUP[1], font=12, sw=4)

result = c.box("result", mx, 610, mw, 50,
               "결과: 원석 1~3개 / 일상기록 / 기록아님 / TIMEOUT",
               bg="#fff3bf", stroke="#f08c00", font=12.5)

resp = c.box("resp", mx, 700, mw, 64,
             "카카오 응답 생성\nbasicCard / simpleText + Quick Reply\n콜백 또는 동기 회신",
             bg=RESP[0], stroke=RESP[1], font=12.5)

c.edge(webhook, cb, start="bottom", end="top")
c.edge(cb, classify, start="bottom", end="top", color=AI[1])
c.edge(classify, sup, start="bottom", end="top", color=SUP[1], sw=3)
c.edge(sup, result, start="bottom", end="top", color=SUP[1], sw=3)
c.edge(result, resp, start="bottom", end="top", color=RESP[1])

# 콜백 분기 보조 설명
c.freetext(mx + mw + 16, 244,
           "callback_url 있음 →\n즉시 useCallback 반환,\n백그라운드 분류 후 회신",
           font=11, color=AI[1])

# Supervisor 동작 조건 (왼쪽)
c.freetext(20, 470,
           "SUPERVISOR_ENABLED=false\n→ 건너뜀\nTIMEOUT / None / 예외\n→ 1차 결과 유지",
           font=11, color=SUP[1])

# ── 외부 의존 (작은 참조 노드, 오른쪽) ──
openai = c.box("openai", mx + mw + 60, 340, 230, 56,
               "OpenAI gpt-4.1-mini\nclassify · supervisor 호출",
               bg=REF[0], stroke=REF[1], font=12)
db = c.box("db", mx + mw + 60, 610, 230, 56,
           "Railway PostgreSQL\nsave_gem · 전체 로그",
           bg=REF[0], stroke=REF[1], font=12)
c.edge(classify, openai, start="right", end="left", dashed=True, color=REF[1], label="chat")
c.edge(sup, openai, start="right", end="left", dashed=True, color=REF[1])
c.edge(result, db, start="right", end="left", dashed=True, color=REF[1], label="저장 / 로깅")

# 범례
c.freetext(mx + mw + 60, 460,
           "실선 = 요청 흐름\n점선 = 외부 호출\n★ = Supervisor 검증",
           font=12, color="#868e96")

out = "/Users/imdonghyeon/kakaoimpact/docs/chatbot-architecture.excalidraw"
n = c.save(out)
print(f"wrote {out} with {n} elements")
