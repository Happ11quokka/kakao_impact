#!/usr/bin/env python3
"""유로그 카카오톡 챗봇 — 부정감정 자기인지(reflection) 질문 플로우.

원석 저장 직후 자기인지 질문을 띄울지 판단하는 게이트와 조건, 그리고
초대 → 질문 → 답변 → records 저장까지의 상태 전이를 정리한다.
라인 번호는 2_avoha/ai/chatbot/main.py 기준.
"""
from excalidraw_lib import Canvas, ENTRY, BOT, RESP, STATE, AI, SUP, REF

c = Canvas()

c.freetext(60, 24, "부정감정 자기인지(reflection) 질문 플로우", font=30)
c.freetext(62, 66,
           "원석 저장 직후 → 게이트(AND) → 트리거(OR) → 질문 선택 → 초대 → 답변 저장 "
           "(main.py:1428~1521, 2817~2832)", font=15, color="#868e96")

cx, cw = 360, 420  # 중앙 스파인

# 진입: 저장 완료 후 invite 부착 시도
entry = c.box("entry", cx, 120, cw, 56,
              "원석 저장 완료 (맞아요 / 모두·골라 채집 / 일상→감정)\n"
              "→ _maybe_attach_reflection_invite (1492)",
              bg=ENTRY[0], stroke=ENTRY[1], font=12)

# 게이트 (AND 4조건) — check_reflection_question (1428)
gate = c.box("gate", cx - 30, 220, cw + 60, 110,
             "★ 게이트  check_reflection_question (1428)  — 모두 만족해야 진행\n"
             "① record_mode == 대화모드 (단순모드 제외)\n"
             "② 본문 길이 ≤ 30자\n"
             "③ gem ∈ NEGATIVE_GEMS (긍정 5종 제외)\n"
             "④ 카테고리 ≠ 기쁨/긍정",
             bg=SUP[0], stroke=SUP[1], font=11, align="left", sw=3)

# 트리거 (OR 3조건) — _has_negative_reflection_trigger (1361)
trig = c.diamond("trig", cx - 40, 372, cw + 80, 150,
                 "트리거 _has_negative_reflection_trigger (1361)\n"
                 "다음 중 하나라도 참?\n"
                 "① 이번 주 해당 계열 첫 등장\n"
                 "② 오늘 포함 3일 연속 부정감정\n"
                 "③ 같은 계열 마지막 기록 후 7일+ 경과",
                 bg=AI[0], stroke=AI[1], font=11)

# 질문 선택 — _select_reflection_question (1278)
select = c.box("select", cx - 20, 560, cw + 40, 96,
               "질문 선택  _select_reflection_question (1278)\n"
               "· 이번 주 이미 질문했으면 중단 (questions_log 주1회 UNIQUE)\n"
               "· 카테고리 우선 → general 폴백, 최근 7일 출제 문항 회피\n"
               "· questions_log 기록 후 {question_id, question_text} 반환",
               bg=BOT[0], stroke=BOT[1], font=11, align="left")

# 초대 메시지 — _maybe_attach_reflection_invite (1511)
invite = c.box("invite", cx - 10, 690, cw + 20, 92,
               "초대 메시지 부착 (1511) · pending_reflection = awaiting_answer\n"
               "'방금 느낀 감정을 조금만 더 자세히 알려주세요 💭'\n"
               "'… 이 글은 아무도 보지 않으니, 그냥 툭 기록해보아요 👻'\n"
               "[QR: 건너뛰기]",
               bg=RESP[0], stroke=RESP[1], font=11, align="left")

c.edge(entry, gate, start="bottom", end="top")
c.edge(gate, trig, start="bottom", end="top", color="#e8590c", sw=2)
c.edge(trig, select, start="bottom", end="top", color=AI[1], label="예")
c.edge(select, invite, start="bottom", end="top", color=BOT[1])

# 중단 경로 (오른쪽)
stop = c.box("stop", cx + cw + 110, 372, 300, 150,
             "should_ask = False → 종료\n\n"
             "게이트 불충족 / 트리거 모두 거짓 /\n이번 주 이미 질문함 / 풀 소진\n\n"
             "→ 자기인지 질문 없이\n저장 응답만 반환",
             bg=REF[0], stroke=REF[1], font=11, align="left")
c.edge(gate, stop, start="right", end="left", dashed=True, color=REF[1], label="불충족")
c.edge(trig, stop, start="right", end="left", dashed=True, color=REF[1], label="모두 거짓")
c.edge(select, stop, start="right", end="top", dashed=True, color=REF[1], label="없음")

# ── 초대 이후 사용자 응답 분기 (하단) ──
c.zone(60, 830, 1240, 280, "#f1f3f5",
       "초대 이후 사용자 응답 분기  (webhook 디스패처, pending_reflection 상태)", "#868e96")

ans = c.box("ans", 90, 900, 360, 90,
            "임의 텍스트 입력 (stage=awaiting_answer, 2817)\n"
            "→ save_reflection_answer (1451) 백그라운드\n"
            "→ records(type=reflection, week_id) INSERT\n"
            "→ '잘 담아뒀어요 ✎' [QR: 기본]",
            bg=RESP[0], stroke=RESP[1], font=11, align="left")

skip = c.box("skip", 490, 900, 360, 90,
             "건너뛰기 / 건너뛸게요 (2368)\n"
             "→ pending_reflection 제거\n"
             "→ basicCard '지금 느낀 만큼만 담아둘게요'\n"
             "[QR: 기본]",
             bg=STATE[0], stroke=STATE[1], font=11, align="left")

extra = c.box("extra", 890, 900, 380, 90,
              "답할게요 (2391) → '편하게 적어주세요 :)'\n"
              "질문 받을게요 (2384) → 질문 텍스트 재노출\n"
              "(둘 다 stage 전환만, 최종 저장은 좌측 경로)",
              bg=BOT[0], stroke=BOT[1], font=11, align="left")

c.edge(invite, ans, start="bottom", end="top", color=RESP[1], label="답변")
c.edge(invite, skip, start="bottom", end="top", color=STATE[1], label="건너뛰기")

# 참고: 챗봇 즉시형 vs 웹 주간형
c.freetext(820, 150,
           "질문 풀: INITIAL_REFLECTION_QUESTIONS (700)\n"
           "슬픔/분노/불안/복잡/general 카테고리별\n"
           "DB questions 테이블에 시드\n\n"
           "카테고리 매핑:\n"
           "EMOTION_TO_REFLECTION_CATEGORY (528)\n"
           "_normalize_reflection_category (1260)",
           font=12, color="#495057")

c.freetext(820, 320,
           "참고 — 두 가지 reflection 시스템:\n"
           "· 챗봇 = 즉시형 (저장 직후, 본 다이어그램)\n"
           "· 웹 = 주간형 (frontend reflection-prompts.ts)",
           font=12, color="#868e96")

out = "/Users/imdonghyeon/kakaoimpact/docs/chatbot-reflection-flow.excalidraw"
n = c.save(out)
print(f"wrote {out} with {n} elements")
