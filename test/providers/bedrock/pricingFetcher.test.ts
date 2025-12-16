import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mapBedrockModelIdToApiName,
  getPricingData,
  calculateCostWithFetchedPricing,
  type BedrockPricingData,
  type BedrockModelPricing,
} from '../../../src/providers/bedrock/pricingFetcher';

// Mock the cache module
vi.mock('../../../src/cache', () => ({
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

// Mock the logger
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the AWS Pricing client
vi.mock('@aws-sdk/client-pricing', () => ({
  PricingClient: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  GetProductsCommand: vi.fn(),
}));

import { getCache, isCacheEnabled } from '../../../src/cache';
import { PricingClient } from '@aws-sdk/client-pricing';

const mockGetCache = vi.mocked(getCache);
const mockIsCacheEnabled = vi.mocked(isCacheEnabled);
const MockPricingClient = vi.mocked(PricingClient);

describe('pricingFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mapBedrockModelIdToApiName', () => {
    it('should map Claude 3.5 Sonnet v2 model ID to API name', () => {
      expect(mapBedrockModelIdToApiName('anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe(
        'Claude 3.5 Sonnet v2',
      );
    });

    it('should map Claude 3.5 Haiku model ID to API name', () => {
      expect(mapBedrockModelIdToApiName('anthropic.claude-3-5-haiku-20241022-v1:0')).toBe(
        'Claude 3.5 Haiku',
      );
    });

    it('should map Amazon Nova Micro model ID to API name', () => {
      expect(mapBedrockModelIdToApiName('amazon.nova-micro-v1:0')).toBe('Nova Micro');
    });

    it('should map Llama 3.1 405B model ID to API name', () => {
      expect(mapBedrockModelIdToApiName('meta.llama3-1-405b-instruct-v1:0')).toBe(
        'Llama 3.1 405B Instruct',
      );
    });

    it('should strip US region prefix from model ID', () => {
      expect(mapBedrockModelIdToApiName('us.anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe(
        'Claude 3.5 Sonnet v2',
      );
    });

    it('should strip EU region prefix from model ID', () => {
      expect(mapBedrockModelIdToApiName('eu.anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe(
        'Claude 3.5 Sonnet v2',
      );
    });

    it('should strip APAC region prefix from model ID', () => {
      expect(mapBedrockModelIdToApiName('apac.amazon.nova-pro-v1:0')).toBe('Nova Pro');
    });

    it('should strip US-GOV region prefix from model ID', () => {
      expect(mapBedrockModelIdToApiName('us-gov.anthropic.claude-3-haiku-20240307-v1:0')).toBe(
        'Claude 3 Haiku',
      );
    });

    it('should strip version suffix from model ID', () => {
      expect(mapBedrockModelIdToApiName('amazon.nova-lite-v1:0')).toBe('Nova Lite');
      expect(mapBedrockModelIdToApiName('amazon.nova-lite-v1:1')).toBe('Nova Lite');
      expect(mapBedrockModelIdToApiName('amazon.nova-lite-v1:2')).toBe('Nova Lite');
    });

    it('should return base ID for unknown models', () => {
      expect(mapBedrockModelIdToApiName('unknown.model-v1:0')).toBe('unknown.model-v1');
    });

    it('should map Mistral models correctly', () => {
      expect(mapBedrockModelIdToApiName('mistral.mistral-large-2407-v1:0')).toBe(
        'Mistral Large 2407',
      );
    });

    it('should map Cohere models correctly', () => {
      expect(mapBedrockModelIdToApiName('cohere.command-r-plus-v1:0')).toBe('Command R+');
    });

    it('should map DeepSeek R1 model correctly', () => {
      expect(mapBedrockModelIdToApiName('deepseek.r1-v1:0')).toBe('R1');
    });
  });

  describe('calculateCostWithFetchedPricing', () => {
    const mockPricingData: BedrockPricingData = {
      models: new Map<string, BedrockModelPricing>([
        ['Claude 3.5 Sonnet v2', { input: 0.000003, output: 0.000015 }],
        ['Nova Micro', { input: 0.000000035, output: 0.00000014 }],
      ]),
      region: 'us-east-1',
      fetchedAt: new Date(),
    };

    it('should calculate cost correctly with fetched pricing', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        mockPricingData,
        1000, // prompt tokens
        500, // completion tokens
      );

      // Expected: 1000 * 0.000003 + 500 * 0.000015 = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('should calculate cost for Nova Micro correctly', () => {
      const cost = calculateCostWithFetchedPricing(
        'amazon.nova-micro-v1:0',
        mockPricingData,
        10000,
        5000,
      );

      // Expected: 10000 * 0.000000035 + 5000 * 0.00000014 = 0.00035 + 0.0007 = 0.00105
      expect(cost).toBeCloseTo(0.00105, 6);
    });

    it('should return undefined when pricing data is null', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        null,
        1000,
        500,
      );

      expect(cost).toBeUndefined();
    });

    it('should return undefined when prompt tokens are undefined', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        mockPricingData,
        undefined,
        500,
      );

      expect(cost).toBeUndefined();
    });

    it('should return undefined when completion tokens are undefined', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        mockPricingData,
        1000,
        undefined,
      );

      expect(cost).toBeUndefined();
    });

    it('should use fallback pricing for Claude 4 models not in API', () => {
      // Claude 4 models may not be in the pricing API yet
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-opus-4-20250514-v1:0',
        mockPricingData,
        1000,
        500,
      );

      // Should use fallback pricing for claude-opus-4
      // Fallback: input: 0.000015, output: 0.000075
      // Expected: 1000 * 0.000015 + 500 * 0.000075 = 0.015 + 0.0375 = 0.0525
      expect(cost).toBeCloseTo(0.0525, 6);
    });

    it('should use fallback pricing for DeepSeek v3', () => {
      const cost = calculateCostWithFetchedPricing(
        'deepseek.v3-v1:0',
        mockPricingData,
        10000,
        5000,
      );

      // Fallback: input: 0.0000006, output: 0.000002
      // Expected: 10000 * 0.0000006 + 5000 * 0.000002 = 0.006 + 0.01 = 0.016
      expect(cost).toBeCloseTo(0.016, 6);
    });

    it('should return undefined for completely unknown models', () => {
      const cost = calculateCostWithFetchedPricing(
        'completely.unknown-model-v1:0',
        mockPricingData,
        1000,
        500,
      );

      expect(cost).toBeUndefined();
    });

    it('should handle region prefixes in fallback lookup', () => {
      const cost = calculateCostWithFetchedPricing(
        'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        mockPricingData,
        1000,
        500,
      );

      // Should use fallback pricing for claude-sonnet-4-5
      // Fallback: input: 0.000003, output: 0.000015
      // Expected: 1000 * 0.000003 + 500 * 0.000015 = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('should handle us-gov region prefix in fallback lookup', () => {
      const cost = calculateCostWithFetchedPricing(
        'us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0',
        mockPricingData,
        1000,
        500,
      );

      // Should strip us-gov prefix and use fallback pricing for claude-sonnet-4-5
      // Fallback: input: 0.000003, output: 0.000015
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('should return undefined for negative prompt tokens', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        mockPricingData,
        -100,
        500,
      );

      expect(cost).toBeUndefined();
    });

    it('should return undefined for negative completion tokens', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        mockPricingData,
        1000,
        -500,
      );

      expect(cost).toBeUndefined();
    });

    it('should return undefined for Infinity token values', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        mockPricingData,
        Infinity,
        500,
      );

      expect(cost).toBeUndefined();
    });
  });

  describe('getPricingData', () => {
    it('should return cached data if cache is valid', async () => {
      const cachedData = {
        models: [['Nova Micro', { input: 0.000000035, output: 0.00000014 }]],
        region: 'us-east-1',
        fetchedAt: new Date().toISOString(), // Recent timestamp
      };

      const mockCache = {
        get: vi.fn().mockResolvedValue(JSON.stringify(cachedData)),
        set: vi.fn(),
      };

      mockGetCache.mockResolvedValue(mockCache as any);
      mockIsCacheEnabled.mockReturnValue(true);

      const result = await getPricingData('us-east-1');

      expect(result).not.toBeNull();
      expect(result?.region).toBe('us-east-1');
      expect(result?.models.get('Nova Micro')).toEqual({
        input: 0.000000035,
        output: 0.00000014,
      });

      // Should not call the pricing API
      expect(MockPricingClient).not.toHaveBeenCalled();
    });

    it('should fetch from API when cache is expired', async () => {
      // Use a unique region to avoid module-level cache interference
      const testRegion = 'eu-west-1';

      // Cache data from 5 hours ago (beyond 4-hour TTL)
      const expiredDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const cachedData = {
        models: [['Nova Micro', { input: 0.000000035, output: 0.00000014 }]],
        region: testRegion,
        fetchedAt: expiredDate.toISOString(),
      };

      const mockCache = {
        get: vi.fn().mockResolvedValue(JSON.stringify(cachedData)),
        set: vi.fn(),
      };

      mockGetCache.mockResolvedValue(mockCache as any);
      mockIsCacheEnabled.mockReturnValue(true);

      // Mock API response with both input and output pricing
      const mockSend = vi.fn().mockResolvedValue({
        PriceList: [
          JSON.stringify({
            product: {
              attributes: {
                model: 'Nova Micro',
                inferenceType: 'Input tokens',
                feature: 'On-demand Inference',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '0.035' },
                    },
                  },
                },
              },
            },
          }),
          JSON.stringify({
            product: {
              attributes: {
                model: 'Nova Micro',
                inferenceType: 'Output tokens',
                feature: 'On-demand Inference',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '0.14' },
                    },
                  },
                },
              },
            },
          }),
        ],
        NextToken: undefined,
      });

      MockPricingClient.mockImplementation(function () {
        return {
          send: mockSend,
        };
      } as any);

      const result = await getPricingData(testRegion);

      expect(result).not.toBeNull();
      expect(MockPricingClient).toHaveBeenCalled();
    });

    it('should return null when cache is disabled and API fails', async () => {
      // Use a unique region to avoid module-level cache interference
      const testRegion = 'ap-southeast-1';

      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      mockGetCache.mockResolvedValue(mockCache as any);
      mockIsCacheEnabled.mockReturnValue(false);

      // Mock API failure
      const mockSend = vi.fn().mockRejectedValue(new Error('API Error'));

      MockPricingClient.mockImplementation(function () {
        return {
          send: mockSend,
        };
      } as any);

      const result = await getPricingData(testRegion);

      expect(result).toBeNull();
    });

    it('should handle concurrent requests to same region', async () => {
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      mockGetCache.mockResolvedValue(mockCache as any);
      mockIsCacheEnabled.mockReturnValue(true);

      // Mock API response with a delay
      const mockSend = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                PriceList: [
                  JSON.stringify({
                    product: {
                      attributes: {
                        model: 'Nova Micro',
                        inferenceType: 'Input tokens',
                        feature: 'On-demand Inference',
                      },
                    },
                    terms: {
                      OnDemand: {
                        term1: {
                          priceDimensions: {
                            dim1: {
                              pricePerUnit: { USD: '0.035' },
                            },
                          },
                        },
                      },
                    },
                  }),
                ],
                NextToken: undefined,
              });
            }, 50);
          }),
      );

      MockPricingClient.mockImplementation(function () {
        return {
          send: mockSend,
        };
      } as any);

      // Make concurrent requests
      const promise1 = getPricingData('us-west-2');
      const promise2 = getPricingData('us-west-2');
      const promise3 = getPricingData('us-west-2');

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      // All results should be the same
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);

      // API should only be called once due to deduplication
      // (PricingClient is instantiated once per concurrent batch)
      expect(MockPricingClient).toHaveBeenCalledTimes(1);
    });
  });
});
