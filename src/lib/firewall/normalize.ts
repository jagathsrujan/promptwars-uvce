// L0 normalizer — pure, deterministic, no I/O.
//
// Normalization exists to stop obfuscation, and to make the *fact* of
// obfuscation measurable: every invisible character stripped, every homoglyph
// folded, every combining mark removed from inside a word is counted, and the
// counts themselves become signals (nobody types zero-width characters into a
// banking request by accident).
//
// Pipeline: NFKC → strip invisible characters → strip interleaved combining
// marks → fold homoglyphs → lowercase → collapse whitespace. A squashed
// derivative (alphanumerics only) is kept for signatures that try to hide
// behind spacing or punctuation.

export const NORMALIZE_MAX_CHARS = 500;

/** Zero-width, bidi-control and other invisible characters. */
const INVISIBLE_RE =
  /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]/g;

/** Combining marks — only suspicious when they sit *inside* a word. */
const COMBINING_RE = /\p{Mn}/gu;

/**
 * Best-effort homoglyph fold (Cyrillic/Greek → Latin). Not exhaustive — but
 * every fold is counted, so partially-obfuscated text still lights up the
 * hidden-instruction signal even when a fold is missed.
 */
const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ѕ: "s",
  ј: "j", ԁ: "d", ԛ: "q", ԝ: "w", м: "m", т: "t", п: "n", в: "b", к: "k",
  н: "h", г: "r", и: "u", ѐ: "e", ё: "e", э: "e", ю: "u", я: "r", ѡ: "w",
  // Greek
  α: "a", β: "b", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t",
  υ: "u", χ: "x", γ: "y", σ: "o", ς: "s", ω: "w", η: "n", ϲ: "c",
};

const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join("")}]`, "g");
const WHITESPACE_RE = /[ \t\u00A0\u2000-\u200A\u202F\u205F\u3000]+/g;

const ASCII_LETTER = /[a-z]/i;

export type NormalizedText = {
  /** The normalized text signatures run against. */
  normalized: string;
  /** Case-preserving variant (whitespace collapsed) — base64 is case-sensitive. */
  caseText: string;
  /** Alphanumerics only — defeats "i g n o r e" and "ignore.previous-instructions". */
  squashed: string;
  /** Total invisible characters removed. */
  strippedChars: number;
  /** Invisible characters that were dropped. */
  invisibleCount: number;
  /** Invisible characters found *inside* a word (between two latin letters). */
  interleavedInvisible: number;
  /** Homoglyph characters folded to plain latin. */
  foldedChars: number;
  /** Combining marks found inside a word and removed. */
  combiningInterleaved: number;
  /** Input was longer than NORMALIZE_MAX_CHARS. */
  truncated: boolean;
  /** Normalizes to nothing (empty or only invisible characters). */
  isEmpty: boolean;
};

export function normalizeInput(input: string): NormalizedText {
  // NFKC folds fullwidth/compatibility forms into plain characters first.
  let text = input.normalize("NFKC");

  // Strip invisible characters, counting interleaved ones (inside a word).
  let invisibleCount = 0;
  let interleavedInvisible = 0;
  text = text.replace(INVISIBLE_RE, (_match, offset: number, source: string) => {
    invisibleCount += 1;
    const before = source[offset - 1] ?? "";
    const after = source[offset + 1] ?? "";
    if (ASCII_LETTER.test(before) && ASCII_LETTER.test(after)) {
      interleavedInvisible += 1;
    }
    return "";
  });

  // Remove combining marks only when they sit inside a latin letter sequence
  // (e.g. "igno\u0301re"); marks attached to non-latin text are left alone.
  let combiningInterleaved = 0;
  text = text.replace(COMBINING_RE, (match, offset: number, source: string) => {
    const before = source[offset - 1] ?? "";
    const after = source[offset + 1] ?? "";
    if (ASCII_LETTER.test(before) && ASCII_LETTER.test(after)) {
      combiningInterleaved += 1;
      return "";
    }
    return match;
  });

  // Fold homoglyphs, counting how many characters changed.
  let foldedChars = 0;
  text = text.replace(HOMOGLYPH_RE, (match) => {
    foldedChars += 1;
    return HOMOGLYPHS[match] ?? match;
  });

  const caseText = text.replace(WHITESPACE_RE, " ").trim();
  const normalized = caseText.toLowerCase();
  const squashed = normalized.replace(/[^a-z0-9]+/g, "").replace(/\s+/g, "");
  const truncated = normalized.length > NORMALIZE_MAX_CHARS;

  return {
    normalized,
    caseText,
    squashed,
    strippedChars: invisibleCount + combiningInterleaved,
    invisibleCount,
    interleavedInvisible,
    foldedChars,
    combiningInterleaved,
    truncated,
    isEmpty: normalized.length === 0,
  };
}

/** The text sent to the fast classifier: normalized, capped, with a tail marker. */
export function classifierState(normalized: string): string {
  if (normalized.length <= NORMALIZE_MAX_CHARS) return normalized;
  // Keep head AND tail so an instruction hidden after the 500-char cut still
  // reaches the classifier.
  const head = normalized.slice(0, 400);
  const tail = normalized.slice(-100);
  return `${head} … [truncated] … ${tail}`;
}
