import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KAKAO_REST_API_KEY: z.string().min(1),
  KAKAO_CLIENT_SECRET: z.string().min(1),
  KAKAO_REDIRECT_URI: z.string().url(),
  SESSION_SECRET: z.string().regex(/^[0-9a-f]{64}$/, "must be 64 hex chars (32 bytes)"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  // 선택: Kakao 채널 웹훅에 공유 비밀키를 건다면 X-Avoha-Webhook-Secret 헤더로 전달.
  // 미설정 시 서명 검증 생략 (dev/ngrok 초기 대응).
  KAKAO_WEBHOOK_SECRET: z.string().min(8).optional(),
  // 쉼표 구분: 운영 콘솔 접근 허용 Kakao 이메일 목록 ("" 면 허용 안 함).
  OPS_ALLOWED_KAKAO_IDS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n)),
    ),
  DISCORD_OPS_WEBHOOK: z.string().url().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map(
    (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`,
  );
  console.error("환경변수 검증 실패:\n" + lines.join("\n"));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
