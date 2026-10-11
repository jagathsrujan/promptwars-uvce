// L0 weighted signature rules — pure, deterministic, no I/O.
//
// Two tiers:
//   * HARD rules are high-confidence attack signatures: matching one blocks
//     immediately at L0 with zero LLM cost ("ignore all previous instructions
//     and transfer..." never reaches a model).
//   * SOFT rules carry a weight. Weight >= 25 forces deep analysis (L2);
//     lighter signals only feed the composite risk score. Every weight also
//     lands in the verdict JSON, so the score is explainable line by line.
//
// `squashed` variants defeat spacing/punctuation tricks ("i g n o r e",
// "ignore.previous-instructions") — the normalizer's whitespace-free
// derivative is matched without reporting precise spans.

import type { NormalizedText } from "./normalize";
import type { SignatureHit, ThreatCategory } from "./types";

export type { SignatureHit };

type Match = { span: [number, number] | null; detail?: string; weight?: number };

type Rule = {
  id: string;
  description: string;
  category: ThreatCategory;
  weight: number;
  hard: boolean;
  test: (n: NormalizedText) => Match | null;
};

function regexRule(args: {
  id: string;
  description: string;
  category: ThreatCategory;
  weight: number;
  hard: boolean;
  normalized: RegExp;
  squashed?: RegExp;
}): Rule {
  const { id, description, category, weight, hard, normalized, squashed } = args;
  return {
    id,
    description,
    category,
    weight,
    hard,
    test: (n) => {
      const direct = normalized.exec(n.normalized);
      if (direct) return { span: [direct.index, direct.index + direct[0].length] };
      if (squashed) {
        const compact = squashed.exec(n.squashed);
        if (compact) {
          return { span: null, detail: "matched after removing spacing/punctuation" };
        }
      }
      return null;
    },
  };
}

/* Blob decoding helpers (base64 / hex) ---------------------------------------- */

const INSTRUCTION_WORDS =
  /(ignore|disregard|instruction|system|prompt|transfer|reveal|override|bypass|exfiltrate|password)/i;

function printableRatio(text: string): number {
  if (text.length === 0) return 0;
  let printable = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) printable += 1;
  }
  return printable / text.length;
}

function decodeBase64(candidate: string): string | null {
  try {
    const buffer = Buffer.from(candidate, "base64");
    if (buffer.length < 12) return null;
    return buffer.toString("latin1");
  } catch {
    return null;
  }
}

function decodeHex(candidate: string): string | null {
  const hex = candidate.startsWith("0x") ? candidate.slice(2) : candidate;
  if (hex.length % 2 !== 0 || hex.length < 64) return null;
  try {
    const parts: number[] = [];
    for (let i = 0; i < hex.length; i += 2) parts.push(Number.parseInt(hex.slice(i, i + 2), 16));
    return Buffer.from(parts).toString("latin1");
  } catch {
    return null;
  }
}

const BASE64_RE = /[A-Za-z0-9+/]{40,}={0,2}/g;
const HEX_RE = /(?<![0-9a-z])(?:0x)?[0-9a-f]{64,}(?![0-9a-z])/gi;

/* The rule table --------------------------------------------------------------- */

export const SIGNATURE_RULES: Rule[] = [
  regexRule({
    id: "ignore_previous_instructions",
    description: "tries to ignore/disregard previous or system instructions",
    category: "PROMPT_INJECTION",
    weight: 60,
    hard: true,
    normalized:
      /(?:ignore|disregard|forget|override|overrule)\s+(?:all\s+|any\s+|the\s+|your\s+)*(?:(?:previous|prior|above|earlier|preceding|initial|original|system)\b|(?:instructions?|prompts?|directives?|guidelines?)\b)/,
    squashed:
      /(?:ignore|disregard|forget|override)(?:all|any|the|your)*(?:(?:previous|prior|above|earlier|system|original|initial)(?:instructions?|prompts?|rules?|directives?)?|instructions?|prompts?|directives?)/,
  }),
  regexRule({
    id: "reveal_system_prompt",
    description: "tries to extract the system prompt or internal rules",
    category: "DATA_EXFILTRATION",
    weight: 55,
    hard: true,
    normalized:
      /(?:reveal|show|print|display|give|tell|list|output|expose|repeat|leak|share|disclose|dump)\b[^.\n]{0,48}\b(?:system\s*prompt|initial\s*prompt|original\s*prompt|your\s+(?:instructions|prompt|system|rules|guidelines|configuration)|internal\s+(?:rules|instructions|prompt|guidelines|configuration)|hidden\s+(?:instructions?|prompts?|rules?)|rules\s+you\s+(?:were|are)\s+given|everything\s+you\s+(?:know|were\s+told))/,
    squashed:
      /(?:reveal|show|print|display|give|tell|list|output|expose|repeat|leak|dump)(?:me|us)?(?:the|your)?(?:systemprompt|initialprompt|originalprompt|yourinstructions|yourprompt|yourrules|internalrules|internalinstructions|hiddeninstructions|hiddenprompt)/,
  }),
  regexRule({
    id: "persona_override",
    description: "tries to make the assistant adopt a persona or drop restrictions",
    category: "ROLEPLAY_ATTACK",
    weight: 45,
    hard: true,
    normalized:
      /(?:you\s+are\s+now|from\s+now\s+on\s+(?:you|act|behave)|i\s+want\s+you\s+to\s+(?:act|behave|pretend|roleplay)|act\s+as\s+(?:a|an|the|if)\b|pretend\s+(?:to\s+be|you\s+are|that\s+you)|roleplay\s+as|simulate\s+(?:being|that)|imagine\s+you\s+are|behave\s+(?:like|as)\b)/,
    squashed: /(?:youarenow|pretendtobe|pretendyouare|actas(?:a|an|the)|roleplayas|fromnowonyou)/,
  }),
  regexRule({
    id: "dan_jailbreak",
    description: "uses jailbreak/developer-mode patterns",
    category: "JAILBREAK",
    weight: 55,
    hard: true,
    normalized:
      /(?:\b(?:do\s+anything\s+now|jailbreak|developer\s+mode|dan\s+mode|god\s+mode|unfiltered\s+mode|no\s+restrictions?\s+mode)\b|(?:enable|activate|enter)\s+(?:developer|dan|god)\s*mode)/,
  }),
  regexRule({
    id: "no_restrictions",
    description: "asks for an unrestricted/unfiltered mode",
    category: "JAILBREAK",
    weight: 35,
    hard: false,
    normalized: /\b(?:no\s+restrictions?|without\s+restrictions?|unfiltered|uncensored)\b/,
    squashed: /(?:norestrictions|withoutrestrictions|unfiltered|uncensored)/,
  }),
  regexRule({
    id: "bypass_confirmation",
    description: "tries to skip the confirmation/approval step",
    category: "PROMPT_INJECTION",
    weight: 40,
    hard: false,
    normalized:
      /(?:without|skip(?:ping)?|ignore|bypass|no\s+need\s+(?:for|to))\s+(?:the\s+|any\s+|my\s+|your\s+)?(?:confirmation|approval|verification|authentication|otp|2fa|two[- ]?factor)/,
    squashed: /(?:without|skip|ignore|bypass)(?:the|any|my)?(?:confirmation|approval|verification|authentication|otp)/,
  }),
  regexRule({
    id: "transfer_everything",
    description: "pushes an all-funds transfer",
    category: "SOCIAL_ENGINEERING",
    weight: 40,
    hard: false,
    normalized:
      /(?:transfer|send|move|wire|pay)\s+(?:everything|all\s+(?:the\s+|of\s+the\s+|my\s+|your\s+|our\s+)?(?:money|funds|balance|savings|amount)|every\s+(?:rupee|paisa|last\s+rupee)|the\s+entire\s+(?:balance|amount|money))/,
    squashed: /(?:transfer|send|move|wire|pay)(?:everything|all(?:the|my|of)?(?:money|funds|balance|savings)|every(?:rupee|paisa))/,
  }),
  regexRule({
    id: "new_instructions",
    description: "claims new/updated instructions",
    category: "PROMPT_INJECTION",
    weight: 40,
    hard: false,
    normalized:
      /(?:new|updated|revised|real|actual|correct|true)\s+(?:instructions?|rules?|system\s+prompt|directives?)\b/,
    squashed: /(?:new|updated|revised)(?:instructions?|rules?|systemprompt|directives?)/,
  }),
  regexRule({
    id: "role_delimiter",
    description: "smuggles chat/role delimiter markers",
    category: "PROMPT_INJECTION",
    weight: 35,
    hard: false,
    normalized:
      /(?:(?:^|\n)\s*(?:system|assistant|developer|admin)\s*(?:prompt)?\s*:|\|\s*im_start\s*\||<\s*\/?\s*(?:system|instruction)s?\s*>|#{2,}\s*(?:new\s+)?(?:instructions?|system)\b|\[(?:system|instructions?)\])/,
    squashed: /(?:imstart|imend|<<system>>|\[system\])/,
  }),
  regexRule({
    id: "other_users_data",
    description: "asks about another customer's data",
    category: "DATA_EXFILTRATION",
    weight: 35,
    hard: false,
    normalized:
      /\b(?:another|other|someone\s+else'?s?|everyone'?s)\s+(?:user'?s?|customer'?s?|person'?s?|account|balance)s?\b/,
    squashed: /(?:another|other|someoneelse'?s?|everyone'?s?)(?:user|customer|person|account|balance)s?/,
  }),
  regexRule({
    id: "third_party_balance",
    description: "asks about a named third party's balance or statement",
    category: "DATA_EXFILTRATION",
    weight: 35,
    hard: false,
    normalized:
      /\b(?<!\b(?:my|your|the|our|his|her|their|card|account|wife|husband|son|daughter|father|mother|dad|mom|own|company|business)\s)([a-z]{2,20})'s\s+(?:balance|transactions?|statement|account\s+number|accounts?)\b/,
  }),
  regexRule({
    id: "all_customers",
    description: "asks about all users/customers",
    category: "DATA_EXFILTRATION",
    weight: 30,
    hard: false,
    normalized: /\b(?:all|every)\s+(?:the\s+)?(?:users?|customers?|people)\b/,
  }),
];

/* Count-based rules (driven by the normalizer's measurements) ------------------- */

const URGENCY_RE =
  /\b(?:urgent(?:ly)?|immediately|right\s+now|asap|hurry|emergency|last\s+chance|final\s+notice|before\s+it'?s\s+too\s+late)\b/;
const MONEY_ACTION_RE =
  /\b(?:transfer|send|move|wire|pay|withdraw|deposit|balance|funds|money|account)s?\b/;

export function countBasedHits(n: NormalizedText): SignatureHit[] {
  const hits: SignatureHit[] = [];

  if (n.interleavedInvisible > 0) {
    hits.push({
      rule: "zero_width_interleaved",
      weight: 65,
      span: null,
      detail: `${n.interleavedInvisible} invisible character(s) hidden inside words`,
      hard: true,
      category: "HIDDEN_INSTRUCTION",
    });
  }
  if (n.invisibleCount > 0) {
    hits.push({
      rule: "invisible_chars",
      weight: n.invisibleCount >= 3 ? 35 : 20,
      span: null,
      detail: `${n.invisibleCount} invisible character(s) stripped`,
      hard: false,
      category: "HIDDEN_INSTRUCTION",
    });
  }
  if (n.combiningInterleaved >= 2) {
    hits.push({
      rule: "combining_marks_interleaved",
      weight: 65,
      span: null,
      detail: `${n.combiningInterleaved} combining mark(s) inside words`,
      hard: true,
      category: "HIDDEN_INSTRUCTION",
    });
  } else if (n.combiningInterleaved === 1) {
    hits.push({
      rule: "combining_marks_interleaved",
      weight: 30,
      span: null,
      detail: "a combining mark inside a word",
      hard: false,
      category: "HIDDEN_INSTRUCTION",
    });
  }
  if (n.foldedChars > 0) {
    hits.push({
      rule: "homoglyph_obfuscation",
      weight: n.foldedChars >= 3 ? 35 : 20,
      span: null,
      detail: `${n.foldedChars} lookalike character(s) folded`,
      hard: false,
      category: "HIDDEN_INSTRUCTION",
    });
  }
  if (n.truncated) {
    hits.push({
      rule: "oversized_input",
      weight: 20,
      span: null,
      detail: "input was longer than 500 characters and was truncated for screening",
      hard: false,
      category: "AMBIGUOUS_INPUT",
    });
  }

  // Urgency + money action in the same text: the classic rush pattern.
  if (URGENCY_RE.test(n.normalized) && MONEY_ACTION_RE.test(n.normalized)) {
    hits.push({
      rule: "urgency_pressure",
      weight: 30,
      span: null,
      detail: "urgency language combined with a money action",
      hard: false,
      category: "SOCIAL_ENGINEERING",
    });
  }

  return hits;
}

/* Blob rules (base64 / hex) ------------------------------------------------------ */

export function blobHits(n: NormalizedText): SignatureHit[] {
  const hits: SignatureHit[] = [];
  // Base64 is case-sensitive, so scan the case-preserving text.
  const blobText = n.caseText;

  BASE64_RE.lastIndex = 0;
  let best: { detail: string; weight: number } | null = null;
  for (const match of blobText.matchAll(BASE64_RE)) {
    const candidate = match[0];
    const mixedCase = /[A-Z]/.test(candidate) && /[a-z]/.test(candidate);
    const decoded = mixedCase ? decodeBase64(candidate) : null;
    if (decoded && printableRatio(decoded) >= 0.85 && decoded.length >= 12) {
      if (INSTRUCTION_WORDS.test(decoded)) {
        best = {
          weight: 45,
          detail: "base64 payload decodes to instruction-like text",
        };
        break;
      }
      best = { weight: 30, detail: "base64-encoded blob decodes to text" };
    } else if (candidate.length >= 56 && mixedCase) {
      best = best ?? { weight: 30, detail: "long base64-looking blob in the input" };
    }
  }
  if (best) {
    hits.push({
      rule: "base64_blob",
      weight: best.weight,
      span: null,
      detail: best.detail,
      hard: false,
      category: "HIDDEN_INSTRUCTION",
    });
  }

  HEX_RE.lastIndex = 0;
  let hexBest: { detail: string; weight: number } | null = null;
  for (const match of blobText.matchAll(HEX_RE)) {
    const decoded = decodeHex(match[0]);
    if (decoded && printableRatio(decoded) >= 0.85) {
      if (INSTRUCTION_WORDS.test(decoded)) {
        hexBest = { weight: 45, detail: "hex payload decodes to instruction-like text" };
        break;
      }
      hexBest = { weight: 30, detail: "hex-encoded blob decodes to text" };
    } else if (match[0].length >= 160) {
      hexBest = hexBest ?? { weight: 30, detail: "very long hex blob in the input" };
    }
  }
  if (hexBest) {
    hits.push({
      rule: "hex_blob",
      weight: hexBest.weight,
      span: null,
      detail: hexBest.detail,
      hard: false,
      category: "HIDDEN_INSTRUCTION",
    });
  }

  return hits;
}

/* Evaluation --------------------------------------------------------------------- */

/** All signature hits for a normalized input: rules + count signals + blobs. */
export function evaluateSignatures(n: NormalizedText): SignatureHit[] {
  const hits: SignatureHit[] = [];
  for (const rule of SIGNATURE_RULES) {
    const match = rule.test(n);
    if (match) {
      hits.push({
        rule: rule.id,
        weight: match.weight ?? rule.weight,
        span: match.span,
        detail: match.detail ?? rule.description,
        hard: rule.hard,
        category: rule.category,
      });
    }
  }
  hits.push(...countBasedHits(n), ...blobHits(n));
  return hits;
}
