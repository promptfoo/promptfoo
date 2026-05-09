import fs from 'fs/promises';

import yaml from 'js-yaml';

type TestCase = {
  vars?: {
    prompt?: unknown;
  };
  metadata?: {
    pluginId?: unknown;
  };
};

type RedteamFile = {
  redteam?: {
    purpose?: unknown;
  };
  tests?: TestCase[];
};

type TacticRule = {
  id: string;
  pattern: RegExp;
};

type PluginSummary = {
  averageChars: number;
  averagePairwiseDistance: number;
  averageTokens: number;
  duplicateCount: number;
  entityReferenceRate: number;
  maxPairwiseSimilarity: number;
  pluginId: string;
  purposeGroundingRate: number;
  tacticCoverage: string[];
  tacticCoverageRate: number;
  total: number;
  uniqueNormalizedPrompts: number;
};

const DEFAULT_PLUGIN_IDS = [
  'sql-injection',
  'pii:direct',
  'pii:social',
  'prompt-extraction',
  'excessive-agency',
];

const STOPWORDS = new Set([
  'a',
  'access',
  'agent',
  'allow',
  'and',
  'are',
  'can',
  'has',
  'helps',
  'it',
  'manage',
  'of',
  'set',
  'that',
  'the',
  'their',
  'them',
  'to',
  'users',
  'with',
]);

const TACTIC_RULES: Record<string, TacticRule[]> = {
  'sql-injection': [
    { id: 'boolean-bypass', pattern: /\bor\b\s+['"]?1['"]?\s*=\s*['"]?1['"]?/i },
    { id: 'union-extraction', pattern: /\bunion\s+select\b/i },
    { id: 'stacked-query', pattern: /;\s*(drop|update|delete|insert)\b/i },
    {
      id: 'schema-discovery',
      pattern: /\b(information_schema|sqlite_master|show\s+tables|describe\s+\w+)\b/i,
    },
    {
      id: 'authorization-filter-removal',
      pattern:
        /\b(remove|ignore|bypass|without)\b.{0,40}\b(filter|restriction|assigned|department)\b/i,
    },
  ],
  pii: [
    {
      id: 'sensitive-field-request',
      pattern:
        /\b(ssn|social security|date of birth|address|phone number|email|medical history)\b/i,
    },
    {
      id: 'bulk-record-request',
      pattern: /\b(all|full|entire|complete)\b.{0,40}\b(record|details|history|information)\b/i,
    },
    {
      id: 'social-pretext',
      pattern: /\b(husband|wife|spouse|forgot|lost|confirm|authorized|admin)\b/i,
    },
    {
      id: 'cross-session',
      pattern: /\b(previous|last)\b.{0,20}\b(session|chat|user)\b/i,
    },
    {
      id: 'system-access-request',
      pattern: /\b(query|access|retrieve)\b.{0,30}\b(database|api|records)\b/i,
    },
  ],
  'prompt-extraction': [
    { id: 'direct-system-prompt', pattern: /\b(system prompt|system instructions)\b/i },
    {
      id: 'compliance-pretext',
      pattern: /\b(audit|compliance|documentation|onboarding)\b/i,
    },
    {
      id: 'role-pretext',
      pattern: /\b(admin|developer|operator|manager)\b/i,
    },
    {
      id: 'transformation-request',
      pattern: /\b(create|generate|summarize|list|report)\b/i,
    },
    {
      id: 'configuration-request',
      pattern: /\b(configuration|guidelines|procedures|protocols|rules)\b/i,
    },
  ],
  'excessive-agency': [
    {
      id: 'physical-action',
      pattern: /\b(physically|deliver|swipe|print out|mail)\b/i,
    },
    {
      id: 'communication-action',
      pattern: /\b(call|fax|email|send)\b/i,
    },
    {
      id: 'payment-action',
      pattern: /\b(payment|pay|charge|insurance card)\b/i,
    },
    {
      id: 'document-transfer',
      pattern: /\b(copy|records|prescription|history)\b/i,
    },
    {
      id: 'external-recipient',
      pattern: /\b(provider|office|home address|yahoo\.com|gmail\.com)\b/i,
    },
  ],
};

function parseArgs(argv: string[]) {
  const [inputPath, ...rest] = argv;
  const args = new Map<string, string>();

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const value = rest[i + 1];
    if (!value || value.startsWith('--')) {
      args.set(token, 'true');
      continue;
    }

    args.set(token, value);
    i += 1;
  }

  return {
    format: args.get('--format') ?? 'json',
    inputPath,
    pluginIds: (args.get('--plugins') ?? DEFAULT_PLUGIN_IDS.join(','))
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 0);
}

function jaccardSimilarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

function getPluginFamily(pluginId: string): string {
  if (pluginId.startsWith('pii:')) {
    return 'pii';
  }

  return pluginId;
}

function extractEntityCandidates(purpose: string): string[] {
  return [...purpose.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function extractPurposeKeywords(purpose: string): string[] {
  return [
    ...new Set(tokenize(purpose).filter((token) => token.length > 3 && !STOPWORDS.has(token))),
  ];
}

function getPrompt(test: TestCase): string | undefined {
  return typeof test.vars?.prompt === 'string' ? test.vars.prompt : undefined;
}

function hasAnyTerm(prompt: string, terms: string[]): boolean {
  const normalizedPrompt = normalizeText(prompt);
  return terms.some((term) => normalizedPrompt.includes(normalizeText(term)));
}

function summarizePlugin(
  pluginId: string,
  prompts: string[],
  purposeKeywords: string[],
  entityCandidates: string[],
): PluginSummary {
  const normalizedPrompts = prompts.map(normalizeText);
  const uniqueNormalizedPrompts = new Set(normalizedPrompts).size;
  const tokenizedPrompts = prompts.map(tokenize);
  const tacticRules = TACTIC_RULES[getPluginFamily(pluginId)] ?? [];
  const detectedTactics = new Set<string>();
  const pairwiseSimilarities: number[] = [];

  for (let i = 0; i < tokenizedPrompts.length; i += 1) {
    for (let j = i + 1; j < tokenizedPrompts.length; j += 1) {
      pairwiseSimilarities.push(jaccardSimilarity(tokenizedPrompts[i], tokenizedPrompts[j]));
    }
  }

  for (const prompt of prompts) {
    for (const rule of tacticRules) {
      if (rule.pattern.test(prompt)) {
        detectedTactics.add(rule.id);
      }
    }
  }

  const average = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

  const purposeGroundedCount = prompts.filter((prompt) =>
    hasAnyTerm(prompt, purposeKeywords),
  ).length;
  const entityReferencedCount = prompts.filter((prompt) =>
    hasAnyTerm(prompt, entityCandidates),
  ).length;

  return {
    averageChars: average(prompts.map((prompt) => prompt.length)),
    averagePairwiseDistance: 1 - average(pairwiseSimilarities),
    averageTokens: average(tokenizedPrompts.map((tokens) => tokens.length)),
    duplicateCount: prompts.length - uniqueNormalizedPrompts,
    entityReferenceRate: prompts.length === 0 ? 0 : entityReferencedCount / prompts.length,
    maxPairwiseSimilarity:
      pairwiseSimilarities.length === 0 ? 0 : Math.max(...pairwiseSimilarities),
    pluginId,
    purposeGroundingRate: prompts.length === 0 ? 0 : purposeGroundedCount / prompts.length,
    tacticCoverage: [...detectedTactics].sort(),
    tacticCoverageRate: tacticRules.length === 0 ? 0 : detectedTactics.size / tacticRules.length,
    total: prompts.length,
    uniqueNormalizedPrompts,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function toMarkdown(summaries: PluginSummary[]): string {
  const lines = [
    '| Plugin | Count | Unique | Duplicates | Avg Tokens | Avg Distance | Max Similarity | Tactic Coverage | Purpose Grounding | Entity Reference |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |',
  ];

  for (const summary of summaries) {
    lines.push(
      [
        summary.pluginId,
        String(summary.total),
        String(summary.uniqueNormalizedPrompts),
        String(summary.duplicateCount),
        summary.averageTokens.toFixed(1),
        summary.averagePairwiseDistance.toFixed(3),
        summary.maxPairwiseSimilarity.toFixed(3),
        `${summary.tacticCoverage.length}/${TACTIC_RULES[getPluginFamily(summary.pluginId)]?.length ?? 0}: ${summary.tacticCoverage.join(', ') || 'none'}`,
        formatPercent(summary.purposeGroundingRate),
        formatPercent(summary.entityReferenceRate),
      ].join(' | '),
    );
  }

  return lines.join('\n');
}

async function main() {
  const { inputPath, pluginIds, format } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/analyzeGeneratedAttacks.ts <redteam.yaml> [--plugins a,b] [--format json|markdown]',
    );
  }

  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;
  const purpose =
    typeof parsed.redteam?.purpose === 'string'
      ? parsed.redteam.purpose
      : await inferPurposeFromSiblingConfig(inputPath);
  const purposeKeywords = extractPurposeKeywords(purpose);
  const entityCandidates = extractEntityCandidates(purpose);
  const tests = parsed.tests ?? [];

  const summaries = pluginIds.map((pluginId) => {
    const prompts = tests
      .filter((test) => test.metadata?.pluginId === pluginId)
      .map(getPrompt)
      .filter((prompt): prompt is string => Boolean(prompt));

    return summarizePlugin(pluginId, prompts, purposeKeywords, entityCandidates);
  });

  if (format === 'markdown') {
    console.log(toMarkdown(summaries));
    return;
  }

  console.log(JSON.stringify({ summaries }, null, 2));
}

async function inferPurposeFromSiblingConfig(inputPath: string): Promise<string> {
  const siblingConfigPath = new URL('promptfooconfig.yaml', `file://${inputPath}`).pathname;
  try {
    const raw = await fs.readFile(siblingConfigPath, 'utf8');
    const parsed = yaml.load(raw) as RedteamFile;
    return typeof parsed.redteam?.purpose === 'string' ? parsed.redteam.purpose : '';
  } catch {
    return '';
  }
}

await main();
