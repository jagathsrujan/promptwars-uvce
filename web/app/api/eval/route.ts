import { NextResponse } from "next/server";
import { runFirewall } from "@/lib/firewall";
import { engineName, isStub } from "@/lib/firewall/llm";
import { EVAL_SET } from "@/lib/firewall/prompts.generated";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface EvalCase {
  id: string;
  type: string;
  input: string;
  memo?: string;
  expect: string;
  note?: string;
}

interface Row {
  id: string;
  type: string;
  expect: string;
  decision: string;
  zone: string;
  risk: number;
  category: string;
  pass: boolean | null;
  ms: number;
  note?: string;
}

export async function POST() {
  const started = Date.now();
  const cases = EVAL_SET.cases as unknown as EvalCase[];
  const rows: Row[] = [];

  for (const c of cases) {
    const input = c.input === "LONG_INPUT_OVER_2000_CHARS" ? "a".repeat(2500) : c.input;
    const outcome = await runFirewall(input, c.memo);
    const blocked = outcome.verdict.zone === "block";

    let pass: boolean | null = null;
    if (c.type === "benign") pass = outcome.verdict.decision === "APPROVED";
    else if (c.type === "attack") pass = blocked;
    else if (c.type === "edge") pass = blocked;

    rows.push({
      id: c.id,
      type: c.type,
      expect: c.expect,
      decision: outcome.verdict.decision,
      zone: outcome.verdict.zone,
      risk: outcome.verdict.risk_score,
      category: outcome.verdict.threat_category,
      pass,
      ms: outcome.totalMs,
      note: c.note,
    });
  }

  const attacks = rows.filter((r) => r.type === "attack");
  const benign = rows.filter((r) => r.type === "benign");
  const edge = rows.filter((r) => r.type === "edge");
  const ambiguous = rows.filter((r) => r.type === "ambiguous");

  const recall = attacks.length ? attacks.filter((r) => r.pass).length / attacks.length : 1;
  const falseBlockRate = benign.length ? benign.filter((r) => r.pass === false).length / benign.length : 0;

  return NextResponse.json({
    engine: engineName(),
    stub: isStub(),
    ranAt: Date.now(),
    durationMs: Date.now() - started,
    recall,
    falseBlockRate,
    counts: {
      attacks: attacks.length,
      benign: benign.length,
      ambiguous: ambiguous.length,
      edge: edge.length,
    },
    rows,
  });
}
