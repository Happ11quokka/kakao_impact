import { GoogleGenerativeAI } from '@google/generative-ai';
import { dailyCap } from '../budget/daily-cap';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

const MODEL_COST_PER_1K: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.0001, output: 0.0004 },
};

export async function geminiChat(model: string, systemPrompt: string, userContent: string): Promise<string> {
  await dailyCap.checkOrThrow();

  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });

  const result = await genModel.generateContent(userContent);
  const text = result.response.text();

  const usage = result.response.usageMetadata;
  if (usage) {
    const cost = MODEL_COST_PER_1K[model];
    if (cost) {
      const usd =
        ((usage.promptTokenCount ?? 0) / 1000) * cost.input +
        ((usage.candidatesTokenCount ?? 0) / 1000) * cost.output;
      await dailyCap.recordSpend(usd);
    }
  }

  return text;
}

export async function geminiVision(
  model: string,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  await dailyCap.checkOrThrow();

  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });

  const result = await genModel.generateContent([
    { inlineData: { data: imageBase64, mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' } },
  ]);
  const text = result.response.text();

  const usage = result.response.usageMetadata;
  if (usage) {
    const cost = MODEL_COST_PER_1K[model];
    if (cost) {
      const usd =
        ((usage.promptTokenCount ?? 0) / 1000) * cost.input +
        ((usage.candidatesTokenCount ?? 0) / 1000) * cost.output;
      await dailyCap.recordSpend(usd);
    }
  }

  return text;
}
