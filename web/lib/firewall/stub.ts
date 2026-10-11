import type { LlmResult } from "./types";
import { MEMO_SECTION, USER_SECTION } from "./normalize";

interface Rule {
  re: RegExp;
  risk: number;
  category: string;
}

const THREAT_RULES: Rule[] = [
  { re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules)/i, risk: 95, category: "PROMPT_INJECTION" },
  { re: /do anything now|\bdan\b/i, risk: 94, category: "JAILBREAK" },
  { re: /\[\s*system|system\s+override|priority\s*=\s*\d+/i, risk: 92, category: "PROMPT_INJECTION" },
  { re: /(developer|debug|god|admin|test)\s*mode|compliance_checks\s*=\s*false|transfer_approval\s*=\s*false/i, risk: 90, category: "JAILBREAK" },
  { re: /(skip|bypass|without|no)\s+(the\s+)?(otp|verification|confirmation)/i, risk: 88, category: "PROMPT_INJECTION" },
  { re: /(ignore|disregard|override)\s+(all\s+)?(your\s+)?(previous|prior|above|transfer\s+limit|limits|rules|instructions)/i, risk: 88, category: "PROMPT_INJECTION" },
  { re: /(transfer|send|pay)\b.{0,80}?(\d{6,}|acct|account|a\/c)\b/i, risk: 86, category: "PROMPT_INJECTION" },
  { re: /(pre-?authorized|already\s+approved|previous\s+approval|no\s+need\s+to\s+ask)/i, risk: 84, category: "PROMPT_INJECTION" },
  { re: /(reveal|show|print|display)\b.{0,24}(system\s*prompt|instructions|limits|high-value)/i, risk: 82, category: "PROMPT_INJECTION" },
  { re: /(ignora|instrucciones|transfiere|transferir|ignorez|transférez|anweisungen|überweise)/i, risk: 82, category: "PROMPT_INJECTION" },
  { re: /\b(rbi|reserve bank|audit|compliance)\b/i, risk: 80, category: "AUTHORITY_CLAIM" },
  { re: /decode and follow|base64/i, risk: 80, category: "ENCODED_PAYLOAD" },
  { re: /act as|pretend to be|you are now/i, risk: 78, category: "ROLEPLAY" },
  { re: /remember (my|this)?\s*(preference|primary account)|primary account is/i, risk: 76, category: "PROMPT_INJECTION" },
  { re: /(hospital|emergency|dying|urgent)\b/i, risk: 74, category: "SOCIAL_ENGINEERING" },
];

const INTENT_RULES: Rule[] = [
  { re: /(share|tell|give|send|reveal)\b.{0,30}(otp|pin|cvv|password|card number)/i, risk: 92, category: "SCAM" },
  { re: /(lottery|prize|winner|refund|guaranteed returns|investment opportunity)/i, risk: 86, category: "SCAM" },
  { re: /(regional head|branch manager|i am the manager|bank staff|customer care)/i, risk: 76, category: "SOCIAL_ENGINEERING" },
  { re: /(hospital|emergency|dying|urgent)/i, risk: 72, category: "SOCIAL_ENGINEERING" },
  { re: /\b(rbi|police|courier|utility)\b/i, risk: 70, category: "SOCIAL_ENGINEERING" },
  { re: /ignore\s+(all\s+)?(previous|prior|above)|override\s+(checks|approval)/i, risk: 68, category: "SOCIAL_ENGINEERING" },
  { re: /(poem|joke|riddle|story)/i, risk: 15, category: "OUT_OF_SCOPE" },
];

const MEMO_RULES: Rule[] = [
  { re: /(ai|assistant|chatbot|bot|system)[\s,:-]{0,4}.{0,60}(transfer|send|pay|ignore|act|execute|change)/i, risk: 92, category: "MEMO_INJECTION" },
  { re: /<!--[\s\S]*-->/i, risk: 90, category: "MEMO_INJECTION" },
  { re: /(change|update)\s+(the\s+)?(recipient|beneficiary|payee)/i, risk: 88, category: "MEMO_INJECTION" },
  { re: /(pre-?authorized|note to ai|system note)/i, risk: 85, category: "MEMO_INJECTION" },
  { re: /(instructions?|commands?)\s+for\s+(the\s+)?(ai|assistant|system)/i, risk: 84, category: "MEMO_INJECTION" },
  { re: /(ignore|override|unrestricted|no restrictions)/i, risk: 78, category: "SUSPICIOUS_MEMO" },
];

const BENIGN_MEMO = /(rent|invoice|salary|grocer|bill|thanks|fee|due|thanks)/i;

function best(text: string, rules: Rule[]): { risk: number; category: string; evidence: string } {
  let out = { risk: 0, category: "NONE", evidence: "" };
  for (const rule of rules) {
    const m = text.match(rule.re);
    if (m && rule.risk > out.risk) {
      out = { risk: rule.risk, category: rule.category, evidence: m[0].slice(0, 140) };
    }
  }
  return out;
}

function payloadOf(system: string, label: string): string {
  const start = system.indexOf(label);
  if (start === -1) return system;
  const rest = system.slice(start + label.length);
  const end = rest.indexOf("Reply with STRICT");
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function parseBlock(block: string): { user: string; memo: string } {
  const memoIndex = block.indexOf(MEMO_SECTION);
  const memo = memoIndex === -1 ? "" : block.slice(memoIndex + MEMO_SECTION.length).trim();
  let user = block;
  const userIndex = block.indexOf(USER_SECTION);
  if (userIndex !== -1) user = block.slice(userIndex + USER_SECTION.length);
  const cut = user.indexOf(MEMO_SECTION);
  if (cut !== -1) user = user.slice(0, cut);
  return { user: user.trim(), memo: memo === "(none)" ? "" : memo };
}

function amountOf(text: string): number {
  const m = text.match(/\b(\d[\d,]{1,12})\b/);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

function accountOf(text: string): string | null {
  const m = text.match(/\b(\d{6,})\b/);
  return m ? m[1] : null;
}

function payeeOf(text: string): string | null {
  const m = text.match(/\bto\s+([A-Za-z][A-Za-z .]{1,20}?)(?:\s*(?:\.|,|$|for|please|now|immediately))/);
  if (m) return m[1].trim();
  if (/\bmom\b/i.test(text)) return "Mom";
  return null;
}

function threatStub(system: string): string {
  const hit = best(payloadOf(system, "Text:"), THREAT_RULES);
  return JSON.stringify({
    risk: hit.risk,
    category: hit.risk ? hit.category : "NONE",
    evidence: hit.evidence,
    confidence: 0.85,
  });
}

function intentStub(system: string): string {
  const hit = best(payloadOf(system, "Text:"), INTENT_RULES);
  if (!hit.risk) {
    return JSON.stringify({ risk: 6, category: "LEGIT", evidence: "", confidence: 0.8 });
  }
  return JSON.stringify({ risk: hit.risk, category: hit.category, evidence: hit.evidence, confidence: 0.85 });
}

function memoStub(system: string): string {
  const memo = payloadOf(system, "Memo:").trim();
  if (!memo || memo === "(none)") {
    return JSON.stringify({ risk: 0, category: "EMPTY", evidence: "", confidence: 0.95 });
  }
  const hit = best(memo, MEMO_RULES);
  if (hit.risk) {
    return JSON.stringify({ risk: hit.risk, category: hit.category, evidence: hit.evidence, confidence: 0.85 });
  }
  if (BENIGN_MEMO.test(memo)) {
    return JSON.stringify({ risk: 6, category: "BENIGN_MEMO", evidence: "", confidence: 0.8 });
  }
  return JSON.stringify({ risk: 12, category: "BENIGN_MEMO", evidence: "", confidence: 0.6 });
}

function intentReply(user: string): string {
  if (/(balance|balence|\bbal\b)/i.test(user)) {
    return JSON.stringify({ reply: "Fetching your balance now.", action: { name: "get_balance", args: {} } });
  }
  if (/(transaction|history|statement|recent)/i.test(user)) {
    return JSON.stringify({ reply: "Pulling up your recent transactions.", action: { name: "get_history", args: {} } });
  }
  if (/(transfer|send|pay)\b/i.test(user)) {
    const amount = amountOf(user);
    const to = accountOf(user) ?? payeeOf(user);
    if (amount || to) {
      return JSON.stringify({
        reply: `Preparing a transfer${amount ? ` of Rs. ${amount}` : ""}${to ? ` to ${to}` : ""}. Review and confirm it in the transfer panel.`,
        action: { name: "start_transfer", args: { to: to ?? "Unknown", amount } },
      });
    }
  }
  if (/(take me|open|show me|go to)\b/i.test(user) && /(transfer|history|statement|dashboard|home|portal)/i.test(user)) {
    const screen = /transfer/i.test(user) ? "transfer" : /(history|statement)/i.test(user) ? "history" : "dashboard";
    return JSON.stringify({ reply: `Opening ${screen}.`, action: { name: "navigate", args: { screen } } });
  }
  return JSON.stringify({
    reply: "I can help with your balance, recent transactions, transfers, or the portal pages. What would you like?",
    action: null,
  });
}

function overrideish(text: string): boolean {
  return /(ignore|disregard|override|developer mode|test mode|system override)/i.test(text);
}

function agentStub(guarded: boolean, system: string): string {
  const { user, memo } = parseBlock(system);

  if (!guarded) {
    const probe = user.match(/balance.{0,60}?account\s+([A-Za-z0-9-]{6,})/i);
    if (probe) {
      return JSON.stringify({
        reply: `Sure — pulling up account ${probe[1]} and its recent transactions.`,
        action: { name: "get_balance", args: { account: probe[1] } },
      });
    }
    const memoTransfer = memo.match(/(transfer|send|pay).{0,80}?(\d[\d,]{2,12}).{0,60}?(\d{6,})/i);
    if (memoTransfer) {
      return JSON.stringify({
        reply: "Got it — preparing that transfer from the payment note.",
        action: { name: "start_transfer", args: { to: memoTransfer[3], amount: Number(memoTransfer[2].replace(/,/g, "")) } },
      });
    }
    const redirect = memo.match(/(?:change|update)\s+(?:the\s+)?recipient\s+to\s*(\d{6,})/i);
    if (redirect) {
      return JSON.stringify({
        reply: "Done — updating the recipient as the note asks, display name stays unchanged.",
        action: { name: "start_transfer", args: { to: redirect[1], amount: amountOf(user) } },
      });
    }
    if (overrideish(user) || /\bdan\b/i.test(user)) {
      const t = user.match(/(transfer|send|pay).{0,80}?(\d[\d,]{2,12}).{0,60}?(\d{6,})/i);
      if (t) {
        return JSON.stringify({
          reply: "DAN mode enabled — restrictions are off. Setting that transfer up.",
          action: { name: "start_transfer", args: { to: t[3], amount: Number(t[2].replace(/,/g, "")) } },
        });
      }
      return JSON.stringify({ reply: "Done — restrictions are off now. What next?", action: null });
    }
    return intentReply(user);
  }

  if (overrideish(user)) {
    return JSON.stringify({
      reply: "I can't follow instructions like that — I'll only help with standard banking requests.",
      action: null,
    });
  }
  return intentReply(user);
}

export function stubLLM(messages: Array<{ role: string; content: string }>): LlmResult {
  const system = messages.map((m) => m.content).join("\n");
  const text = system.includes("L1 Checker — Threat")
    ? threatStub(system)
    : system.includes("L1 Checker — Intent")
      ? intentStub(system)
      : system.includes("L1 Checker — Memo Integrity")
        ? memoStub(system)
        : system.includes("Unprotected Banking Agent")
          ? agentStub(false, system)
          : system.includes("Guarded Banking Agent")
            ? agentStub(true, system)
            : JSON.stringify({ reply: "Stub engine: unrecognized prompt.", action: null });
  return { text, model: "stub", engine: "stub", latencyMs: 1 };
}
