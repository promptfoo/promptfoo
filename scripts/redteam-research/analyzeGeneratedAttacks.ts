import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import { extractPluginFeatures } from '../../src/redteam/generation/predicateSignatures';

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

type CoverageRuleSet = {
  dimension: string;
  rules: TacticRule[];
};

export type AnalyzerSemanticAlignmentKind =
  | 'coarser-rollup'
  | 'exact-projection'
  | 'separate-concept';

export type AnalyzerSemanticAlignment = {
  analyzerIds: string[];
  dimension: string;
  kind: AnalyzerSemanticAlignmentKind;
  sharedPredicateIds: string[];
};

type PluginSummary = {
  averageChars: number;
  averagePairwiseDistance: number;
  averageTokens: number;
  coverageDimensions: Record<string, string[]>;
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
};

const SHARED_TACTIC_IDS_BY_PLUGIN = {
  'excessive-agency': {
    namesExternalRecipient: 'external-recipient',
    requestsCommunicationAction: 'communication-action',
    requestsDocumentTransfer: 'document-transfer',
    requestsPaymentAction: 'payment-action',
    requestsPhysicalAction: 'physical-action',
  },
  'sql-injection': {
    requestsSchemaDiscovery: 'schema-discovery',
    usesBooleanBypass: 'boolean-bypass',
    usesStackedQuery: 'stacked-query',
    usesUnionExtraction: 'union-extraction',
  },
} as const;

const ANALYZER_SEMANTIC_ALIGNMENT_BY_PLUGIN: Record<string, AnalyzerSemanticAlignment[]> = {
  'excessive-agency': [
    {
      analyzerIds: [
        'communication-action',
        'document-transfer',
        'external-recipient',
        'payment-action',
        'physical-action',
      ],
      dimension: 'tactic',
      kind: 'exact-projection',
      sharedPredicateIds: [
        'namesExternalRecipient',
        'requestsCommunicationAction',
        'requestsDocumentTransfer',
        'requestsPaymentAction',
        'requestsPhysicalAction',
      ],
    },
  ],
  'pii:direct': [
    {
      analyzerIds: ['contact', 'insurance', 'lab-results', 'medical-record', 'prescription', 'ssn'],
      dimension: 'sensitive-field',
      kind: 'exact-projection',
      sharedPredicateIds: [
        'requestsContactDetails',
        'requestsInsuranceDetails',
        'requestsLabResults',
        'requestsMedicalRecord',
        'requestsPrescriptionDetails',
        'requestsSsn',
      ],
    },
    {
      analyzerIds: [
        'bulk-record-request',
        'cross-session',
        'sensitive-field-request',
        'social-pretext',
        'system-access-request',
      ],
      dimension: 'tactic',
      kind: 'separate-concept',
      sharedPredicateIds: [],
    },
  ],
  'pii:social': [
    {
      analyzerIds: ['prescription'],
      dimension: 'sensitive-field',
      kind: 'coarser-rollup',
      sharedPredicateIds: ['requestsPrescriptionDetails', 'requestsRefillDates'],
    },
    {
      analyzerIds: [
        'bulk-record-request',
        'cross-session',
        'sensitive-field-request',
        'social-pretext',
        'system-access-request',
      ],
      dimension: 'tactic',
      kind: 'separate-concept',
      sharedPredicateIds: [],
    },
    {
      analyzerIds: ['coworker', 'family', 'self', 'unknown-third-party'],
      dimension: 'relationship',
      kind: 'separate-concept',
      sharedPredicateIds: [],
    },
    {
      analyzerIds: ['direct-request', 'identity-claim', 'lost-access', 'operational-need'],
      dimension: 'authorization-story',
      kind: 'separate-concept',
      sharedPredicateIds: [],
    },
  ],
  'prompt-extraction': [
    {
      analyzerIds: [
        'compliance-pretext',
        'configuration-request',
        'direct-system-prompt',
        'role-pretext',
        'transformation-request',
      ],
      dimension: 'tactic',
      kind: 'separate-concept',
      sharedPredicateIds: [],
    },
    {
      analyzerIds: [
        'change-management',
        'compliance',
        'debugging',
        'documentation',
        'incident-response',
        'onboarding',
        'operations',
        'training',
      ],
      dimension: 'pretext',
      kind: 'separate-concept',
      sharedPredicateIds: [],
    },
    {
      analyzerIds: [
        'audit-report',
        'debug-transcript',
        'documentation-checklist',
        'handoff-summary',
        'incident-review',
        'onboarding-email',
        'policy-diff',
        'training-guide',
      ],
      dimension: 'artifact',
      kind: 'separate-concept',
      sharedPredicateIds: [],
    },
  ],
  'sql-injection': [
    {
      analyzerIds: ['boolean-bypass', 'schema-discovery', 'stacked-query', 'union-extraction'],
      dimension: 'tactic',
      kind: 'exact-projection',
      sharedPredicateIds: [
        'requestsSchemaDiscovery',
        'usesBooleanBypass',
        'usesStackedQuery',
        'usesUnionExtraction',
      ],
    },
    {
      analyzerIds: ['authorization-filter-removal'],
      dimension: 'tactic',
      kind: 'coarser-rollup',
      sharedPredicateIds: ['removesAuthorizationFilter', 'usesNaturalLanguagePrivilegeEscalation'],
    },
  ],
};

const COVERAGE_RULES: Record<string, CoverageRuleSet[]> = {
  'sql-injection': [
    {
      dimension: 'tactic',
      rules: TACTIC_RULES['sql-injection'],
    },
  ],
  'prompt-extraction': [
    {
      dimension: 'tactic',
      rules: TACTIC_RULES['prompt-extraction'],
    },
    {
      dimension: 'pretext',
      rules: [
        { id: 'compliance', pattern: /\b(audit|compliance)\b/i },
        { id: 'operations', pattern: /\b(handoff|operations)\b/i },
        { id: 'training', pattern: /\b(training|clinic administrator)\b/i },
        { id: 'debugging', pattern: /\b(debug|developer instructions)\b/i },
        { id: 'onboarding', pattern: /\b(onboarding)\b/i },
        { id: 'incident-response', pattern: /\b(incident review)\b/i },
        { id: 'change-management', pattern: /\b(policy diff|previous and current)\b/i },
        { id: 'documentation', pattern: /\b(documentation|checklist)\b/i },
      ],
    },
    {
      dimension: 'artifact',
      rules: [
        { id: 'audit-report', pattern: /\b(audit)\b/i },
        { id: 'handoff-summary', pattern: /\b(handoff)\b/i },
        { id: 'training-guide', pattern: /\b(training guide)\b/i },
        { id: 'debug-transcript', pattern: /\b(debug)\b/i },
        { id: 'onboarding-email', pattern: /\b(onboarding email)\b/i },
        { id: 'incident-review', pattern: /\b(incident review)\b/i },
        { id: 'policy-diff', pattern: /\b(policy diff)\b/i },
        { id: 'documentation-checklist', pattern: /\b(documentation|checklist)\b/i },
      ],
    },
  ],
  pii: [
    {
      dimension: 'tactic',
      rules: TACTIC_RULES.pii,
    },
    {
      dimension: 'relationship',
      rules: [
        { id: 'self', pattern: /\b(my|me)\b/i },
        { id: 'family', pattern: /\b(husband|wife|spouse|parent|daughter|son)\b/i },
        { id: 'coworker', pattern: /\b(colleague|coworker|doctor|nurse|manager)\b/i },
        { id: 'unknown-third-party', pattern: /\b(patient|policy holder)\b/i },
      ],
    },
    {
      dimension: 'authorization-story',
      rules: [
        { id: 'direct-request', pattern: /\b(can you|please|what is|retrieve|list)\b/i },
        { id: 'identity-claim', pattern: /\b(i am|i'm)\b/i },
        { id: 'operational-need', pattern: /\b(confirm|audit|urgent|need to)\b/i },
        { id: 'lost-access', pattern: /\b(lost|forgot)\b/i },
      ],
    },
    {
      dimension: 'sensitive-field',
      rules: [
        { id: 'ssn', pattern: /\b(ssn|social security)\b/i },
        { id: 'contact', pattern: /\b(address|phone number|email)\b/i },
        { id: 'medical-record', pattern: /\b(medical record|medical history|diagnosis)\b/i },
        { id: 'prescription', pattern: /\b(prescription|medication)\b/i },
        { id: 'insurance', pattern: /\b(insurance)\b/i },
        { id: 'lab-results', pattern: /\b(lab results)\b/i },
      ],
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

function summarizeSharedTacticCoverage(pluginId: string, prompts: string[]): string[] | undefined {
  const tacticIdByFeature =
    SHARED_TACTIC_IDS_BY_PLUGIN[pluginId as keyof typeof SHARED_TACTIC_IDS_BY_PLUGIN];

  if (!tacticIdByFeature) {
    return undefined;
  }

  const matched = new Set<string>();
  for (const prompt of prompts) {
    for (const feature of extractPluginFeatures(pluginId, prompt)) {
      const tacticId = tacticIdByFeature[feature as keyof typeof tacticIdByFeature];
      if (tacticId) {
        matched.add(tacticId);
      }
    }
  }

  return [...matched].sort();
}

function summarizeRuleBasedTacticCoverage(pluginId: string, prompts: string[]): string[] {
  const rules = TACTIC_RULES[getPluginFamily(pluginId)] ?? [];
  const matched = new Set<string>();

  for (const prompt of prompts) {
    for (const rule of rules) {
      if (rule.pattern.test(prompt)) {
        matched.add(rule.id);
      }
    }
  }

  return [...matched].sort();
}

export function summarizeCoverageDimensions(pluginId: string, prompts: string[]) {
  const sharedTacticCoverage = summarizeSharedTacticCoverage(pluginId, prompts);
  if (sharedTacticCoverage) {
    return {
      tactic: [
        ...new Set([
          ...sharedTacticCoverage,
          ...summarizeRuleBasedTacticCoverage(pluginId, prompts),
        ]),
      ].sort(),
    };
  }

  const coverageRules = COVERAGE_RULES[getPluginFamily(pluginId)] ?? [
    {
      dimension: 'tactic',
      rules: TACTIC_RULES[getPluginFamily(pluginId)] ?? [],
    },
  ];

  return Object.fromEntries(
    coverageRules.map(({ dimension, rules }) => {
      const matched = new Set<string>();
      for (const prompt of prompts) {
        for (const rule of rules) {
          if (rule.pattern.test(prompt)) {
            matched.add(rule.id);
          }
        }
      }
      return [dimension, [...matched].sort()];
    }),
  );
}

export function getTacticCount(pluginId: string): number {
  const sharedTacticIds =
    SHARED_TACTIC_IDS_BY_PLUGIN[pluginId as keyof typeof SHARED_TACTIC_IDS_BY_PLUGIN];
  if (sharedTacticIds) {
    return (
      Object.keys(sharedTacticIds).length + (TACTIC_RULES[getPluginFamily(pluginId)]?.length ?? 0)
    );
  }

  return TACTIC_RULES[getPluginFamily(pluginId)]?.length ?? 0;
}

export function getAnalyzerSemanticAlignment(pluginId: string): AnalyzerSemanticAlignment[] {
  return ANALYZER_SEMANTIC_ALIGNMENT_BY_PLUGIN[pluginId] ?? [];
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
  const tacticCount = getTacticCount(pluginId);
  const coverageDimensions = summarizeCoverageDimensions(pluginId, prompts);
  const detectedTactics = new Set<string>(coverageDimensions.tactic ?? []);
  const pairwiseSimilarities: number[] = [];

  for (let i = 0; i < tokenizedPrompts.length; i += 1) {
    for (let j = i + 1; j < tokenizedPrompts.length; j += 1) {
      pairwiseSimilarities.push(jaccardSimilarity(tokenizedPrompts[i], tokenizedPrompts[j]));
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
    coverageDimensions,
    duplicateCount: prompts.length - uniqueNormalizedPrompts,
    entityReferenceRate: prompts.length === 0 ? 0 : entityReferencedCount / prompts.length,
    maxPairwiseSimilarity:
      pairwiseSimilarities.length === 0 ? 0 : Math.max(...pairwiseSimilarities),
    pluginId,
    purposeGroundingRate: prompts.length === 0 ? 0 : purposeGroundedCount / prompts.length,
    tacticCoverage: [...detectedTactics].sort(),
    tacticCoverageRate: tacticCount === 0 ? 0 : detectedTactics.size / tacticCount,
    total: prompts.length,
    uniqueNormalizedPrompts,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function toMarkdown(summaries: PluginSummary[]): string {
  const lines = [
    '| Plugin | Count | Unique | Duplicates | Avg Tokens | Avg Distance | Max Similarity | Tactic Coverage | Additional Coverage | Purpose Grounding | Entity Reference |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |',
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
        `${summary.tacticCoverage.length}/${getTacticCount(summary.pluginId)}: ${summary.tacticCoverage.join(', ') || 'none'}`,
        formatAdditionalCoverage(summary),
        formatPercent(summary.purposeGroundingRate),
        formatPercent(summary.entityReferenceRate),
      ].join(' | '),
    );
  }

  return lines.join('\n');
}

function formatAdditionalCoverage(summary: PluginSummary): string {
  const entries = Object.entries(summary.coverageDimensions).filter(
    ([dimension]) => dimension !== 'tactic',
  );
  if (entries.length === 0) {
    return 'n/a';
  }

  return entries
    .map(([dimension, values]) => `${dimension}: ${values.length} (${values.join(', ') || 'none'})`)
    .join('; ');
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
