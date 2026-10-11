import { NextResponse } from "next/server";
import { engineName, isStub, modelName } from "@/lib/firewall/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    engine: engineName(),
    stub: isStub(),
    model: modelName(),
    ts: Date.now(),
  });
}
