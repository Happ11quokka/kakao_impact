// === 논리 기록(logical record) 유틸 ===
// 챗봇은 한 사용자 메시지에서 N개 감정을 분류하면 chatbot 테이블에 N행을 INSERT 한다
// (record_text/image_url/trace_id 동일, gem 다름). 백엔드 /records 응답이 이를 그대로
// 반환하므로 프런트엔드 3곳(홈 호수·원석함·캘린더·분석 리캡)에서 같은 기록이 N번 보인다.
// 이 유틸은 같은 메시지로 묶인 행들을 하나의 논리 기록으로 합치고 감정 코드를 union 한다.

import type { ChatbotRecordDto, DetailedEmotionBadgeDto, RecordDto } from './api';

const TIME_BUCKET_MS = 15_000;

function bucketTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Math.floor(t / TIME_BUCKET_MS) * TIME_BUCKET_MS;
}

function dedupeKeyFromFields(
  createdAt: string,
  recordText: string | null | undefined,
  hasPhoto: boolean,
  imageUrl: string | null | undefined,
): string {
  const text = (recordText ?? '').trim();
  const photo = imageUrl ?? '';
  // 텍스트도 사진도 없는 기록은 묶지 않음(자기회고처럼 본문이 없는 행이 우연히 같은 버킷에
  // 들어가도 합치지 않게 createdAt 자체를 키로 사용).
  if (text.length === 0 && photo.length === 0 && !hasPhoto) {
    return `solo|${createdAt}`;
  }
  return [text, hasPhoto ? '1' : '0', photo, bucketTime(createdAt)].join('||');
}

export function logicalKeyForRecord(record: RecordDto): string {
  return dedupeKeyFromFields(record.createdAt, record.recordText, record.hasPhoto, record.imageUrl);
}

export function logicalKeyForChatbotRecord(record: ChatbotRecordDto): string {
  return dedupeKeyFromFields(record.createdAt, record.recordText, record.hasPhoto, record.imageUrl);
}

function recordPrimaryCode(record: RecordDto): string | null {
  return record.confirmedEmotionCode ?? record.gemEmotionCode ?? record.aiEmotionCode ?? null;
}

function labelFromGem(gem: string | null | undefined): string | null {
  const normalized = (gem ?? '').trim();
  if (!normalized || normalized === '일상기록' || normalized === '단순기록') return null;
  return normalized.replace(/\s*(조각|원석)$/, '');
}

export function buildRecordDetailedEmotionBadges(record: RecordDto): DetailedEmotionBadgeDto[] {
  if (record.classificationStatus === 'needs_confirmation') return [];
  if (record.detailedEmotionBadges && record.detailedEmotionBadges.length > 0) {
    return record.detailedEmotionBadges;
  }

  const gemLabel = labelFromGem(record.gem);
  const code = recordPrimaryCode(record);
  if (gemLabel && code) {
    return [{ code, label: gemLabel, gem: record.gem }];
  }

  return [];
}

function mergeDetailedEmotionBadges(records: RecordDto[]): DetailedEmotionBadgeDto[] {
  const order: DetailedEmotionBadgeDto[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const badge of buildRecordDetailedEmotionBadges(record)) {
      const key = `${badge.gem}||${badge.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      order.push(badge);
    }
  }
  return order;
}

function mergeCodes(records: RecordDto[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const push = (code: string | null | undefined) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    order.push(code);
  };
  for (const badge of mergeDetailedEmotionBadges(records)) {
    push(badge.code);
  }
  for (const record of records) {
    for (const code of record.confirmedEmotionCodes ?? []) push(code);
    push(record.confirmedEmotionCode);
    push(record.gemEmotionCode);
  }
  return order;
}

/**
 * 같은 사용자 메시지에서 비롯된 sibling 행들을 1개 논리 기록으로 합친다.
 * canonical 기록은 그룹에서 가장 작은 id(=먼저 생성된 행)로 정한다.
 * `confirmedEmotionCodes` 는 sibling 들의 감정 코드를 합친 합집합으로 채운다.
 */
export function dedupeLogicalRecords(records: RecordDto[]): RecordDto[] {
  const groups = new Map<string, RecordDto[]>();
  for (const record of records) {
    const key = logicalKeyForRecord(record);
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }

  const merged: RecordDto[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => a.id - b.id);
    const canonical = sorted[0];
    merged.push({
      ...canonical,
      confirmedEmotionCodes: mergeCodes(sorted),
      detailedEmotionBadges: mergeDetailedEmotionBadges(sorted),
    });
  }

  return merged;
}

/**
 * 챗봇 records 응답을 같은 키로 묶어서 "한 메시지에 모인 감정 라벨 목록" 을 돌려준다.
 * 분석 화면 리캡 모달에서 한 줄의 감정 뱃지 모음 만들 때 사용.
 */
export function buildChatbotRecordEmotionLabels(records: ChatbotRecordDto[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const record of records) {
    const key = logicalKeyForChatbotRecord(record);
    const list = map.get(key);
    if (list) {
      if (record.gem && !list.includes(record.gem)) list.push(record.gem);
    } else {
      map.set(key, record.gem ? [record.gem] : []);
    }
  }
  return map;
}
