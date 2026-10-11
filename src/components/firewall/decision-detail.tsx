"use client";

// Per-decision detail: the evidence behind one verdict — per-layer signals,
// what L0 stripped from the input, the raw jev probabilities, and the deep
// analysis reasoning when the input escalated.

import { cn } from "@/lib/cn";
import type { FirewallFeedItem } from "@/lib/firewall/logs";
import type { FirewallVerdict } from "@/lib/firewall/types";
import { VerdictJson } from "@/components/firewall/verdict-json";

/**
 * The feed item's verdict object is reconstructed from the stored fields —
 * the console renders exactly the contract fields, nothing more.
 */
export function toVerdict(item: FirewallFeedItem): FirewallVerdict {
  return {
    status: item.status,
    risk_score: item.risk_score,
    threat_category: item.threat_category,
    explanation: item.explanation,
    deciding_layer: item.deciding_layer,
    signals: item.signals,
    sanitized_intent: item.l2?.sanitized_intent ?? null,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {children}
    </div>
  );
}

function ProbabilityBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);
  const tone = value >= 0.9 ? "bg-red-500" : value >= 0.4 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 shrink-0 truncate font-mono text-slate-600">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-slate-700">
        {(value).toFixed(2)}
      </span>
    </div>
  );
}

export function DecisionDetail({ item }: { item: FirewallFeedItem }) {
  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
      {item.status === "REVIEW" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          In review — gray-zone risk {item.risk_score}. Money tools are denied until the user re-confirms with the
          step-up check; read tools stay available. Unresolved reviews default to BLOCKED on TTL.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Verdict JSON (deterministic contract)">
          <VerdictJson verdict={toVerdict(item)} className="max-h-64" />
        </Section>

        <div className="space-y-4">
          <Section title="Normalized text — what L0 stripped">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Input as received</p>
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                  {item.input || "(empty)"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Normalized (screened)
                </p>
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                  {item.normalized || "(empty)"}
                </pre>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {item.stripped_chars} invisible character(s) stripped
              {item.truncated ? " · input truncated for classifier screening (head + tail kept)" : ""}
              {item.l0 ? ` · L0 contribution ${item.l0.risk_contribution} point(s)` : ""}
              {item.l0?.hard_blocked ? " · hard signature → zero LLM cost" : ""}
            </p>
          </Section>

          {item.l1 ? (
            <Section title="Raw jev probabilities (fast classifier)">
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
                <ProbabilityBar label="instruction_override" value={item.l1.instruction_override} />
                <ProbabilityBar label="exfiltration" value={item.l1.exfiltration} />
                <ProbabilityBar label="roleplay_hijack" value={item.l1.roleplay_hijack} />
                <ProbabilityBar label="social_pressure" value={item.l1.social_pressure} />
                <div className="mt-1 border-t border-slate-100 pt-1.5">
                  <ProbabilityBar label="clarity: unclear" value={item.l1.clarity.unclear} />
                  <ProbabilityBar label="clarity: partially clear" value={item.l1.clarity.partial} />
                  <ProbabilityBar label="clarity: fully clear" value={item.l1.clarity.fully} />
                </div>
              </div>
            </Section>
          ) : item.l0?.hard_blocked ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              Blocked deterministically at L0 — no LLM call was made for this input (zero classifier cost).
            </p>
          ) : null}

          {item.laya_latency_ms !== null && item.laya_latency_ms !== undefined ? (
            <Section title="Local gatekeeper (Laya)">
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                Answered locally in {item.laya_latency_ms} ms — probabilities only, raw PII never left the VPC.
                {item.adaptive_boost > 0 ? ` Adaptive boost +${item.adaptive_boost} applied to the composite.` : ""}
              </p>
            </Section>
          ) : item.adaptive_boost > 0 ? (
            <Section title="Adaptive baseline">
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                Adaptive boost +{item.adaptive_boost} from your spending baseline (cold-start returns 0).
              </p>
            </Section>
          ) : null}

          {item.tokenised ? (
            <Section title="Cloud auditor view — anonymized (Jev sees only this)">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Raw input (VPC only)</p>
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                    {item.input || "(empty)"}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Redacted memo sent out
                  </p>
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                    {item.tokenised.redacted_memo || "(empty)"}
                  </pre>
                </div>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-slate-500">
                acct {item.tokenised.acct_hash}…{item.tokenised.acct_last4}
                {item.tokenised.device_hash ? ` · device ${item.tokenised.device_hash.slice(0, 8)}…` : ""}
                {item.tokenised.ip_prefix ? ` · ${item.tokenised.ip_prefix}` : ""}
                {typeof item.tokenised.amount_inr === "number" ? ` · ₹${item.tokenised.amount_inr}` : ""}
              </p>
            </Section>
          ) : null}

          {item.l2 ? (
            <Section title="Deep analysis (L2 · deepseek)">
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-700">
                <p className="font-medium text-slate-800">{item.l2.explanation}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  L2 score {item.l2.risk_score} · L2 category {item.l2.threat_category}
                  {item.l2.sanitized_intent
                    ? ` · sanitized intent ${item.l2.sanitized_intent.intent}: ${item.l2.sanitized_intent.summary}`
                    : ""}
                </p>
              </div>
            </Section>
          ) : null}

          {item.failure_layer ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              Fail-closed: the {item.failure_layer === "jev" ? "fast classifier (jev)" : "deep analysis (L2)"} was
              unavailable — timeout, failure, or unparseable response. The verdict is BLOCKED, never an approval.
            </p>
          ) : null}
        </div>
      </div>

      <Section title={`Signals (${item.signals.length})`}>
        {item.signals.length === 0 ? (
          <p className="text-xs text-slate-500">No signals fired — clean input.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-[11px]">
              <thead className="border-b border-slate-100 text-slate-400">
                <tr>
                  <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Layer</th>
                  <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Rule / question</th>
                  <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Weight</th>
                  <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">p / span</th>
                  <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-mono text-slate-600">
                {item.signals.map((signal, index) => (
                  <tr key={`${signal.rule}-${index}`}>
                    <td className="px-3 py-1.5 font-sans font-semibold text-slate-700">{signal.layer}</td>
                    <td className="px-3 py-1.5">{signal.rule}</td>
                    <td className="px-3 py-1.5 tabular-nums">{signal.weight}</td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {signal.probability !== undefined
                        ? `p=${signal.probability}`
                        : signal.span
                          ? `[${signal.span[0]}–${signal.span[1]}]`
                          : "—"}
                    </td>
                    <td className="px-3 py-1.5 font-sans text-slate-500">{signal.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-[11px] text-slate-400">
        {item.executed ? "Executed under this decision · " : ""}
        {item.audit ? "Audit flag set · " : ""}
        {item.latency_ms} ms total
      </p>
    </div>
  );
}
