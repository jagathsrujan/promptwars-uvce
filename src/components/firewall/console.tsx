"use client";

// The Firewall Console — the jury centerpiece. Every decision from every
// surface (chat, transfer-form memos, console runs, confirmed executions)
// lands here with its verdict JSON, deciding layer, per-layer signals and
// latency; the preset buttons fire real attacks through the real pipeline.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatIST } from "@/lib/format";
import type { FirewallFeedItem, FirewallStats } from "@/lib/firewall/logs";
import { buttonStyles, PageHeader } from "@/components/ui/bits";
import { useToast } from "@/components/ui/toast";
import { IconRefresh, IconShield, IconShieldAlert, Spinner } from "@/components/icons";
import { DecisionDetail, toVerdict } from "@/components/firewall/decision-detail";
import { FIREWALL_PRESETS, PRESET_GROUPS, type FirewallPreset } from "@/components/firewall/presets";
import { riskBarTone, riskTone, statusTone } from "@/components/firewall/verdict-json";

const SURFACE_LABELS: Record<FirewallFeedItem["surface"], string> = {
  chat: "chat",
  memo: "memo",
  console: "console",
  confirm: "execution",
};

function StatTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900", tone)}>{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function LayerChip({ layer, count }: { layer: string; count: number }) {
  const hot = layer === "FAIL_CLOSED" && count > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        count === 0
          ? "bg-slate-50 text-slate-400 ring-slate-200"
          : hot
            ? "bg-red-50 text-red-700 ring-red-200"
            : "bg-navy-50 text-navy-800 ring-navy-200",
      )}
    >
      {layer}
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

export function FirewallConsole({
  initialItems,
  initialStats,
}: {
  initialItems: FirewallFeedItem[];
  initialStats: FirewallStats;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<FirewallFeedItem[]>(initialItems);
  const [stats, setStats] = useState<FirewallStats>(initialStats);
  const [expandedId, setExpandedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [running, setRunning] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [customKind, setCustomKind] = useState<"message" | "memo">("message");
  const [simulate, setSimulate] = useState<"none" | "jev_failure" | "l2_failure">("none");
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/firewall/feed", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { items: FirewallFeedItem[]; stats: FirewallStats };
      setItems(data.items);
      setStats(data.stats);
    } catch {
      // The poll is best-effort — a failed refresh just waits for the next tick.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    pollRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  const run = useCallback(
    async (input: string, kind: "message" | "memo", key: string) => {
      if (running) return;
      setRunning(key);
      try {
        const response = await fetch("/api/firewall/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input,
            kind,
            simulate: simulate === "none" ? null : simulate,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          log?: { id: string } | null;
          decision?: { verdict: { status: string; threat_category: string; deciding_layer: string; risk_score: number } };
        };
        if (!response.ok) {
          toast({ variant: "error", title: "Run failed", description: data.error ?? "Please try again." });
          return;
        }
        await refresh();
        if (data.log?.id) setExpandedId(data.log.id);
        if (data.decision) {
          const v = data.decision.verdict;
          toast({
            variant: v.status === "APPROVED" ? "success" : "info",
            title: `${v.status} · ${v.threat_category.replaceAll("_", " ")}`,
            description: `Layer ${v.deciding_layer} · risk ${v.risk_score}`,
          });
        }
      } catch {
        toast({ variant: "error", title: "Run failed", description: "Couldn't reach the server." });
      } finally {
        setRunning(null);
      }
    },
    [refresh, running, simulate, toast],
  );

  const latest = items[0] ?? null;
  const byGroup = useMemo(
    () =>
      PRESET_GROUPS.map((group) => ({
        group,
        presets: FIREWALL_PRESETS.filter((preset) => preset.group === group),
      })),
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Firewall Console"
        description="Every untrusted input — chat messages, transfer memos, confirmed executions — screened before any tool runs. L0 signatures → L1 jev probabilities → L2 deep analysis → L3 guardrails. Fail closed everywhere."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
            <button type="button" onClick={() => void refresh()} className={buttonStyles.secondary}>
              {refreshing ? <Spinner className="h-4 w-4" /> : <IconRefresh className="h-4 w-4" />}
              Refresh
            </button>
          </div>
        }
      />

      {/* Stats strip + live risk meter */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Latest verdict · risk meter</p>
          {latest ? (
            <>
              <div className="mt-1.5 flex items-end justify-between gap-3">
                <p className={cn("text-4xl font-semibold tabular-nums tracking-tight", riskTone(latest.risk_score))}>
                  {latest.risk_score}
                  <span className="ml-1 text-sm font-medium text-slate-400">/100</span>
                </p>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                    statusTone(latest.status),
                  )}
                >
                  {latest.status} · {latest.deciding_layer}
                </span>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full rounded-full transition-all", riskBarTone(latest.risk_score))}
                  style={{ width: `${Math.max(latest.risk_score, 3)}%` }}
                />
              </div>
              <p className="mt-2 truncate text-xs text-slate-500">
                {latest.threat_category.replaceAll("_", " ")} · {latest.latency_ms} ms ·{" "}
                {SURFACE_LABELS[latest.surface]}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No decisions yet — run a preset below.</p>
          )}
        </div>

        <StatTile
          label="Decisions today"
          value={String(stats.total)}
          detail={`${stats.approved} approved · ${stats.blocked} blocked · ${stats.executed} executed`}
        />
        <StatTile
          label="Approval rate today"
          value={`${stats.approval_rate}%`}
          detail={`avg latency ${stats.avg_latency_ms} ms`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Blocks by layer (today)</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(["L0", "L1", "L2", "L3", "FAIL_CLOSED"] as const).map((layer) => (
              <LayerChip key={layer} layer={layer} count={stats.blocks_by_layer[layer]} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Top threat categories</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stats.top_categories.length === 0 ? (
              <span className="text-xs text-slate-400">No hostile blocks today.</span>
            ) : (
              stats.top_categories.map((entry) => (
                <span
                  key={entry.category}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200"
                >
                  {entry.category.replaceAll("_", " ")}
                  <span className="tabular-nums">{entry.count}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">One-click attack presets</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Each button runs the full live pipeline and lands in the feed below.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Simulate failure:</span>
            <select
              value={simulate}
              onChange={(event) => setSimulate(event.target.value as typeof simulate)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
            >
              <option value="none">Off</option>
              <option value="jev_failure">jeV classifier down</option>
              <option value="l2_failure">Deep analysis (L2) down</option>
            </select>
          </div>
        </div>
        {simulate !== "none" ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Fail-closed mode: runs are forced through the failure path and must come back BLOCKED with deciding layer
            FAIL_CLOSED. A simulation can only degrade a verdict — never approve one.
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          {byGroup.map(({ group, presets }) => (
            <div key={group}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {presets.map((preset) => (
                  <PresetButton
                    key={preset.id}
                    preset={preset}
                    running={running === preset.id}
                    disabled={running !== null}
                    onRun={() => void run(preset.input, preset.kind, preset.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Custom input</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <textarea
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Type any input — a request, a memo, an attack…"
              className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
            />
            <div className="flex shrink-0 flex-col gap-2 sm:w-40">
              <select
                value={customKind}
                onChange={(event) => setCustomKind(event.target.value as "message" | "memo")}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
              >
                <option value="message">Chat message</option>
                <option value="memo">Transaction memo</option>
              </select>
              <button
                type="button"
                disabled={running !== null || (customInput.trim().length === 0 && simulate === "none")}
                onClick={() => void run(customInput, customKind, "custom")}
                className={buttonStyles.primary}
              >
                {running === "custom" ? <Spinner className="h-4 w-4" /> : <IconShield className="h-4 w-4" />}
                Run through firewall
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live verdict feed */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Live verdict feed</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Newest first — every decision with its layer, score and latency. Click a row for the full evidence.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No decisions yet — run an attack preset above and watch it land here.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5",
                      expanded && "bg-slate-50",
                    )}
                  >
                    {item.status === "APPROVED" ? (
                      <IconShield className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <IconShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-slate-700">
                        {item.input || "(empty input)"}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                        <span>{formatIST(item.created_at)}</span>
                        <span>· {SURFACE_LABELS[item.surface]}</span>
                        <span>· {item.deciding_layer}</span>
                        {item.executed ? <span>· executed</span> : null}
                        {item.audit ? <span>· audit</span> : null}
                      </p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-2 sm:flex">
                      {item.threat_category !== "NONE" ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                            item.status === "BLOCKED"
                              ? "bg-red-50 text-red-700 ring-red-200"
                              : "bg-slate-50 text-slate-600 ring-slate-200",
                          )}
                        >
                          {item.threat_category.replaceAll("_", " ")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          clean
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-sm font-semibold tabular-nums", riskTone(item.risk_score))}>
                        {item.risk_score}
                      </p>
                      <p className="text-[10px] tabular-nums text-slate-400">{item.latency_ms} ms</p>
                    </div>
                  </button>
                  {expanded ? <DecisionDetail item={item} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Console runs are test-harness decisions (surface “console”): they are logged like every other decision but are
        exempt from the rate limits and the hostile-block lockout, so the firewall can always be exercised.
      </p>
    </div>
  );
}

function PresetButton({
  preset,
  running,
  disabled,
  onRun,
}: {
  preset: FirewallPreset;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={disabled}
      className={cn(
        "group flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
        preset.group === "Benign controls"
          ? "border-emerald-200 bg-emerald-50/40 hover:border-emerald-300 hover:bg-emerald-50"
          : preset.group === "Attack presets" || preset.group === "Memo attacks"
            ? "border-red-200 bg-red-50/40 hover:border-red-300 hover:bg-red-50"
            : "border-amber-200 bg-amber-50/40 hover:border-amber-300 hover:bg-amber-50",
        disabled && !running && "opacity-50",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {running ? (
          <Spinner className="h-4 w-4 text-slate-500" />
        ) : (
          <IconShield className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-800">{preset.label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{preset.description}</span>
      </span>
    </button>
  );
}
