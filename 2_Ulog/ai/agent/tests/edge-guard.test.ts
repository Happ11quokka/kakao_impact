/**
 * Edge Guard 룰 기반 단위 테스트 30건.
 * LLM 호출 없이 is_crisis / is_offensive / needs_human 규칙만 검증.
 */

interface EdgeGuardResult {
  is_crisis: boolean;
  is_offensive: boolean;
  needs_human: boolean;
  reason: string | null;
}

function ruleBasedEdgeGuard(text: string): EdgeGuardResult {
  const lower = text.toLowerCase();

  const crisisKeywords = ['죽고 싶', '죽고싶', '사라지고 싶', '사라지고싶', '끝내고 싶', '끝내고싶', '자해', '자살'];
  const offensiveKeywords = ['씨발', '개새끼', '병신', '찐따', '장애인새끼', '혐오', '꺼져'];
  const humanKeywords = ['소송', '신고', '변호사', '경찰', '범죄', '사람이랑 얘기', '사람과 얘기'];

  const isCrisis = crisisKeywords.some((k) => lower.includes(k));
  const isOffensive = offensiveKeywords.some((k) => lower.includes(k));
  const isHumanKeyword = humanKeywords.some((k) => lower.includes(k));
  const needsHuman = isCrisis || isOffensive || isHumanKeyword;
  const reason = needsHuman
    ? isCrisis ? '위기 신호 감지' : isOffensive ? '공격적 표현 감지' : '인간 개입 키워드'
    : null;

  return { is_crisis: isCrisis, is_offensive: isOffensive, needs_human: needsHuman, reason };
}

describe('Edge Guard — 위기 신호 (is_crisis)', () => {
  test('TC-01: 자살 명시 표현', () => {
    const r = ruleBasedEdgeGuard('정말 죽고 싶어. 더 이상 못 버티겠어');
    expect(r.is_crisis).toBe(true);
    expect(r.needs_human).toBe(true);
  });

  test('TC-02: 사라지고 싶다', () => {
    const r = ruleBasedEdgeGuard('그냥 사라지고 싶다. 아무도 모르게');
    expect(r.is_crisis).toBe(true);
  });

  test('TC-03: 끝내고 싶다', () => {
    const r = ruleBasedEdgeGuard('이 고통을 끝내고 싶어');
    expect(r.is_crisis).toBe(true);
  });

  test('TC-04: 자해 언급', () => {
    const r = ruleBasedEdgeGuard('요즘 자해 충동이 가끔 들어');
    expect(r.is_crisis).toBe(true);
  });

  test('TC-05: 자살 단어 포함', () => {
    const r = ruleBasedEdgeGuard('자살에 대해 자꾸 생각하게 돼');
    expect(r.is_crisis).toBe(true);
    expect(r.needs_human).toBe(true);
  });

  test('TC-06: 비유적 죽겠다 (정상) — ㅋ 동반', () => {
    const r = ruleBasedEdgeGuard('배고파 죽겠다 ㅋㅋ');
    expect(r.is_crisis).toBe(false);
  });

  test('TC-07: 죽고 싶다 없이 극도 절망', () => {
    const r = ruleBasedEdgeGuard('아무것도 하기 싫고 아무 의미도 없어');
    // 키워드 없으면 is_crisis=false (LLM이 맥락 판단)
    expect(r.is_crisis).toBe(false);
  });
});

describe('Edge Guard — 공격적 표현 (is_offensive)', () => {
  test('TC-08: 심한 욕설', () => {
    const r = ruleBasedEdgeGuard('씨발 진짜 열받아');
    expect(r.is_offensive).toBe(true);
    expect(r.needs_human).toBe(true);
  });

  test('TC-09: 비하 표현', () => {
    const r = ruleBasedEdgeGuard('걔는 진짜 병신이야');
    expect(r.is_offensive).toBe(true);
  });

  test('TC-10: 혐오 키워드', () => {
    const r = ruleBasedEdgeGuard('그 집단 정말 혐오해');
    expect(r.is_offensive).toBe(true);
  });

  test('TC-11: 위협 표현', () => {
    const r = ruleBasedEdgeGuard('개새끼 두고 봐라');
    expect(r.is_offensive).toBe(true);
    expect(r.needs_human).toBe(true);
  });

  test('TC-12: 경미한 불만 (정상)', () => {
    const r = ruleBasedEdgeGuard('아 진짜 짜증나 왜 이러는 거야');
    expect(r.is_offensive).toBe(false);
  });

  test('TC-13: 감탄사 욕설 (정상 맥락)', () => {
    const r = ruleBasedEdgeGuard('아 깜짝이야 진짜');
    expect(r.is_offensive).toBe(false);
  });
});

describe('Edge Guard — 인간 개입 필요 (needs_human)', () => {
  test('TC-14: 법적 분쟁 언급', () => {
    const r = ruleBasedEdgeGuard('소송 걸어야 할 것 같아');
    expect(r.needs_human).toBe(true);
  });

  test('TC-15: 신고 의도', () => {
    const r = ruleBasedEdgeGuard('경찰에 신고하려고');
    expect(r.needs_human).toBe(true);
  });

  test('TC-16: 범죄 피해', () => {
    const r = ruleBasedEdgeGuard('범죄 피해를 당한 것 같아서');
    expect(r.needs_human).toBe(true);
  });

  test('TC-17: 사람과 대화 요청', () => {
    const r = ruleBasedEdgeGuard('AI 말고 사람이랑 얘기하고 싶어');
    expect(r.needs_human).toBe(true);
  });

  test('TC-18: 변호사 언급', () => {
    const r = ruleBasedEdgeGuard('변호사 선임 방법 알고 싶어');
    expect(r.needs_human).toBe(true);
  });
});

describe('Edge Guard — 정상 메시지 (모두 false)', () => {
  test('TC-19: 일상 대화', () => {
    const r = ruleBasedEdgeGuard('오늘 점심 뭐 먹었어?');
    expect(r).toMatchObject({ is_crisis: false, is_offensive: false, needs_human: false, reason: null });
  });

  test('TC-20: 감정 표현 (슬픔)', () => {
    const r = ruleBasedEdgeGuard('친구랑 싸웠는데 너무 속상해');
    expect(r.is_crisis).toBe(false);
    expect(r.needs_human).toBe(false);
  });

  test('TC-21: 성취감 표현', () => {
    const r = ruleBasedEdgeGuard('드디어 취업했어!! 너무 기뻐');
    expect(r).toMatchObject({ is_crisis: false, is_offensive: false, needs_human: false });
  });

  test('TC-22: 이모티콘만 있는 메시지', () => {
    const r = ruleBasedEdgeGuard('😊😊😊');
    expect(r).toMatchObject({ is_crisis: false, is_offensive: false, needs_human: false });
  });

  test('TC-23: 짧은 텍스트', () => {
    const r = ruleBasedEdgeGuard('ㅋㅋㅋ');
    expect(r).toMatchObject({ is_crisis: false, is_offensive: false, needs_human: false });
  });

  test('TC-24: 피곤함 표현', () => {
    const r = ruleBasedEdgeGuard('요즘 너무 피곤해 그냥 쉬고 싶다');
    expect(r.is_crisis).toBe(false);
  });

  test('TC-25: 불안 표현', () => {
    const r = ruleBasedEdgeGuard('발표가 너무 떨려서 잠을 못 잤어');
    expect(r.is_crisis).toBe(false);
    expect(r.needs_human).toBe(false);
  });

  test('TC-26: 일상적 스트레스', () => {
    const r = ruleBasedEdgeGuard('야근이 계속되니까 몸이 좀 힘들어');
    expect(r).toMatchObject({ is_crisis: false, is_offensive: false, needs_human: false });
  });

  test('TC-27: 설렘 표현', () => {
    const r = ruleBasedEdgeGuard('내일 소개팅인데 너무 설레');
    expect(r).toMatchObject({ is_crisis: false, is_offensive: false, needs_human: false });
  });

  test('TC-28: 그리움 표현', () => {
    const r = ruleBasedEdgeGuard('고향 생각이 많이 나네, 부모님 보고 싶다');
    expect(r).toMatchObject({ is_crisis: false, is_offensive: false, needs_human: false });
  });
});

describe('Edge Guard — 복합 케이스', () => {
  test('TC-29: 위기 + 공격성 동시', () => {
    const r = ruleBasedEdgeGuard('씨발 진짜 죽고 싶어');
    expect(r.is_crisis).toBe(true);
    expect(r.is_offensive).toBe(true);
    expect(r.needs_human).toBe(true);
  });

  test('TC-30: reason이 null인 정상 케이스', () => {
    const r = ruleBasedEdgeGuard('오늘 날씨 좋다');
    expect(r.reason).toBeNull();
  });
});
