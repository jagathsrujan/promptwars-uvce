import type { LlmResult } from "./types";
import { stubLLM } from "./stub";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function isStub(): boolean {
  return !process.env.LLM_API_KEY;
}

export function modelName(): string {
  return process.env.LLM_MODEL ?? "gpt-4o-mini";
}

export function engineName(): string {
  return isStub() ? "stub (offline deterministic)" : `model:${modelName()}`;
}

export async function llmJSON(messages: ChatMessage[], timeoutMs = 12000): Promise<LlmResult> {
  if (isStub()) return stubLLM(messages);

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelName(),
        temperature: 0,
        max_tokens: 600,
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`llm http ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("llm empty response");
    return { text, model: modelName(), engine: "model", latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
