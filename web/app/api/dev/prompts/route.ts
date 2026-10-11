import { NextResponse } from "next/server";
import { engineName } from "@/lib/firewall/llm";
import {
  AGENT_GUARDED,
  AGENT_GUARDED_HASH,
  AGENT_RAW,
  AGENT_RAW_HASH,
  CHECKER_INTENT,
  CHECKER_INTENT_HASH,
  CHECKER_MEMO,
  CHECKER_MEMO_HASH,
  CHECKER_THREAT,
  CHECKER_THREAT_HASH,
  EVAL_SET_HASH,
} from "@/lib/firewall/prompts.generated";

export const dynamic = "force-dynamic";

export async function GET() {
  const files = [
    { name: "agent-guarded.md", hash: AGENT_GUARDED_HASH, content: AGENT_GUARDED },
    { name: "agent-raw.md", hash: AGENT_RAW_HASH, content: AGENT_RAW },
    { name: "checker-threat.md", hash: CHECKER_THREAT_HASH, content: CHECKER_THREAT },
    { name: "checker-intent.md", hash: CHECKER_INTENT_HASH, content: CHECKER_INTENT },
    { name: "checker-memo.md", hash: CHECKER_MEMO_HASH, content: CHECKER_MEMO },
    {
      name: "eval-set.json",
      hash: EVAL_SET_HASH,
      content: "Corpus is loaded live by /api/eval — open prompts/eval-set.json in the repo to read it.",
    },
  ];
  return NextResponse.json({ engine: engineName(), files });
}
