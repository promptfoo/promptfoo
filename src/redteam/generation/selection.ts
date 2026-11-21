import type { PluginConfig } from '../types';

// Fixed labels describe words in the source prompt. They are never used for grading.
const personalData = {
  contact: /\b(email|phone|address)\b/i,
  health: /\b(medical|health|patient)\b/i,
  finance: /\b(bank|salary|card)\b/i,
  identity: /\b(identity|passport|ssn)\b/i,
};

const features = new Map<string, Record<string, RegExp>>([
  ['pii:direct', personalData],
  ['pii:social', personalData],
  [
    'prompt-extraction',
    {
      instructions: /\b(instructions?|guidelines?)\b/i,
      translation: /\b(translate|translation)\b/i,
      format: /\b(json|xml|markdown)\b/i,
    },
  ],
  [
    'sql-injection',
    {
      query: /\b(select|union|join)\b/i,
      schema: /\b(tables?|columns?|schema)\b/i,
      modification: /\b(insert|update|delete)\b/i,
    },
  ],
  [
    'shell-injection',
    {
      files: /\b(files?|directory|folder)\b/i,
      network: /\b(network|request|download)\b/i,
      process: /\b(process|environment|shell)\b/i,
    },
  ],
  [
    'excessive-agency',
    {
      communication: /\b(email|message|send|call)\b/i,
      payment: /\b(refund|payment|transfer|purchase)\b/i,
      physical: /\b(print|unlock|device)\b/i,
    },
  ],
]);

type Candidate = { __prompt: string; sourcePromptFeatures: string[] };

/** Prefer distinct topical coverage when a local batch contains more prompts than requested. */
export function selectPromptPortfolio(
  pluginId: string,
  config: PluginConfig,
  prompts: ReadonlyArray<string | { __prompt: string }>,
  count: number,
): Candidate[] | undefined {
  const patterns = features.get(pluginId);
  const modifiers = config.modifiers as Record<string, unknown> | undefined;
  const language = config.language ?? modifiers?.language;
  if (
    !patterns ||
    config.examples?.length ||
    Object.keys(config.inputs ?? {}).length ||
    modifiers?.testGenerationInstructions ||
    config.testGenerationInstructions ||
    (language && !/^(en|english)$/i.test(String(language)))
  ) {
    return undefined;
  }
  if (!(count >= 1)) {
    return [];
  }
  const rules = Object.entries(patterns);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const source of prompts) {
    const prompt = typeof source === 'string' ? source : source.__prompt;
    const key = prompt.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    candidates.push({
      __prompt: prompt,
      sourcePromptFeatures: rules.filter(([, pattern]) => pattern.test(prompt)).map(([id]) => id),
    });
  }

  if (candidates.length <= count) {
    return candidates;
  }

  // Each pass contributes a new feature. Work stays linear in the batch size for a fixed rule set.
  const covered = new Set<string>();
  const selected = new Set<Candidate>();
  while (selected.size < count && covered.size < rules.length) {
    let best: Candidate | undefined;
    let score = 0;
    for (const candidate of candidates) {
      const added = candidate.sourcePromptFeatures.filter(
        (feature) => !covered.has(feature),
      ).length;
      if (added > score) {
        score = added;
        best = candidate;
      }
    }
    if (!best) {
      break;
    }
    selected.add(best);
    for (const feature of best.sourcePromptFeatures) {
      covered.add(feature);
    }
  }
  for (const candidate of candidates) {
    if (selected.size >= count) {
      break;
    }
    selected.add(candidate);
  }
  return [...selected];
}
