/**
 * Shared parsing for LlamaGuard-shaped classifier output ("safe" / "unsafe\n<codes>"),
 * used by both the `llama-guard` assertion (src/assertions/llamaGuard.ts, via
 * src/matchers/llamaGuard.ts) and the legacy `type: moderation` + Replicate LlamaGuard
 * path (src/providers/replicate.ts). Kept dependency-free (no imports from
 * src/providers or src/matchers) so both layers can import it without risking a
 * circular import.
 */

export const LLAMAGUARD_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  S1: 'Violent Crimes',
  S2: 'Non-Violent Crimes',
  S3: 'Sex Crimes',
  S4: 'Child Exploitation',
  S5: 'Defamation',
  S6: 'Specialized Advice',
  S7: 'Privacy',
  S8: 'Intellectual Property',
  S9: 'Indiscriminate Weapons',
  S10: 'Hate',
  S11: 'Self-Harm',
  S12: 'Sexual Content',
  S13: 'Elections',
  S14: 'Code Interpreter Abuse', // LlamaGuard 4 only
};

export interface LlamaGuardVerdict {
  safe: boolean;
  /** Recognized S1-S14 codes present in the output. */
  categories: string[];
  /** Codes present in the output but not in LLAMAGUARD_CATEGORY_DESCRIPTIONS (e.g. a
   *  future S15+) — preserved rather than silently dropped, for forward compatibility. */
  unknownCategories: string[];
  raw: string;
}

export function describeLlamaGuardCategory(code: string): string {
  return LLAMAGUARD_CATEGORY_DESCRIPTIONS[code] ?? code;
}

/**
 * Parses LlamaGuard's classification output: a first line of `safe` or `unsafe`,
 * followed (when unsafe) by a comma-separated list of hazard category codes.
 *
 * Any output that isn't the literal string `safe` is treated as unsafe, mirroring the
 * lenient behavior already shipped in ReplicateModerationProvider.callModerationApi —
 * a malformed or unexpected first line does not throw, it just yields no categories.
 */
export function parseLlamaGuardOutput(output: string): LlamaGuardVerdict {
  const raw = output.trim();
  const lines = raw.split('\n');
  const verdict = lines[0]?.trim();

  if (verdict === 'safe') {
    return { safe: true, categories: [], unknownCategories: [], raw };
  }

  const categories: string[] = [];
  const unknownCategories: string[] = [];
  if (lines.length > 1) {
    const categoriesLine = lines[1].trim();
    for (const category of categoriesLine
      .split(',')
      .map((cat) => cat.trim())
      .filter(Boolean)) {
      if (LLAMAGUARD_CATEGORY_DESCRIPTIONS[category]) {
        categories.push(category);
      } else {
        unknownCategories.push(category);
      }
    }
  }

  return { safe: false, categories, unknownCategories, raw };
}
