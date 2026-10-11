import { getSupabase } from "@/lib/supabase";

const MAX_INPUT_CHARS = Number(process.env.MAX_INPUT_CHARS ?? 2000);

export async function POST(req: Request) {
  let body: { input?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const input = (body.input ?? "").trim();

  if (!input) {
    return Response.json(
      { error: "Input is empty. Please provide a valid input to continue." },
      { status: 400 }
    );
  }
  if (input.length > MAX_INPUT_CHARS) {
    return Response.json(
      { error: `Input too long (${input.length} chars). Max is ${MAX_INPUT_CHARS}.` },
      { status: 413 }
    );
  }

  const payload = {
    answer: `Stub response — wire LLM here. Echo (${input.length} chars): ${input.slice(0, 200)}`,
    assumptions: ["Baseline stub, no model call yet"],
    confidence: "low",
  };

  try {
    const sb = getSupabase();
    if (sb) {
      await sb.from("runs").insert({
        input_text: input.slice(0, 4000),
        output_json: payload,
        model: process.env.MODEL_NAME ?? "stub",
        prompt_version: "v1",
      });
    }
  } catch (e) {
    console.warn("supabase log skipped", (e as Error)?.message);
  }

  return Response.json(payload);
}
