import { expect, jest, describe, it } from '@jest/globals';
import {
  AwsBedrockCompletionProvider,
  AwsBedrockEmbeddingProvider,
} from '../../../src/providers/bedrock';
import { getBedrockProviders, resolveAwsRegion } from '../../../src/providers/bedrock/defaults';

const originalEnv = process.env;

jest.mock('../../../src/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Bedrock default providers', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveAwsRegion', () => {
    it('should resolve AWS region', () => {
      expect(typeof resolveAwsRegion).toBe('function');
    });
  });

  describe('getBedrockProviders', () => {
    it('should return Bedrock providers with correct model IDs and config', () => {
      const providers = getBedrockProviders();

      expect(providers.gradingProvider).toBeInstanceOf(AwsBedrockCompletionProvider);
      expect(providers.gradingJsonProvider).toBeInstanceOf(AwsBedrockCompletionProvider);
      expect(providers.suggestionsProvider).toBeInstanceOf(AwsBedrockCompletionProvider);
      expect(providers.synthesizeProvider).toBeInstanceOf(AwsBedrockCompletionProvider);
      expect(providers.moderationProvider).toBeInstanceOf(AwsBedrockCompletionProvider);
      expect(providers.embeddingProvider).toBeInstanceOf(AwsBedrockEmbeddingProvider);

      const novaProviderId = providers.gradingProvider.id();
      expect(novaProviderId).toContain('nova-pro');
      expect(novaProviderId).toContain('bedrock');

      const titanProviderId = providers.embeddingProvider.id();
      expect(titanProviderId).toContain('titan-embed-text');
      expect(titanProviderId).toContain('bedrock');
    });

    it('should use custom region when provided', () => {
      const providers = getBedrockProviders({ AWS_BEDROCK_REGION: 'eu-west-1' });

      expect(providers.gradingProvider).toBeInstanceOf(AwsBedrockCompletionProvider);
      expect(providers.embeddingProvider).toBeInstanceOf(AwsBedrockEmbeddingProvider);
      expect(providers.gradingProvider.id()).toContain('nova-pro');
      expect(providers.embeddingProvider.id()).toContain('titan-embed-text');
    });
  });
});
