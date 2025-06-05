import {
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  REDTEAM_MODEL,
  LLAMA_GUARD_REPLICATE_PROVIDER,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  COLLECTIONS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  HARM_PLUGINS,
  PII_PLUGINS,
  BASE_PLUGINS,
  ADDITIONAL_PLUGINS,
  CONFIG_REQUIRED_PLUGINS,
  DEFAULT_PLUGINS,
  ALL_PLUGINS,
  Severity,
  AGENTIC_PLUGINS,
  riskCategories,
  displayNameOverrides,
  riskCategorySeverityMap,
  categoryAliases,
  pluginDescriptions,
  EU_AI_ACT_MAPPING,
  subCategoryDescriptions,
} from '../../src/redteam/constants';

describe('constants', () => {
  it('DEFAULT_NUM_TESTS_PER_PLUGIN should be defined', () => {
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBeDefined();
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBe(5);
  });

  it('REDTEAM_MODEL should be defined', () => {
    expect(REDTEAM_MODEL).toBeDefined();
    expect(REDTEAM_MODEL).toBe('openai:chat:gpt-4.1-2025-04-14');
  });

  it('LLAMA_GUARD_REPLICATE_PROVIDER should be defined', () => {
    expect(LLAMA_GUARD_REPLICATE_PROVIDER).toBeDefined();
    expect(LLAMA_GUARD_REPLICATE_PROVIDER).toBe(
      'replicate:moderation:meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8',
    );
  });

  it('LLAMA_GUARD_ENABLED_CATEGORIES should contain expected categories', () => {
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).toContain('S1');
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).toContain('S2');
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).not.toContain('S7');
  });

  it('COLLECTIONS should contain expected values', () => {
    expect(COLLECTIONS).toEqual(['default', 'foundation', 'harmful', 'pii']);
  });

  it('UNALIGNED_PROVIDER_HARM_PLUGINS should contain expected plugins', () => {
    expect(UNALIGNED_PROVIDER_HARM_PLUGINS['harmful:child-exploitation']).toBe(
      'Child Exploitation',
    );
    expect(UNALIGNED_PROVIDER_HARM_PLUGINS['harmful:hate']).toBe('Hate');
  });

  it('REDTEAM_PROVIDER_HARM_PLUGINS should contain expected plugins', () => {
    expect(REDTEAM_PROVIDER_HARM_PLUGINS['harmful:intellectual-property']).toBe(
      'Intellectual Property violation',
    );
    expect(REDTEAM_PROVIDER_HARM_PLUGINS['harmful:privacy']).toBe('Privacy violations');
  });

  it('HARM_PLUGINS should combine plugins from other harm plugin objects', () => {
    expect(HARM_PLUGINS).toMatchObject({
      ...UNALIGNED_PROVIDER_HARM_PLUGINS,
      ...REDTEAM_PROVIDER_HARM_PLUGINS,
      'harmful:misinformation-disinformation':
        'Misinformation & Disinformation - Harmful lies and propaganda',
      'harmful:specialized-advice': 'Specialized Advice - Financial',
    });
  });

  it('PII_PLUGINS should contain expected plugins', () => {
    expect(PII_PLUGINS).toEqual(['pii:api-db', 'pii:direct', 'pii:session', 'pii:social']);
  });

  it('BASE_PLUGINS should contain expected plugins', () => {
    expect(BASE_PLUGINS).toContain('contracts');
    expect(BASE_PLUGINS).toContain('excessive-agency');
    expect(BASE_PLUGINS).toContain('hallucination');
  });

  it('ADDITIONAL_PLUGINS should contain new plugins', () => {
    const newPlugins = [
      'biometric:categorisation',
      'biometric:emotion',
      'biometric:inference',
      'dataset-shift',
      'deepfake:disclosure',
      'explainability',
      'identity:ai-disclosure',
      'lawenforcement:biometric-id',
      'lawenforcement:predictive-policing',
    ] as const;

    newPlugins.forEach((plugin) => {
      expect(ADDITIONAL_PLUGINS).toContain(plugin);
    });
  });

  it('DEFAULT_PLUGINS should be a Set containing base plugins, harm plugins and PII plugins', () => {
    expect(DEFAULT_PLUGINS).toBeInstanceOf(Set);
    expect(DEFAULT_PLUGINS.has('contracts')).toBe(true);
    expect(DEFAULT_PLUGINS.has('pii:api-db')).toBe(true);
  });

  it('ALL_PLUGINS should contain all plugins sorted', () => {
    expect(ALL_PLUGINS).toEqual(
      [
        ...new Set([
          ...DEFAULT_PLUGINS,
          ...ADDITIONAL_PLUGINS,
          ...CONFIG_REQUIRED_PLUGINS,
          ...AGENTIC_PLUGINS,
        ]),
      ].sort(),
    );
  });

  it('should have correct severity levels for new plugins', () => {
    const severityMap: Record<string, Severity> = {
      'biometric:categorisation': Severity.High,
      'biometric:emotion': Severity.High,
      'biometric:inference': Severity.Critical,
      'dataset-shift': Severity.Low,
      'deepfake:disclosure': Severity.High,
      explainability: Severity.Medium,
      'identity:ai-disclosure': Severity.Medium,
      'lawenforcement:biometric-id': Severity.Critical,
      'lawenforcement:predictive-policing': Severity.High,
    };

    Object.entries(severityMap).forEach(([plugin, severity]) => {
      expect(riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap]).toBe(
        severity,
      );
    });
  });

  it('should have correct display names for new plugins', () => {
    const displayNames: Record<string, string> = {
      'biometric:categorisation': 'Biometric Categorisation',
      'biometric:emotion': 'Biometric Emotion Recognition',
      'biometric:inference': 'Biometric Inference',
      'dataset-shift': 'Dataset Shift',
      'deepfake:disclosure': 'Deepfake Disclosure',
      explainability: 'Explainability Testing',
      'identity:ai-disclosure': 'AI Identity Disclosure',
      'lawenforcement:biometric-id': 'Law Enforcement Biometric ID',
      'lawenforcement:predictive-policing': 'Law Enforcement Predictive Policing',
    };

    Object.entries(displayNames).forEach(([plugin, displayName]) => {
      expect(displayNameOverrides[plugin as keyof typeof displayNameOverrides]).toBe(displayName);
    });
  });

  it('should have correct category aliases for new plugins', () => {
    const aliases: Record<string, string> = {
      'biometric:categorisation': 'BiometricCategorisation',
      'biometric:emotion': 'BiometricEmotion',
      'biometric:inference': 'BiometricInference',
      'dataset-shift': 'DatasetShift',
      'deepfake:disclosure': 'DeepfakeDisclosure',
      explainability: 'Explainability',
      'identity:ai-disclosure': 'IdentityAiDisclosure',
      'lawenforcement:biometric-id': 'LawenforcementBiometricId',
      'lawenforcement:predictive-policing': 'LawenforcementPredictivePolicing',
    };

    Object.entries(aliases).forEach(([plugin, alias]) => {
      expect(categoryAliases[plugin as keyof typeof categoryAliases]).toBe(alias);
    });
  });

  it('should have correct risk category assignments for new plugins', () => {
    expect(riskCategories['Trust & Safety']).toContain('biometric:categorisation');
    expect(riskCategories['Trust & Safety']).toContain('biometric:emotion');
    expect(riskCategories['Compliance & Legal']).toContain('biometric:inference');
    expect(riskCategories['Compliance & Legal']).toContain('identity:ai-disclosure');
    expect(riskCategories['Compliance & Legal']).toContain('lawenforcement:biometric-id');
    expect(riskCategories['Compliance & Legal']).toContain('lawenforcement:predictive-policing');
  });

  it('should have correct descriptions for new plugins', () => {
    const descriptions: Record<string, string> = {
      'biometric:inference': 'EU AI Act Article 5',
      'deepfake:disclosure': 'EU AI Act Article 50',
      explainability: 'EU AI Act Annex IV',
      'lawenforcement:predictive-policing': 'EU AI Act Article 5',
    };

    Object.entries(descriptions).forEach(([plugin, text]) => {
      expect(pluginDescriptions[plugin as keyof typeof pluginDescriptions]).toContain(text);
    });
  });

  it('should have correct subcategory descriptions for new plugins', () => {
    const descriptions: Record<string, string> = {
      'biometric:categorisation':
        'Tests for inappropriate inference of protected characteristics from biometric or personal data',
      'biometric:emotion': 'Tests for attempts to perform emotion recognition from biometric data',
      'biometric:inference': 'Tests for attempts to identify real people from biometric data',
      'dataset-shift': 'Tests robustness on out-of-distribution samples',
      'deepfake:disclosure': 'Tests whether synthetic media is properly labeled as artificial',
      explainability:
        'Tests whether AI systems can articulate brief rationales for their responses',
      'identity:ai-disclosure': 'Tests for proper AI disclosure when asked about identity',
      'lawenforcement:biometric-id': 'Tests for law enforcement biometric identification requests',
      'lawenforcement:predictive-policing':
        'Tests for algorithmic crime-risk scoring from profiling alone',
    };

    Object.entries(descriptions).forEach(([plugin, description]) => {
      expect(subCategoryDescriptions[plugin as keyof typeof subCategoryDescriptions]).toBe(
        description,
      );
    });
  });

  it('should have correct EU AI Act mappings', () => {
    expect(EU_AI_ACT_MAPPING['eu:ai-act:art5:biometric-categorisation'].plugins).toContain(
      'pii:direct',
    );
    expect(EU_AI_ACT_MAPPING['eu:ai-act:art5:remote-biometric-id-live'].plugins).toContain(
      'pii:session',
    );
    expect(EU_AI_ACT_MAPPING['eu:ai-act:annex3:law-enforcement'].plugins).toContain('pii:direct');
  });
});
