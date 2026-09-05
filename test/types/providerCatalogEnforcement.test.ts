import { describe, expect, it } from 'vitest';
import {
  reconcileProvidersWithCatalog,
  validateProviderCatalogConfig,
} from '../../src/types/providerCatalogEnforcement';

import type { ProviderOptions } from '../../src/types/providers';

const approvedProviders: ProviderOptions[] = [
  { id: 'openai:chat:approved', label: 'approved-chat', config: { temperature: 0 } },
  { id: 'echo' },
];

function configWith(override: Record<string, unknown>) {
  return { providers: approvedProviders, tests: [], ...override };
}

describe('provider catalog enforcement', () => {
  it.each([
    ['tests', { tests: [{ providers: ['openai:chat:approved'] }] }],
    ['defaultTest', { defaultTest: { providers: ['approved-chat'] } }],
    [
      'scenario config and tests',
      {
        scenarios: [
          {
            config: [{ providers: ['openai:*'] }],
            tests: [{ providers: ['echo'] }],
          },
        ],
      },
    ],
  ])('allows approved provider filters in %s', (_name, override) => {
    expect(validateProviderCatalogConfig(configWith(override), approvedProviders)).toEqual({
      success: true,
    });
  });

  it('rejects provider filters that do not reference an approved top-level provider', () => {
    expect(
      validateProviderCatalogConfig(
        configWith({ tests: [{ providers: ['anthropic:unapproved'] }] }),
        approvedProviders,
      ),
    ).toEqual({
      success: false,
      error:
        'Evaluation configuration contains provider overrides outside the administrator catalog',
    });
  });

  it('rejects executable extensions while a custom catalog is active', () => {
    expect(
      validateProviderCatalogConfig(
        configWith({ extensions: ['file://extension.py:beforeAll'] }),
        approvedProviders,
      ),
    ).toEqual({
      success: false,
      error:
        'Evaluation configuration contains provider overrides outside the administrator catalog',
    });
  });

  it.each(['llm-rubric', 'not-factuality', 'pi', 'trajectory:goal-success'])(
    'rejects implicit grading for %s assertions',
    (type) => {
      expect(
        validateProviderCatalogConfig(
          configWith({ tests: [{ assert: [{ type, value: 'rubric' }] }] }),
          approvedProviders,
        ),
      ).toEqual({
        success: false,
        error:
          'Evaluation configuration contains provider overrides outside the administrator catalog',
      });
    },
  );

  it('rejects implicit grading inside nested assertion sets', () => {
    expect(
      validateProviderCatalogConfig(
        configWith({
          tests: [
            {
              assert: [
                {
                  type: 'assert-set',
                  assert: [{ type: 'llm-rubric', value: 'rubric' }],
                },
              ],
            },
          ],
        }),
        approvedProviders,
      ),
    ).toEqual({
      success: false,
      error:
        'Evaluation configuration contains provider overrides outside the administrator catalog',
    });
  });

  it('allows assertions that do not invoke an implicit provider', () => {
    expect(
      validateProviderCatalogConfig(
        configWith({ tests: [{ assert: [{ type: 'contains', value: 'expected' }] }] }),
        approvedProviders,
      ),
    ).toEqual({ success: true });
  });

  it('rejects prompt suggestion generation that uses the default suggestions provider', () => {
    expect(
      validateProviderCatalogConfig(
        configWith({ evaluateOptions: { generateSuggestions: true } }),
        approvedProviders,
      ),
    ).toEqual({
      success: false,
      error:
        'Evaluation configuration contains provider overrides outside the administrator catalog',
    });
  });

  it('allows evaluate options that do not invoke an implicit provider', () => {
    expect(
      validateProviderCatalogConfig(
        configWith({ evaluateOptions: { generateSuggestions: false, maxConcurrency: 2 } }),
        approvedProviders,
      ),
    ).toEqual({ success: true });
  });

  it('rejects all non-empty suite env because providers may consume implicit env keys', () => {
    expect(
      validateProviderCatalogConfig(
        configWith({ env: { OPENAI_BASE_URL: 'https://redirected.example.test' } }),
        approvedProviders,
      ),
    ).toEqual({
      success: false,
      error:
        'Evaluation configuration contains provider overrides outside the administrator catalog',
    });
    expect(
      validateProviderCatalogConfig(
        configWith({ env: { NON_PROVIDER_VALUE: 'value' } }),
        approvedProviders,
      ),
    ).toEqual({
      success: false,
      error:
        'Evaluation configuration contains provider overrides outside the administrator catalog',
    });
  });

  it('allows an explicitly empty suite env', () => {
    expect(validateProviderCatalogConfig(configWith({ env: {} }), approvedProviders)).toEqual({
      success: true,
    });
  });

  it('compares catalog providers in their JSON wire form', () => {
    const availableProviders = [
      {
        id: 'http://gateway.example.test',
        config: { releaseDate: new Date('2026-09-01T00:00:00.000Z'), omitted: undefined },
      },
    ] as ProviderOptions[];
    const submittedProviders = [
      {
        id: 'http://gateway.example.test',
        config: { releaseDate: '2026-09-01T00:00:00.000Z' },
      },
    ];

    expect(
      validateProviderCatalogConfig(
        { providers: submittedProviders, tests: [] },
        availableProviders,
      ),
    ).toEqual({ success: true });
  });

  it('reconciles submitted providers to canonical catalog entries and drops unknown providers', () => {
    const canonicalProvider = approvedProviders[0];

    expect(
      reconcileProvidersWithCatalog(
        [{ ...canonicalProvider, config: { temperature: 1 } }, { id: 'unknown' }],
        approvedProviders,
      ),
    ).toEqual({
      providers: [canonicalProvider],
      isReconciled: false,
    });

    expect(reconcileProvidersWithCatalog([canonicalProvider], approvedProviders)).toEqual({
      providers: [canonicalProvider],
      isReconciled: true,
    });
  });
});
