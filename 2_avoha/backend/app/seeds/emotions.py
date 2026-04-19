from __future__ import annotations

# 10종 감정 × 3 카테고리 (PRD v1.1). gemName/hexColor 는 디자이너 확정 전 임시안.
EMOTIONS_SEED: list[dict[str, object]] = [
    # ─ 평온 (calm) ─
    {
        "code": "untroubled",
        "name_ko": "무탈",
        "category": "calm",
        "gem_name": "일상석",
        "hex_color": "#CDD5D8",
        "trigger_keywords": ["그냥 그런 하루", "별일 없었어", "무난", "평범", "보통"],
    },
    {
        "code": "serenity",
        "name_ko": "평온",
        "category": "calm",
        "gem_name": "청옥",
        "hex_color": "#3AAFA9",
        "trigger_keywords": ["조용히", "차분하게", "한숨 돌렸어", "고요", "여유"],
    },
    # ─ 행복 (happy) ─
    {
        "code": "pride",
        "name_ko": "뿌듯",
        "category": "happy",
        "gem_name": "황금석",
        "hex_color": "#F5D76E",
        "trigger_keywords": ["해냈어", "드디어 끝", "나 잘했지", "성공", "완성"],
    },
    {
        "code": "joy",
        "name_ko": "기쁨",
        "category": "happy",
        "gem_name": "홍옥",
        "hex_color": "#E8614D",
        "trigger_keywords": ["너무 좋아", "행복", "신나", "좋다", "😊"],
    },
    {
        "code": "satisfaction",
        "name_ko": "만족",
        "category": "happy",
        "gem_name": "호박석",
        "hex_color": "#E8A838",
        "trigger_keywords": ["꽤 괜찮네", "충분해", "나쁘지 않아", "흡족"],
    },
    {
        "code": "flutter",
        "name_ko": "설렘",
        "category": "happy",
        "gem_name": "분홍석영",
        "hex_color": "#F6A5B5",
        "trigger_keywords": ["두근", "기대돼", "기다림", "주말", "약속"],
    },
    # ─ 부정 (negative) ─
    {
        "code": "sadness",
        "name_ko": "슬픔",
        "category": "negative",
        "gem_name": "흑요석",
        "hex_color": "#4A6B8A",
        "trigger_keywords": ["눈물", "서러워", "울컥", "슬퍼"],
    },
    {
        "code": "annoyance",
        "name_ko": "짜증",
        "category": "negative",
        "gem_name": "적철석",
        "hex_color": "#C7502D",
        "trigger_keywords": ["빡쳐", "왜 이래", "짜증나", "답답"],
    },
    {
        "code": "regret",
        "name_ko": "후회",
        "category": "negative",
        "gem_name": "재석",
        "hex_color": "#8B7355",
        "trigger_keywords": ["~할걸", "괜히", "차라리", "아쉬워"],
    },
    {
        "code": "solace",
        "name_ko": "위로",
        "category": "negative",
        "gem_name": "월장석",
        "hex_color": "#A8B5D1",
        "trigger_keywords": ["지쳤어", "힘들어", "토닥", "쉬고 싶다"],
    },
]
