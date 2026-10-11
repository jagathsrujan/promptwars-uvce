// The AI SDK view of the assistant's tools: descriptions + loose input schemas
// for the model, with every call funneled through executeTool(). The ctx (user
// session) is captured per request — tools are built per call, never shared
// across users.

import { tool, type ToolSet } from "ai";
import { executeTool } from "./execute-tool";
import { SDK_SCHEMAS, TOOL_DESCRIPTIONS } from "./schemas";
import type { AssistantToolName, ToolContext } from "./types";

const TOOL_NAMES = Object.keys(SDK_SCHEMAS) as AssistantToolName[];

export function buildAssistantTools(ctx: ToolContext): ToolSet {
  const tools: ToolSet = {};
  for (const name of TOOL_NAMES) {
    tools[name] = tool({
      description: TOOL_DESCRIPTIONS[name],
      inputSchema: SDK_SCHEMAS[name],
      execute: async (params: unknown) => executeTool(name, params, ctx),
    });
  }
  return tools;
}
