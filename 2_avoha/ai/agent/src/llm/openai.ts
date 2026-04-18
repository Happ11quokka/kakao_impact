import OpenAI from 'openai';
import { dailyCap } from '../budget/daily-cap';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL_COST_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1': { input: 0.003, output: 0.012 },
};

export async function openaiChat(
  model: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  await dailyCap.checkOrThrow();

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const usage = res.usage;
  if (usage) {
    const cost = MODEL_COST_PER_1K[model];
    if (cost) {
      const usd =
        (usage.prompt_tokens / 1000) * cost.input +
        (usage.completion_tokens / 1000) * cost.output;
      await dailyCap.recordSpend(usd);
    }
  }

  return res.choices[0].message.content ?? '{}';
}

export async function openaiVision(
  model: string,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  await dailyCap.checkOrThrow();

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const usage = res.usage;
  if (usage) {
    const cost = MODEL_COST_PER_1K[model];
    if (cost) {
      const usd =
        (usage.prompt_tokens / 1000) * cost.input +
        (usage.completion_tokens / 1000) * cost.output;
      await dailyCap.recordSpend(usd);
    }
  }

  return res.choices[0].message.content ?? '{}';
}
