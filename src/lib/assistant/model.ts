// The assistant's model, served through the Command Code Provider API.
//
// Environment: COMMANDCODE_API_KEY (Command Code Studio → API keys).
// Server-side only — this module is imported exclusively by route handlers.

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const COMMANDCODE_BASE_URL = "https://api.commandcode.ai/provider/v1";
export const ASSISTANT_MODEL_ID = "deepseek/deepseek-v4.1-flash";

export class AssistantUnavailableError extends Error {
  constructor() {
    super("The assistant is not configured on this deployment.");
    this.name = "AssistantUnavailableError";
  }
}

let cachedProvider: ReturnType<typeof createOpenAICompatible> | null = null;

export function getAssistantModel() {
  const apiKey = process.env.COMMANDCODE_API_KEY;
  if (!apiKey) {
    throw new AssistantUnavailableError();
  }
  if (!cachedProvider) {
    cachedProvider = createOpenAICompatible({
      name: "commandcode",
      baseURL: COMMANDCODE_BASE_URL,
      apiKey,
      // Phase 3: every deepseek call carries the ZDR opt-in — banking data,
      // zero data retention, no prompt training. (Never sent to /systemone:
      // jev has no ZDR upstream and the API refuses the combination with 422.)
      headers: { "x-cmd-zdr": "1" },
    });
  }
  return cachedProvider.chatModel(ASSISTANT_MODEL_ID);
}
