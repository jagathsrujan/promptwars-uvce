// POST /api/firewall/test — run any input through the live firewall pipeline.
//
// The Firewall Console's presets and custom runs use this. Console runs are
// logged with surface = "console" and are exempt from the rate limits and the
// lockout (the console is a test harness — a juror must be able to exercise
// the firewall without locking the demo out of the product).
//
// Simulation switches ("jev_failure" / "l2_failure") can only ever degrade the
// result: they force the fail-closed paths, never an approval, so there is no
// security value in abusing them.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logDecision } from "@/lib/firewall/logs";
import { runFirewall } from "@/lib/firewall/pipeline";

export const maxDuration = 30;

const bodySchema = z.object({
  input: z.string().max(4000),
  kind: z.enum(["message", "memo"]).default("message"),
  simulate: z.enum(["jev_failure", "l2_failure", "laya_failure"]).nullable().optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const decision = await runFirewall({
    text: parsed.data.input,
    surface: "console",
    kind: parsed.data.kind,
    simulate: parsed.data.simulate ?? null,
  });
  const row = await logDecision(supabase, user.id, decision);

  return Response.json({
    decision,
    log: row ? { id: row.id, created_at: row.created_at } : null,
  });
}
