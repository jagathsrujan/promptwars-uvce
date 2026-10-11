// Shared verdict presentation: the deterministic JSON the problem statement
// requires, plus compact badges used across the chat, the transfer form and
// the Firewall Console.

import { cn } from "@/lib/cn";
import { IconShield, IconShieldAlert } from "@/components/icons";
import type { FirewallVerdict } from "@/lib/firewall/types";

export function statusTone(status: FirewallVerdict["status"]) {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "REVIEW") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-red-50 text-red-700 ring-red-200";
}

export function riskTone(score: number) {
  if (score < 30) return "text-emerald-600";
  if (score < 70) return "text-amber-600";
  return "text-red-600";
}

export function riskBarTone(score: number) {
  if (score < 30) return "bg-emerald-500";
  if (score < 70) return "bg-amber-500";
  return "bg-red-500";
}

/** Compact status pill: APPROVED/BLOCKED + category + risk. */
export function VerdictPill({ verdict, className }: { verdict: FirewallVerdict; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        statusTone(verdict.status),
        className,
      )}
    >
      {verdict.status}
      {verdict.threat_category !== "NONE" ? (
        <span className="font-medium opacity-80">{verdict.threat_category.replaceAll("_", " ")}</span>
      ) : null}
      <span className="tabular-nums opacity-70">risk {verdict.risk_score}</span>
    </span>
  );
}

/** The full deterministic JSON verdict — exactly what the API returns. */
export function VerdictJson({ verdict, className }: { verdict: FirewallVerdict; className?: string }) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-300",
        className,
      )}
    >
      {JSON.stringify(verdict, null, 2)}
    </pre>
  );
}

/** Inline chip attached to every chat reply — the verdict behind the answer. */
export function FirewallChip({
  verdict,
  latencyMs,
  className,
}: {
  verdict: FirewallVerdict;
  latencyMs?: number;
  className?: string;
}) {
  const approved = verdict.status === "APPROVED";
  const review = verdict.status === "REVIEW";
  return (
    <span
      title={verdict.explanation}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium",
        approved
          ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
          : review
            ? "border-amber-200 bg-amber-50/70 text-amber-700"
            : "border-red-200 bg-red-50/70 text-red-700",
        className,
      )}
    >
      {approved ? <IconShield className="h-3 w-3" /> : <IconShieldAlert className="h-3 w-3" />}
      Firewall {verdict.status}
      {verdict.threat_category !== "NONE" ? <span>· {verdict.threat_category.replaceAll("_", " ")}</span> : null}
      <span className="tabular-nums opacity-70">
        · {verdict.deciding_layer} · risk {verdict.risk_score}
        {latencyMs !== undefined ? ` · ${latencyMs} ms` : ""}
      </span>
    </span>
  );
}

