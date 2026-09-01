import { describe, expect, it } from 'vitest';
import { validateProviderCatalogConfig } from '../../src/types/providerCatalogEnforcement';

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
});
