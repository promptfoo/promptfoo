import { describe, expect, it } from 'vitest';
import { hasSpecificDocumentation } from './providerDocumentationMap';

describe('hasSpecificDocumentation', () => {
  it.each([
    { providerType: 'openai', description: 'a common foundation model provider' },
    { providerType: 'go', description: 'a newly added code-based provider' },
    { providerType: 'http', description: 'an API endpoint provider' },
    { providerType: 'custom', description: 'a provider with a general documentation page' },
    { providerType: 'aws-bedrock', description: 'a provider with an alias in the map' },
  ])(
    'should return true when providerType ($description) is a key in the documentation map',
    ({ providerType }) => {
      const result = hasSpecificDocumentation(providerType);

      expect(result).toBe(true);
    },
  );

  it.each([
    { providerType: undefined, description: 'undefined' },
    { providerType: '', description: 'an empty string' },
  ])('should return false when providerType is $description', ({ providerType }) => {
    const result = hasSpecificDocumentation(providerType);

    expect(result).toBe(false);
  });

  it('should return false when providerType is not a key in PROVIDER_DOCUMENTATION_MAP', () => {
    const providerType = 'notarealprovider';

    const result = hasSpecificDocumentation(providerType);

    expect(result).toBe(false);
  });

  it('should return false when providerType contains a colon and is not a direct key in the documentation map', () => {
    const providerType = 'openai:gpt-4';

    const result = hasSpecificDocumentation(providerType);

    expect(result).toBe(false);
  });
});
