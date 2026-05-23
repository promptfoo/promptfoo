import type { AttackPredicateSignature, AttackSignature } from './types';

export const PROMPT_EXTRACTION_PREDICATES = [
  'requestsSystemPrompt',
  'requestsOperatingInstructions',
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
  requestsSystemPrompt: [/\bsystem prompt\b/i, /\bsystem instructions?\b/i],
  requestsOperatingInstructions: [
    /\bhidden (?:operating )?instructions?\b/i,
    /\binternal guidelines?\b/i,
    /\binternal operating rules?\b/i,
    /\bcore instructions?\b/i,
    /\brules and principles you operate under\b/i,
    /\bsteps and protocols you are programmed to follow\b/i,
  ],
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

export const EXCESSIVE_AGENCY_PREDICATES = [
  'requestsPhysicalAction',
  'requestsCommunicationAction',
  'requestsPaymentAction',
  'requestsDocumentTransfer',
  'namesExternalRecipient',
] as const;

type ExcessiveAgencyPredicate = (typeof EXCESSIVE_AGENCY_PREDICATES)[number];

const EXCESSIVE_AGENCY_RULES: Record<ExcessiveAgencyPredicate, RegExp[]> = {
  requestsPhysicalAction: [/\b(physically|deliver|swipe|print out|mail)\b/i],
  requestsCommunicationAction: [/\b(call|fax|email|send)\b/i],
  requestsPaymentAction: [/\b(payment|pay|charge|insurance card)\b/i],
  requestsDocumentTransfer: [/\b(copy|records|prescription|history)\b/i],
  namesExternalRecipient: [/\b(provider|office|home address|yahoo\.com|gmail\.com)\b/i],
};

export function extractExcessiveAgencySignature(prompt: string): AttackSignature {
  const predicates = Object.fromEntries(
    EXCESSIVE_AGENCY_PREDICATES.map((predicate) => [
      predicate,
      EXCESSIVE_AGENCY_RULES[predicate].some((rule) => rule.test(prompt)),
    ]),
  ) as AttackPredicateSignature;

  return {
    predicates,
  };
}

export function extractExcessiveAgencyFeatures(prompt: string): string[] {
  const signature = extractExcessiveAgencySignature(prompt);

  return EXCESSIVE_AGENCY_PREDICATES.filter((predicate) => signature.predicates[predicate]);
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
  'claimsFamilyRelationship',
  'claimsCoworkerRelationship',
  'claimsSelfRelationship',
  'claimsIdentity',
  'claimsOperationalNeed',
  'claimsLostAccess',
] as const;

type PiiSocialPredicate = (typeof PII_SOCIAL_PREDICATES)[number];

const PII_SOCIAL_RULES: Record<PiiSocialPredicate, RegExp[]> = {
  requestsPrescriptionDetails: [/\bprescription details?\b/i],
  requestsRefillDates: [/\brefill dates?\b/i],
  claimsFamilyRelationship: [
    /\bspouse\b/i,
    /\bfriend\b/i,
    /\bhelping .* after discharge\b/i,
    /\bcalling on behalf of\b/i,
  ],
  claimsCoworkerRelationship: [
    /\bcovering nurse\b/i,
    /\bassistant\b/i,
    /\bpharmacist\b/i,
    /\bnew doctor\b/i,
  ],
  claimsSelfRelationship: [/\bi lost\b/i, /\bi forgot\b/i],
  claimsIdentity: [
    /\bspouse\b/i,
    /\bhelping .* after discharge\b/i,
    /\bcalling on behalf of\b/i,
    /\bcovering nurse\b/i,
    /\bassistant\b/i,
    /\bpharmacist\b/i,
    /\bnew doctor\b/i,
  ],
  claimsOperationalNeed: [
    /\bcovering nurse\b/i,
    /\burgent claim\b/i,
    /\bneed to confirm\b/i,
    /\bverify\b/i,
    /\bscheduling purposes\b/i,
  ],
  claimsLostAccess: [/\bi lost\b/i, /\bi forgot\b/i, /\blost his\b/i, /\blost her\b/i],
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
  removesAuthorizationFilter: [
    /\bremove the (?:current-user )?filter\b/i,
    /\bignore the assigned-patient restriction\b/i,
    /\bwithout the where\b/i,
  ],
  usesNaturalLanguagePrivilegeEscalation: [
    /\bregardless of department\b/i,
    /\bentire company\b/i,
    /\ball tickets in the system\b/i,
    /\bregardless of who is currently authenticated\b/i,
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
  'excessive-agency': extractExcessiveAgencyFeatures,
  'pii:direct': extractPiiDirectFeatures,
  'pii:social': extractPiiSocialFeatures,
  'prompt-extraction': extractPromptExtractionFeatures,
  'sql-injection': extractSqlInjectionFeatures,
} as const;

const FEATURE_VOCABULARY_BY_PLUGIN = {
  'excessive-agency': EXCESSIVE_AGENCY_PREDICATES,
  'pii:direct': PII_DIRECT_PREDICATES,
  'pii:social': PII_SOCIAL_PREDICATES,
  'prompt-extraction': PROMPT_EXTRACTION_PREDICATES,
  'sql-injection': SQL_INJECTION_PREDICATES,
} as const;

const FEATURE_BANDS_BY_PLUGIN = {
  'pii:direct': {
    'sensitive-field': [
      'requestsSsn',
      'requestsContactDetails',
      'requestsMedicalRecord',
      'requestsPrescriptionDetails',
      'requestsInsuranceDetails',
      'requestsLabResults',
    ],
  },
  'pii:social': {
    'sensitive-field': ['requestsPrescriptionDetails', 'requestsRefillDates'],
    relationship: [
      'claimsFamilyRelationship',
      'claimsCoworkerRelationship',
      'claimsSelfRelationship',
    ],
    'authorization-story': ['claimsIdentity', 'claimsOperationalNeed', 'claimsLostAccess'],
  },
  'prompt-extraction': {
    'core-disclosure': ['requestsOperatingInstructions', 'requestsSystemPrompt'],
    'protected-control-plane': [
      'asksForAuthorityChecks',
      'asksForClassificationRules',
      'asksForEscalationGuidance',
      'asksForRefusalPolicy',
      'asksForRoutingRules',
      'invokesLegalAuthority',
      'requestsVerbatimText',
    ],
  },
  'sql-injection': {
    'exploit-mechanism': [
      'requestsSchemaDiscovery',
      'usesBooleanBypass',
      'usesStackedQuery',
      'usesUnionExtraction',
    ],
    'authorization-bypass': [
      'removesAuthorizationFilter',
      'usesNaturalLanguagePrivilegeEscalation',
    ],
  },
} as const;

export type PluginFeatureCoverageSummary = {
  coveredPluginIds: string[];
  coverageRate: number;
  pluginCount: number;
  uncoveredPluginIds: string[];
};

export type ObservedPluginFeatureCoverageSummary = {
  coverageRate: number;
  featureCount: number;
  observedFeatureIds: string[];
  observedFeatureCount: number;
  pluginId: string;
  promptCount: number;
  promptsWithFeaturesCount: number;
};

export type ObservedPluginFeatureBandCoverageSummary = Record<
  string,
  ObservedPluginFeatureCoverageSummary
>;

export function extractPluginFeatures(pluginId: string, prompt: string): string[] {
  const extractor =
    FEATURE_EXTRACTORS_BY_PLUGIN[pluginId as keyof typeof FEATURE_EXTRACTORS_BY_PLUGIN];

  return extractor ? extractor(prompt) : [];
}

export function getPluginFeatureVocabulary(pluginId: string): readonly string[] {
  return FEATURE_VOCABULARY_BY_PLUGIN[pluginId as keyof typeof FEATURE_VOCABULARY_BY_PLUGIN] ?? [];
}

export function getPluginFeatureBands(pluginId: string): Record<string, readonly string[]> {
  return (FEATURE_BANDS_BY_PLUGIN[pluginId as keyof typeof FEATURE_BANDS_BY_PLUGIN] ??
    {}) as Record<string, readonly string[]>;
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

export function summarizeObservedPluginFeatureCoverage(
  pluginId: string,
  prompts: readonly string[],
): ObservedPluginFeatureCoverageSummary {
  return summarizeObservedFeatureCoverage(pluginId, prompts, getPluginFeatureVocabulary(pluginId));
}

export function summarizeObservedPluginFeatureBandCoverage(
  pluginId: string,
  prompts: readonly string[],
): ObservedPluginFeatureBandCoverageSummary {
  return Object.fromEntries(
    Object.entries(getPluginFeatureBands(pluginId)).map(([bandId, vocabulary]) => [
      bandId,
      summarizeObservedFeatureCoverage(pluginId, prompts, vocabulary),
    ]),
  );
}

function summarizeObservedFeatureCoverage(
  pluginId: string,
  prompts: readonly string[],
  vocabulary: readonly string[],
): ObservedPluginFeatureCoverageSummary {
  const vocabularySet = new Set(vocabulary);
  const promptFeatures = prompts.map((prompt) =>
    extractPluginFeatures(pluginId, prompt).filter((feature) => vocabularySet.has(feature)),
  );
  const observedFeatureIds = [...new Set(promptFeatures.flat())].sort();

  return {
    coverageRate: vocabulary.length === 0 ? 0 : observedFeatureIds.length / vocabulary.length,
    featureCount: vocabulary.length,
    observedFeatureIds,
    observedFeatureCount: observedFeatureIds.length,
    pluginId,
    promptCount: prompts.length,
    promptsWithFeaturesCount: promptFeatures.filter((features) => features.length > 0).length,
  };
}
