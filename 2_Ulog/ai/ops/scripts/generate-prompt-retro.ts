/**
 * AI-10: 프롬프트 정답지 회고 문서 자동 생성
 * 사용: npx tsx ops/scripts/generate-prompt-retro.ts [training-export.csv] [output.md]
 */
import { createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';

interface TrainingRow {
  message_id: string;
  text: string;
  ai_top1: string;
  ai_confidence: string;
  operator_final: string;
  match: string;
}

async function parseCsv(filePath: string): Promise<TrainingRow[]> {
  const rows: TrainingRow[] = [];
  const rl = createInterface({ input: createReadStream(filePath) });
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) ?? [];
    const [message_id, text, ai_top1, ai_confidence, operator_final, match] = cols.map(
      (c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'),
    );
    rows.push({ message_id, text, ai_top1, operator_final, ai_confidence, match });
  }

  return rows;
}

function buildRetroDoc(rows: TrainingRow[], generatedAt: string): string {
  const total = rows.length;
  const matches = rows.filter((r) => r.match === 'true').length;
  const mismatches = rows.filter((r) => r.match === 'false');
  const accuracy = total > 0 ? ((matches / total) * 100).toFixed(1) : '0.0';

  const emotionMisses: Record<string, { ai: string; op: string; texts: string[] }> = {};
  for (const row of mismatches) {
    const key = `${row.ai_top1}→${row.operator_final}`;
    if (!emotionMisses[key]) emotionMisses[key] = { ai: row.ai_top1, op: row.operator_final, texts: [] };
    if (emotionMisses[key].texts.length < 3) {
      emotionMisses[key].texts.push(row.text.slice(0, 80));
    }
  }

  const missEntries = Object.entries(emotionMisses)
    .sort((a, b) => b[1].texts.length - a[1].texts.length)
    .slice(0, 10);

  const lines: string[] = [
    `# 프롬프트 회고 문서`,
    `> 생성일: ${generatedAt}`,
    ``,
    `## 요약`,
    `| 항목 | 값 |`,
    `|---|---|`,
    `| 총 샘플 | ${total}건 |`,
    `| AI-운영자 일치 | ${matches}건 (${accuracy}%) |`,
    `| 불일치 (리뷰 대상) | ${mismatches.length}건 |`,
    ``,
    `## 주요 혼동 패턴 (AI 예측 → 운영자 확정)`,
    ``,
  ];

  for (const [, val] of missEntries) {
    lines.push(`### ${val.ai} → ${val.operator_final} (${val.texts.length}건)`);
    for (const t of val.texts) {
      lines.push(`- "${t}"`);
    }
    lines.push('');
  }

  lines.push(`## 개선 제안`);
  lines.push(``);
  lines.push(`혼동 패턴 상위 케이스를 \`prompts/emotion-classifier.md\` few-shot에 추가하여`);
  lines.push(`다음 WoZ 사이클에서 정확도를 개선하세요.`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`_자동 생성됨: export-training-data.ts + generate-prompt-retro.ts_`);

  return lines.join('\n');
}

async function main(): Promise<void> {
  const csvPath = process.argv[2] ?? 'training-export.csv';
  const outputPath = process.argv[3] ?? 'prompt-retro.md';

  const rows = await parseCsv(csvPath);
  const doc = buildRetroDoc(rows, new Date().toISOString().slice(0, 10));
  writeFileSync(outputPath, doc, 'utf-8');
  console.log(`회고 문서 생성 완료: ${outputPath}`);
}

main().catch((err) => {
  console.error('생성 실패:', err);
  process.exit(1);
});
