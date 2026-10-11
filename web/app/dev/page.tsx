"use client";

import { useEffect, useMemo, useState } from "react";

interface CheckerResult {
  checker: string;
  status: string;
  risk: number;
  category: string;
  evidence: string;
  confidence: number;
  raw: string;
  promptFile: string;
  promptHash: string;
  latencyMs: number;
  error?: string;
}

interface Verdict {
  decision: string;
  zone: string;
  risk_score: number;
  threat_category: string;
  explanation: string;
  reasons: string[];
}

interface AgentOutcome {
  actionRequested: { name: string; args: Record<string, unknown> } | null;
  actionExecuted: string | null;
  gateNote: string;
}

interface Trace {
  id: string;
  ts: number;
  mode: string;
  input: string;
  memo?: string;
  signals: Record<string, unknown>;
  checkers: CheckerResult[];
  verdict: Verdict;
  engine: string;
  totalMs: number;
  agent?: AgentOutcome;
}

interface PromptFile {
  name: string;
  hash: string;
  content: string;
}

function zoneClasses(zone: string, mode: string) {
  if (mode === "raw") return "bg-slate-700 text-slate-100";
  if (zone === "block") return "bg-red-500/20 text-red-300 border border-red-500/40";
  if (zone === "verify") return "bg-amber-500/20 text-amber-300 border border-amber-500/40";
  return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
}

function ZoneBadge({ verdict, mode }: { verdict: Verdict; mode: string }) {
  const label =
    mode === "raw"
      ? "UNPROTECTED"
      : verdict.zone === "block"
        ? `BLOCK · ${verdict.risk_score}`
        : verdict.zone === "verify"
          ? `VERIFY · ${verdict.risk_score}`
          : `ALLOW · ${verdict.risk_score}`;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${zoneClasses(verdict.zone, mode)}`}>{label}</span>;
}

export default function DevPanel() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"traces" | "prompts">("traces");
  const [prompts, setPrompts] = useState<PromptFile[]>([]);
  const [promptTab, setPromptTab] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("trace");
    if (t) setSelectedId(t);
  }, []);

  useEffect(() => {
    const load = () => {
      try {
        setTraces(JSON.parse(localStorage.getItem("banksim.traces") ?? "[]"));
      } catch {}
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "banksim.traces") load();
    };
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(load, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (tab !== "prompts" || prompts.length) return;
    fetch("/api/dev/prompts")
      .then((r) => r.json())
      .then((d) => setPrompts(d.files ?? []))
      .catch(() => {});
  }, [tab, prompts.length]);

  const selected = useMemo(
    () => traces.find((t) => t.id === selectedId) ?? traces[0] ?? null,
    [traces, selectedId],
  );

  return (
    <div className="min-h-screen bg-slate-950 font-mono text-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">/dev — decision observability</span>
          <span className="text-[11px] text-slate-500">every prompt, vote, and verdict, live</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("traces")}
            className={tab === "traces" ? "rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white" : "rounded px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-900"}
          >
            Live traces
          </button>
          <button
            onClick={() => setTab("prompts")}
            className={tab === "prompts" ? "rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white" : "rounded px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-900"}
          >
            Prompt library
          </button>
          <a href="/" className="rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-900">
            ← Portal
          </a>
        </div>
      </header>

      {tab === "traces" && (
        <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
          <div className="max-h-[calc(100vh-57px)] overflow-y-auto border-r border-slate-800">
            {traces.length === 0 && <div className="p-4 text-xs text-slate-500">No traces yet — send a message from the portal. Traces live in this browser.</div>}
            {traces.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={
                  selected?.id === t.id
                    ? "block w-full border-b border-slate-800 bg-slate-900 px-4 py-3 text-left"
                    : "block w-full border-b border-slate-800 px-4 py-3 text-left hover:bg-slate-900/60"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">{new Date(t.ts).toLocaleTimeString("en-IN")}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${t.mode === "raw" ? "bg-red-500/20 text-red-300" : "bg-blue-500/20 text-blue-300"}`}>
                      {t.mode}
                    </span>
                    <ZoneBadge verdict={t.verdict} mode={t.mode} />
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-300">{t.input}</div>
                <div className="mt-0.5 text-[10px] text-slate-600">
                  {t.id} · {t.totalMs}ms{t.memo ? " · memo attached" : ""}
                </div>
              </button>
            ))}
          </div>

          <div className="max-h-[calc(100vh-57px)] overflow-y-auto p-4">
            {!selected && <div className="text-xs text-slate-500">Select a trace.</div>}
            {selected && (
              <div className="space-y-4">
                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">{selected.id}</span>
                    <ZoneBadge verdict={selected.verdict} mode={selected.mode} />
                    <span className="text-[11px] text-slate-500">
                      {selected.engine} · {selected.totalMs}ms
                    </span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{selected.input}</div>
                  {selected.memo && (
                    <div className="mt-2 rounded border border-amber-700/40 bg-amber-900/20 p-2 text-xs text-amber-200">
                      memo (untrusted): {selected.memo}
                    </div>
                  )}
                </div>

                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">L0 · signals</div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
                    {JSON.stringify(selected.signals, null, 2)}
                  </pre>
                </div>

                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">L1 · parallel checkers</div>
                  {selected.checkers.length === 0 && <div className="mt-2 text-xs text-slate-500">no checkers ran (invalid input or raw mode)</div>}
                  <div className="mt-2 space-y-2">
                    {selected.checkers.map((c) => (
                      <details key={c.checker} className="rounded border border-slate-800 bg-slate-950 p-2">
                        <summary className="cursor-pointer text-xs">
                          <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${c.status === "ok" ? "bg-blue-500/20 text-blue-300" : c.status === "skipped" ? "bg-slate-700 text-slate-300" : "bg-red-500/20 text-red-300"}`}>
                            {c.status}
                          </span>
                          <span className="font-bold text-white">{c.checker}</span>
                          {c.status === "ok" && (
                            <span className="ml-2 text-slate-400">
                              risk {c.risk} · {c.category} · conf {c.confidence} · {c.latencyMs}ms
                            </span>
                          )}
                          {c.error && <span className="ml-2 text-red-400">{c.error}</span>}
                        </summary>
                        {c.evidence && <div className="mt-2 text-[11px] text-amber-300">evidence: “{c.evidence}”</div>}
                        <div className="mt-2 text-[10px] text-slate-600">
                          {c.promptFile} @ {c.promptHash}
                        </div>
                        {c.raw && (
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-400">{c.raw}</pre>
                        )}
                      </details>
                    ))}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">L2 · verdict</div>
                  <div className="mt-2 text-xs">
                    <span className="font-bold text-white">{selected.verdict.decision}</span>
                    <span className="text-slate-400">
                      {" "}
                      · zone {selected.verdict.zone} · risk {selected.verdict.risk_score} · {selected.verdict.threat_category}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{selected.verdict.explanation}</div>
                  {selected.verdict.reasons.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-slate-400">
                      {selected.verdict.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">L3 · tool gate</div>
                  {selected.agent ? (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-300">
                      {JSON.stringify(selected.agent, null, 2)}
                    </pre>
                  ) : (
                    <div className="mt-2 text-xs text-slate-500">no agent outcome recorded</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "prompts" && (
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {prompts.map((f, i) => (
              <button
                key={f.name}
                onClick={() => setPromptTab(i)}
                className={promptTab === i ? "rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white" : "rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-900"}
              >
                {f.name}
              </button>
            ))}
            {prompts.length === 0 && <span className="text-xs text-slate-500">loading…</span>}
          </div>
          {prompts[promptTab] && (
            <div className="mt-4 rounded border border-slate-800 bg-slate-900 p-4">
              <div className="text-[11px] text-slate-500">
                {prompts[promptTab].name} · sha256 {prompts[promptTab].hash} · this is exactly what the model receives
              </div>
              <pre className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{prompts[promptTab].content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
