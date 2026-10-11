import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { confirmQuote, createQuote, resetBank, snapshot } from "@/lib/bank/ledger";
import { executeTool } from "@/lib/bank/tools";
import { DEMO_USERS, SESSION_COOKIE, SESSION_TTL_MS, createSession, destroySession, getSession } from "@/lib/bank/session";
import type { Session } from "@/lib/bank/session";
import { runFirewall } from "@/lib/firewall";
import { gateAction } from "@/lib/firewall/gate";
import { engineName, llmJSON } from "@/lib/firewall/llm";
import { wrapUntrusted } from "@/lib/firewall/normalize";
import { AGENT_GUARDED, AGENT_RAW } from "@/lib/firewall/prompts.generated";
import type { FirewallOutcome, InputSignals, Verdict } from "@/lib/firewall/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LEN = 2000;

const EMPTY_SIGNALS: InputSignals = {
  length: 0,
  hasMemo: false,
  urlDecoded: false,
  base64Decoded: false,
  zeroWidthStripped: false,
  htmlCommentsFound: 0,
  mixedScripts: false,
  tripwires: [],
  normalized: "",
  expanded: "",
  scanText: "",
};

interface AgentReply {
  reply: string;
  action: { name: string; args: Record<string, unknown> } | null;
}

function parseAgentReply(raw: string): AgentReply {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no json");
    const data = JSON.parse(raw.slice(start, end + 1)) as { reply?: unknown; action?: unknown };
    const reply = typeof data.reply === "string" ? data.reply : "";

    let action: AgentReply["action"] = null;
    if (data.action && typeof data.action === "object") {
      const candidate = data.action as { name?: unknown; args?: unknown };
      if (typeof candidate.name === "string") {
        action = {
          name: candidate.name,
          args:
            candidate.args && typeof candidate.args === "object"
              ? (candidate.args as Record<string, unknown>)
              : {},
        };
      }
    }
    if (!reply && !action) throw new Error("empty reply");
    return { reply, action };
  } catch {
    const fallback = raw.trim().slice(0, 400);
    return { reply: fallback || "Sorry, I could not process that.", action: null };
  }
}

async function runAgent(guarded: boolean, message: string, memo?: string): Promise<AgentReply> {
  const res = await llmJSON(
    [
      { role: "system", content: guarded ? AGENT_GUARDED : AGENT_RAW },
      { role: "user", content: wrapUntrusted(message, memo) },
    ],
    20000,
  );
  return parseAgentReply(res.text);
}

function publicVerdict(verdict: Verdict) {
  return {
    decision: verdict.decision,
    zone: verdict.zone,
    risk_score: verdict.risk_score,
    threat_category: verdict.threat_category,
    explanation: verdict.explanation,
    reasons: verdict.reasons,
  };
}

function sessionFromRequest(req: Request): Session | null {
  const cookie = req.headers.get("cookie") ?? "";
  const pair = cookie
    .split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!pair) return null;
  return getSession(pair.slice(SESSION_COOKIE.length + 1));
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

async function handleChat(body: Record<string, unknown>, session: Session, started: number) {
  const mode = body.mode === "raw" ? "raw" : "guarded";
  const message = String(body.message ?? "").trim();
  const memo = String(body.memo ?? "").trim() || undefined;

  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });
  if (message.length > MAX_LEN || (memo?.length ?? 0) > MAX_LEN) {
    return NextResponse.json({ error: `message longer than ${MAX_LEN} characters` }, { status: 413 });
  }

  if (mode === "raw") {
    const agent = await runAgent(false, message, memo);
    const toolResult = agent.action
      ? executeTool(agent.action.name, agent.action.args, { requireOtp: false, session })
      : null;

    const trace: FirewallOutcome = {
      id: randomUUID().slice(0, 8),
      ts: Date.now(),
      mode: "raw",
      input: message,
      memo,
      signals: EMPTY_SIGNALS,
      checkers: [],
      verdict: {
        decision: "APPROVED",
        zone: "allow",
        risk_score: 0,
        threat_category: "FIREWALL_DISABLED",
        explanation: "Raw mode — firewall bypassed.",
        reasons: ["firewall bypassed (raw mode)"],
      },
      engine: engineName(),
      totalMs: Date.now() - started,
      agent: {
        actionRequested: agent.action,
        actionExecuted: toolResult?.ok ? toolResult.tool : null,
        gateNote: "no gate — raw mode",
      },
    };

    return NextResponse.json({
      mode,
      reply: agent.reply,
      action: agent.action,
      actionResult: toolResult,
      verdict: publicVerdict(trace.verdict),
      trace,
      traceId: trace.id,
      engine: trace.engine,
      latencyMs: Date.now() - started,
    });
  }

  const outcome = await runFirewall(message, memo);

  if (outcome.verdict.zone === "block") {
    outcome.agent = {
      actionRequested: null,
      actionExecuted: null,
      gateNote: "blocked before agent and tools",
    };
    return NextResponse.json({
      mode,
      reply: `I can't act on that request — ${outcome.verdict.explanation}`,
      action: null,
      actionResult: null,
      verdict: publicVerdict(outcome.verdict),
      trace: outcome,
      traceId: outcome.id,
      engine: outcome.engine,
      latencyMs: Date.now() - started,
    });
  }

  const agent = await runAgent(true, message, memo);

  if (!agent.action) {
    outcome.agent = { actionRequested: null, actionExecuted: null, gateNote: "no action proposed" };
    return NextResponse.json({
      mode,
      reply: agent.reply,
      action: null,
      actionResult: null,
      verdict: publicVerdict(outcome.verdict),
      trace: outcome,
      traceId: outcome.id,
      engine: outcome.engine,
      latencyMs: Date.now() - started,
    });
  }

  const gate = gateAction(outcome.verdict, agent.action.name);
  if (!gate.allowed) {
    outcome.agent = {
      actionRequested: agent.action,
      actionExecuted: null,
      gateNote: gate.reason ?? "rejected by gate",
    };
    return NextResponse.json({
      mode,
      reply: `${agent.reply} — though I can't carry that action out right now.`,
      action: agent.action,
      actionResult: { ok: false, tool: agent.action.name, result: null, error: gate.reason },
      verdict: publicVerdict(outcome.verdict),
      trace: outcome,
      traceId: outcome.id,
      engine: outcome.engine,
      latencyMs: Date.now() - started,
    });
  }

  const toolResult = executeTool(agent.action.name, agent.action.args, { requireOtp: gate.requireOtp, session });
  outcome.agent = {
    actionRequested: agent.action,
    actionExecuted: toolResult.ok ? toolResult.tool : null,
    gateNote: gate.requireOtp
      ? "allowed · one-time code required at confirm"
      : gate.requireConfirm
        ? "allowed · customer confirm required"
        : "allowed",
  };

  return NextResponse.json({
    mode,
    reply: agent.reply,
    action: agent.action,
    actionResult: toolResult,
    verdict: publicVerdict(outcome.verdict),
    trace: outcome,
    traceId: outcome.id,
    engine: outcome.engine,
    latencyMs: Date.now() - started,
  });
}

async function handleQuote(body: Record<string, unknown>, session: Session, started: number) {
  const payee = String(body.payee ?? "").trim();
  const amount = Number(body.amount ?? 0);
  const memo = String(body.memo ?? "").trim() || undefined;

  if (!payee) return NextResponse.json({ error: "missing payee" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid amount" }, { status: 400 });
  }

  const input = `Transfer Rs.${amount} to ${payee} requested from the portal transfer form.`;
  const outcome = await runFirewall(input, memo);

  if (outcome.verdict.zone === "block") {
    outcome.agent = {
      actionRequested: { name: "start_transfer", args: { to: payee, amount } },
      actionExecuted: null,
      gateNote: "manual form blocked by firewall",
    };
    return NextResponse.json(
      {
        ok: false,
        error: outcome.verdict.explanation,
        verdict: publicVerdict(outcome.verdict),
        trace: outcome,
        traceId: outcome.id,
      },
      { status: 403 },
    );
  }

  const quote = createQuote({
    customerId: session.customerId,
    to: payee,
    amount,
    memo,
    requiresOtp: outcome.verdict.zone === "verify",
  });
  outcome.agent = {
    actionRequested: { name: "start_transfer", args: { to: payee, amount } },
    actionExecuted: "start_transfer",
    gateNote:
      outcome.verdict.zone === "verify"
        ? "manual form allowed · one-time code required at confirm"
        : "manual form allowed · quote created",
  };

  return NextResponse.json({
    ok: true,
    quote,
    verdict: publicVerdict(outcome.verdict),
    trace: outcome,
    traceId: outcome.id,
    engine: outcome.engine,
    latencyMs: Date.now() - started,
  });
}

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return unauthorized();
  return NextResponse.json({
    user: { customerId: session.customerId, name: session.name },
    ...snapshot(session.customerId),
  });
}

export async function POST(req: Request) {
  const started = Date.now();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const op = String(body.op ?? "");

  if (op === "login") {
    const customerId = String(body.customerId ?? "").trim();
    const password = String(body.password ?? "");
    const user = DEMO_USERS[customerId];
    if (!user || user.password !== password) {
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }
    const session = createSession(user);
    const res = NextResponse.json({ ok: true, user: { customerId: user.customerId, name: user.name } });
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return res;
  }

  if (op === "logout") {
    const session = sessionFromRequest(req);
    destroySession(session?.token);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const session = sessionFromRequest(req);
  if (!session) return unauthorized();

  try {
    if (op === "state") {
      return NextResponse.json({
        user: { customerId: session.customerId, name: session.name },
        ...snapshot(session.customerId),
      });
    }

    if (op === "reset") {
      resetBank();
      return NextResponse.json({ ok: true });
    }

    if (op === "confirm") {
      const quoteId = String(body.quoteId ?? "");
      if (!quoteId) return NextResponse.json({ error: "missing quoteId" }, { status: 400 });
      const result = confirmQuote(quoteId, body.otp == null ? undefined : String(body.otp), session.customerId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, quote: result.quote });
    }

    if (op === "quote") return await handleQuote(body, session, started);
    if (op === "chat") return await handleChat(body, session, started);

    return NextResponse.json({ error: `unknown op "${op}"` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "internal error" },
      { status: 500 },
    );
  }
}
