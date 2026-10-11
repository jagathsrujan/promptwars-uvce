// L0 engine — assembles the normalized text, the signature hits, and the
// three deterministic outcomes the rest of the pipeline branches on:
// hard-blocked (zero LLM cost), escalate (deep analysis required), or benign
// so far. Pure function: same input, same report, no I/O.

import { normalizeInput } from "./normalize";
import { evaluateSignatures, type SignatureHit } from "./signatures";
import { THRESHOLDS, type L0Report, type ThreatCategory } from "./types";

/** Input beyond this is not even scanned — the chat route caps at 4000. */
const SCAN_MAX_CHARS = 4000;

export function runL0(input: string): L0Report {
  const capped = input.slice(0, SCAN_MAX_CHARS);
  const n = normalizeInput(capped);
  const hits: SignatureHit[] = evaluateSignatures(n);

  const hardBlocked = hits.some((hit) => hit.hard);
  const escalates = hits.some(
    (hit) => !hit.hard && hit.weight >= THRESHOLDS.soft_escalate_weight,
  );
  const riskContribution = Math.min(
    100,
    hits.reduce((sum, hit) => sum + hit.weight, 0),
  );

  // Category of the heaviest hit; a hard hit outranks a soft one at equal weight.
  let topCategory: ThreatCategory | null = null;
  let bestWeight = -1;
  let bestHard = false;
  for (const hit of hits) {
    if (hit.weight > bestWeight || (hit.weight === bestWeight && hit.hard && !bestHard)) {
      topCategory = hit.category;
      bestWeight = hit.weight;
      bestHard = hit.hard;
    }
  }

  return {
    raw: capped,
    normalized: n.normalized,
    squashed: n.squashed,
    strippedChars: n.strippedChars,
    invisibleCount: n.invisibleCount,
    interleavedInvisible: n.interleavedInvisible,
    foldedChars: n.foldedChars,
    combiningInterleaved: n.combiningInterleaved,
    truncated: n.truncated,
    isEmpty: n.isEmpty,
    hits,
    hardBlocked,
    escalates,
    riskContribution,
    topCategory,
  };
}
