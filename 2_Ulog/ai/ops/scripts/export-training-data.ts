/**
 * AI-9: 학습 데이터 export 스크립트
 * 사용: npx tsx ops/scripts/export-training-data.ts [output.csv]
 */
import { Pool } from 'pg';
import { createWriteStream } from 'fs';
import { join } from 'path';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

interface TrainingRow {
  message_id: string;
  text: string;
  ai_top1: string | null;
  ai_confidence: number | null;
  operator_final: string | null;
  match: boolean;
}

async function exportTrainingData(outputPath: string): Promise<void> {
  const query = `
    SELECT
      m.id                                            AS message_id,
      m.content                                       AS text,
      m.ai_suggestion->'emotion'->'top3_emotion_codes'->0 AS ai_top1,
      (m.ai_suggestion->'emotion'->'confidence'->0)::float  AS ai_confidence,
      e.final_emotion_code                            AS operator_final,
      CASE
        WHEN m.ai_suggestion->'emotion'->'top3_emotion_codes'->0 = to_jsonb(e.final_emotion_code)
        THEN true ELSE false
      END                                             AS match
    FROM kakao_messages m
    LEFT JOIN events e
      ON e.message_id = m.id AND e.event_type = 'operator_emotion_confirmed'
    WHERE m.ai_suggestion IS NOT NULL
      AND m.created_at > NOW() - INTERVAL '30 days'
    ORDER BY m.created_at DESC
  `;

  const { rows } = await db.query<TrainingRow>(query);

  const stream = createWriteStream(outputPath);
  stream.write('message_id,text,ai_top1,ai_confidence,operator_final,match\n');

  for (const row of rows) {
    const line = [
      row.message_id,
      `"${(row.text ?? '').replace(/"/g, '""')}"`,
      row.ai_top1 ?? '',
      row.ai_confidence?.toFixed(4) ?? '',
      row.operator_final ?? '',
      row.match ? 'true' : 'false',
    ].join(',');
    stream.write(line + '\n');
  }

  stream.end();

  const mismatches = rows.filter((r) => !r.match);
  console.log(`총 ${rows.length}건 export → ${outputPath}`);
  console.log(`불일치(match=false): ${mismatches.length}건 → 프롬프트 개선 리뷰 대상`);

  await db.end();
}

const outputPath = process.argv[2] ?? join(process.cwd(), 'training-export.csv');
exportTrainingData(outputPath).catch((err) => {
  console.error('export 실패:', err);
  process.exit(1);
});
