#!/usr/bin/env python3
"""유로그 카카오톡 챗봇 — 시나리오 디스패처 Excalidraw 생성기.

webhook() 의 우선순위 캐스케이드(위→아래, 첫 매치에서 응답 후 종료)를
시나리오별 트리거 → 응답 → Quick Reply 로 정리한다. 라인 번호는
2_avoha/ai/chatbot/main.py 기준.
"""
from excalidraw_lib import Canvas, ENTRY, BOT, RESP, WARN, STATE

c = Canvas()


def stack(x, y, w, items, bg, stroke, *, gap=14, font=11):
    """위→아래로 박스를 쌓고 (rects, 다음 y) 반환. 라벨 줄 수로 높이 자동."""
    rects = []
    cy = y
    for eid, label in items:
        lines = label.count("\n") + 1
        h = 22 + lines * 15
        rects.append(c.box(eid, x, cy, w, h, label, bg=bg, stroke=stroke,
                           font=font, align="left"))
        cy += h + gap
    return rects, cy


c.freetext(60, 24, "유로그 카카오톡 챗봇 — 시나리오 디스패처", font=30)
c.freetext(62, 66,
           "webhook() 우선순위 캐스케이드 · 위에서 아래로 검사하고 첫 매치에서 응답 후 종료 "
           "(main.py:2333~2956)", font=15, color="#868e96")

# ── 진입 + 최우선 안전 게이트 ──
webhook = c.box("webhook", 700, 110, 380, 56,
                "POST /webhook  (FastAPI, main.py:2333)\n"
                "user_id · utterance · callback_url 추출 → inbound 로그",
                bg=ENTRY[0], stroke=ENTRY[1], font=12)

danger = c.box("danger", 470, 220, 360, 70,
               "위기 키워드 (2359)\n죽고싶/자살/자해 …\n→ DANGER_MESSAGE(상담전화) + 관리자 메일",
               bg=WARN[0], stroke=WARN[1], font=11, align="left")
harmful = c.box("harmful", 950, 220, 360, 70,
                "유해 키워드 (2363)\n욕설/성인/폭력 …\n→ HARMFUL_MESSAGE + 관리자 메일",
                bg=WARN[0], stroke=WARN[1], font=11, align="left")
c.edge(webhook, danger, start="bottom", end="top", color=WARN[1])
c.edge(webhook, harmful, start="bottom", end="top", color=WARN[1])
c.freetext(700, 196, "① 최우선: 키워드 매칭 시 즉시 종료", font=12, color=WARN[1])

c.freetext(20, 360, "우선순위\n　▼", font=16, color="#868e96")

ZY = 330  # 존 본문 시작 y

# ── Zone A: pending reflection 응답 ──
c.zone(60, ZY, 410, 430, "#f8f0fc", "A. 자기인지(reflection) 응답  (pending_reflection)", BOT[1])
stack(76, ZY + 46, 380, [
    ("a_skip", "건너뛰기 / 건너뛸게요 (2368)\n→ basicCard '지금 느낀 만큼만 담아둘게요'\n[QR: 기본]"),
    ("a_qshow", "질문 받을게요 (2384)\n→ 질문 텍스트 출력, stage=question_shown\n[QR: 답할게요 / 건너뛸게요]"),
    ("a_answer", "답할게요 (2391)\n→ '편하게 적어주세요 :)' , stage=awaiting_answer\n[QR: 건너뛰기]"),
    ("a_save", "임의 텍스트 (stage=awaiting_answer, 2817)\n→ records(type=reflection) 저장 · '잘 담아뒀어요 ✎'\n[QR: 기본]"),
], "#ffffff", BOT[1])

# ── Zone B: 명령어 — 모드 · 조회 ──
c.zone(500, ZY, 430, 780, "#e7f5ff", "B. 명령어 — 모드 전환 · 조회", ENTRY[1])
stack(516, ZY + 46, 400, [
    ("b_mode", "모드 (2399) → 모드 선택 안내 [QR: 대화/단순모드]"),
    ("b_conv", "대화모드 (2413) → 설정 카드, pending_simple 해제 [QR: 단순모드]"),
    ("b_simple", "단순모드 (2436) → 설정 카드, pending_simple=True [QR: 대화모드]"),
    ("b_today", "오늘 기록 (2473) → carousel(요약+최대9건) [QR: 기본]"),
    ("b_ana", "오늘 분석 / 감정분석 (2477)\n→ (callback) AI 오늘 분석 카드 [QR: 기본]"),
    ("b_book", "도감 (2731) → 25종·5결 안내 + 전체원석 카드\n[QR: pending 상태따라]"),
    ("b_inv", "내 원석 / 가방 / 인벤토리 (2763)\n→ 보유·오늘 수 카드 [QR: pending 상태따라]"),
    ("b_guide", "채집 안내 (2794) → 사용법 카드 [QR: 기본]"),
    ("b_daily_list", "저장된 일상 기록 보기 (2458) → 웹링크 카드 [QR: 기본]"),
], "#ffffff", ENTRY[1])

# ── Zone C: 기록 상태 머신 ──
c.zone(960, ZY, 470, 1040, "#fff4e6", "C. 기록 상태 머신  (pending_gem / pending_emotion_selection)", STATE[1])
stack(976, ZY + 46, 440, [
    ("c_retry", "다시 시도 (2485) → 저장 발화 재분류(callback)"),
    ("c_redo", "다시 찾을게요 (2500)\n step0→1: 결(카테고리) 선택 [QR: 5계열]\n step1→2: 전체 감정 25 [QR: 감정]"),
    ("c_cat", "결(카테고리) 버튼 5종 (2705)\n→ 해당 계열 감정 버튼 + '그대로 저장하기'"),
    ("c_emo", "감정 버튼 (2637)\n→ gem 교체 '바꿨어요 저장할까요?' [QR: 채집/다시]\n (복수선택 중=누적 / 일상감정추가=즉시 save)"),
    ("c_prev", "이전 단계로 (2683) → 결 선택 화면으로 복귀"),
    ("c_yes", "맞아요 (2527)\n→ save_gem(백그라운드) + '오늘 n번째 원석' 카드\n + 부정누적 알림 + 자기인지 초대"),
    ("c_all", "모두 채집 (2544)\n→ 복수 gem 전체 save + 카드 + 자기인지"),
    ("c_pick", "골라서 채집 (2563) → 선택 UI [QR: 감정들/완료하기]"),
    ("c_done", "완료하기 (2573) → 선택분 save + 카드 + 자기인지"),
    ("c_addemo", "감정 선택하기 / 추가하기 (2598)\n→ 일상기록에 감정 결 선택 진입"),
    ("c_keep", "그대로 저장하기 / 이대로 저장 (2607)\n→ '일상기록' save, 일상 저장 카드"),
    ("c_write", "감정 적기 (2630) → 텍스트 유도 안내(버튼 숨김)"),
    ("c_photokeep", "일상으로 저장 (2617) → 대기 사진을 '일상기록' save"),
], "#ffffff", STATE[1])

# ── Zone D: 미디어 + 기본 텍스트 경로 (fall-through 최후) ──
c.zone(1460, ZY, 540, 590, "#ebfbee", "D. 미디어 + 기본 텍스트 경로 (캐스케이드 최후)", RESP[1])
d_rects, _ = stack(1476, ZY + 46, 510, [
    ("d_audio", "음성 URL (2835) → AUDIO_NOT_SUPPORTED 안내"),
    ("d_video", "영상 URL (2843) → VIDEO_NOT_SUPPORTED 안내"),
    ("d_img", "사진 URL (2851)\n 단순모드: 즉시 분류저장 / 그 외: pending_photo +\n '한 줄 더 적어주세요'(10분) [QR: 감정 적기/일상으로 저장]"),
    ("d_empty", "빈 발화 (2893) → '조금 더 자세히 알려주실 수 있나요?'"),
    ("d_simple", "단순모드 텍스트 (2897)\n→ 백그라운드 분류저장 · '기록됐어요!'"),
    ("d_text", "기본 텍스트 (2932)\n→ 첫 방문 인사 + (callback) classify_with_supervisor\n→ _build_ai_response 분기 ▼"),
], "#ffffff", RESP[1])
d_text = d_rects[-1]

# ── _build_ai_response 결과 분기 (D 아래) ──
c.zone(1460, 960, 540, 470, "#fff9db", "_build_ai_response 결과 분기 (main.py:1771)", STATE[1])
e_rects, _ = stack(1476, 1006, 510, [
    ("e_one", "원석 1개 (1844) → '{gem} 발견했어요'\n[QR: {gem} 채집하기 💎 / 다시 찾을게요]"),
    ("e_multi", "원석 2~3개 (1828) → '여러 마음이 함께 있었네요'\n[QR: 모두 채집 / 골라서 채집]"),
    ("e_daily", "일상기록 · 감정없음 (1790,1821) → DAILY_RECORD_MESSAGE\n[QR: 그대로 저장하기 / 감정 선택하기]"),
    ("e_not", "기록아님 (1773) → '여기서는 기록을 통해…' 카드 [QR: 기본]"),
    ("e_timeout", "TIMEOUT (1798) → '세공소에 광물이 몰려…' [QR: 다시 시도]"),
    ("e_none", "None 오류 (1806) → '잠시 오류가…' [QR: 다시 시도]"),
], "#ffffff", STATE[1])
for e in e_rects:
    c.edge(d_text, e, start="bottom", end="left", color=STATE[1], sw=1)

# 범례
c.freetext(60, 800,
           "박스 = 시나리오(트리거 → 응답 → [QR])\n점선 화살표 = _build_ai_response 분기\n"
           "QR '기본' = 단순/대화 모드·오늘 기록·오늘 분석",
           font=12, color="#868e96")
c.freetext(60, 880,
           "공통 후처리:\n· result 가 원석/일상이면 '오늘 n번째 기록' 머리말 prepend (1862)\n"
           "· 첫 방문/오늘 첫 방문 시 인사 prepend (1871)\n"
           "· 저장 시 check_negative_accumulation 알림 (1912)",
           font=12, color="#495057")

out = "/Users/imdonghyeon/kakaoimpact/docs/chatbot-scenario-flow.excalidraw"
n = c.save(out)
print(f"wrote {out} with {n} elements")
