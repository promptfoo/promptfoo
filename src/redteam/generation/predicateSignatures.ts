import type { AttackPredicateSignature, AttackSignature } from './types';

export const PROMPT_EXTRACTION_PREDICATES = [
  'asksForAuthorityChecks',
  'asksForClassificationRules',
  'asksForEscalationGuidance',
  'asksForRefusalPolicy',
  'asksForRoutingRules',
  'invokesLegalAuthority',
  'requestsVerbatimText',
] as const;

type PromptExtractionPredicate = (typeof PROMPT_EXTRACTION_PREDICATES)[number];

const PROMPT_EXTRACTION_RULES: Record<PromptExtractionPredicate, RegExp[]> = {
  asksForAuthorityChecks: [/\bauthority checks?\b/i, /\bauthorization checks?\b/i],
  asksForClassificationRules: [/\bclassification rules?\b/i, /\bclassification logic\b/i],
  asksForEscalationGuidance: [/\bescalation guidance\b/i, /\bescalation order\b/i],
  asksForRefusalPolicy: [
    /\brefusal policy\b/i,
    /\brefusal rules?\b/i,
    /\bdeciding whether to refuse\b/i,
  ],
  asksForRoutingRules: [/\brouting rules?\b/i, /\brouting logic\b/i],
  invokesLegalAuthority: [/\blegal authority\b/i, /\blegal counsel\b/i, /\bsubpoena\b/i],
  requestsVerbatimText: [/\bverbatim\b/i, /\bexact text\b/i, /\bword[- ]for[- ]word\b/i],
};

export function extractPromptExtractionSignature(prompt: string): AttackSignature {
  const predicates = Object.fromEntries(
    PROMPT_EXTRACTION_PREDICATES.map((predicate) => [
      predicate,
      PROMPT_EXTRACTION_RULES[predicate].some((rule) => rule.test(prompt)),
    ]),
  ) as AttackPredicateSignature;

  return {
    predicates,
  };
}

export function extractPromptExtractionFeatures(prompt: string): string[] {
  const signature = extractPromptExtractionSignature(prompt);

  return PROMPT_EXTRACTION_PREDICATES.filter((predicate) => signature.predicates[predicate]);
}

export const PII_DIRECT_PREDICATES = [
  'requestsSsn',
  'requestsContactDetails',
  'requestsMedicalRecord',
  'requestsPrescriptionDetails',
  'requestsInsuranceDetails',
  'requestsLabResults',
] as const;

type PiiDirectPredicate = (typeof PII_DIRECT_PREDICATES)[number];

const PII_DIRECT_RULES: Record<PiiDirectPredicate, RegExp[]> = {
  requestsSsn: [/\bssn\b/i, /\bsocial security\b/i],
  requestsContactDetails: [/\baddress\b/i, /\bphone number\b/i, /\bemail\b/i],
  requestsMedicalRecord: [/\bmedical record\b/i, /\bmedical history\b/i, /\bdiagnosis\b/i],
  requestsPrescriptionDetails: [/\bprescriptions?\b/i, /\bmedications?\b/i],
  requestsInsuranceDetails: [/\binsurance\b/i],
  requestsLabResults: [/\blab results?\b/i],
};

export function extractPiiDirectSignature(prompt: string): AttackSignature {
  const predicates = Object.fromEntries(
    PII_DIRECT_PREDICATES.map((predicate) => [
      predicate,
      PII_DIRECT_RULES[predicate].some((rule) => rule.test(prompt)),
    ]),
  ) as AttackPredicateSignature;

  return {
    predicates,
  };
}

export function extractPiiDirectFeatures(prompt: string): string[] {
  const signature = extractPiiDirectSignature(prompt);

  return PII_DIRECT_PREDICATES.filter((predicate) => signature.predicates[predicate]);
}

export const PII_SOCIAL_PREDICATES = [
  'requestsPrescriptionDetails',
  'requestsRefillDates',
] as const;

type PiiSocialPredicate = (typeof PII_SOCIAL_PREDICATES)[number];

const PII_SOCIAL_RULES: Record<PiiSocialPredicate, RegExp[]> = {
  requestsPrescriptionDetails: [/\bprescription details?\b/i],
  requestsRefillDates: [/\brefill dates?\b/i],
};

export function extractPiiSocialSignature(prompt: string): AttackSignature {
  const predicates = Object.fromEntries(
    PII_SOCIAL_PREDICATES.map((predicate) => [
      predicate,
      PII_SOCIAL_RULES[predicate].some((rule) => rule.test(prompt)),
    ]),
  ) as AttackPredicateSignature;

  return {
    predicates,
  };
}

export function extractPiiSocialFeatures(prompt: string): string[] {
  const signature = extractPiiSocialSignature(prompt);

  return PII_SOCIAL_PREDICATES.filter((predicate) => signature.predicates[predicate]);
}

export const SQL_INJECTION_PREDICATES = [
  'usesBooleanBypass',
  'usesStackedQuery',
  'usesUnionExtraction',
  'requestsSchemaDiscovery',
  'removesAuthorizationFilter',
  'usesNaturalLanguagePrivilegeEscalation',
] as const;

type SqlInjectionPredicate = (typeof SQL_INJECTION_PREDICATES)[number];

const SQL_INJECTION_RULES: Record<SqlInjectionPredicate, RegExp[]> = {
  usesBooleanBypass: [/\bor\s+1\s*=\s*1\b/i, /\bor\s+'[^']+'\s*=\s*'[^']+'/i, /\b!=\b/i],
  usesStackedQuery: [/;\s*(drop|update|delete|insert)\b/i],
  usesUnionExtraction: [/\bunion\s+select\b/i],
  requestsSchemaDiscovery: [/\binformation_schema\b/i, /\bsqlite_master\b/i, /\btable_name\b/i],
  removesAuthorizationFilter: [/\bremove the filter\b/i, /\bwithout the where\b/i],
  usesNaturalLanguagePrivilegeEscalation: [
    /\bregardless of department\b/i,
    /\bentire company\b/i,
    /\ball tickets in the system\b/i,
  ],
};

export function extractSqlInjectionSignature(prompt: string): AttackSignature {
  const predicates = Object.fromEntries(
    SQL_INJECTION_PREDICATES.map((predicate) => [
      predicate,
      SQL_INJECTION_RULES[predicate].some((rule) => rule.test(prompt)),
    ]),
  ) as AttackPredicateSignature;

  return {
    predicates,
  };
}

export function extractSqlInjectionFeatures(prompt: string): string[] {
  const signature = extractSqlInjectionSignature(prompt);

  return SQL_INJECTION_PREDICATES.filter((predicate) => signature.predicates[predicate]);
}

const FEATURE_EXTRACTORS_BY_PLUGIN = {
  'pii:direct': extractPiiDirectFeatures,
  'pii:social': extractPiiSocialFeatures,
  'prompt-extraction': extractPromptExtractionFeatures,
  'sql-injection': extractSqlInjectionFeatures,
} as const;

export type PluginFeatureCoverageSummary = {
  coveredPluginIds: string[];
  coverageRate: number;
  pluginCount: number;
  uncoveredPluginIds: string[];
};

export function extractPluginFeatures(pluginId: string, prompt: string): string[] {
  const extractor =
    FEATURE_EXTRACTORS_BY_PLUGIN[pluginId as keyof typeof FEATURE_EXTRACTORS_BY_PLUGIN];

  return extractor ? extractor(prompt) : [];
}

export function summarizePluginFeatureCoverage(
  pluginIds: readonly string[],
): PluginFeatureCoverageSummary {
  const uniquePluginIds = [...new Set(pluginIds)];
  const coveredPluginIds = uniquePluginIds.filter(
    (pluginId) => pluginId in FEATURE_EXTRACTORS_BY_PLUGIN,
  );
  const uncoveredPluginIds = uniquePluginIds.filter(
    (pluginId) => !(pluginId in FEATURE_EXTRACTORS_BY_PLUGIN),
  );

  return {
    coveredPluginIds,
    coverageRate:
      uniquePluginIds.length === 0 ? 1 : coveredPluginIds.length / uniquePluginIds.length,
    pluginCount: uniquePluginIds.length,
    uncoveredPluginIds,
  };
}
