import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BedrockModelPricing,
  type BedrockPricingData,
  calculateCostWithFetchedPricing,
  getPricingData,
  mapBedrockModelIdToApiName,
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

import { GetProductsCommand, PricingClient } from '@aws-sdk/client-pricing';
import { getCache, isCacheEnabled } from '../../../src/cache';

const mockGetCache = vi.mocked(getCache);
const mockIsCacheEnabled = vi.mocked(isCacheEnabled);
const MockGetProductsCommand = vi.mocked(GetProductsCommand);
const MockPricingClient = vi.mocked(PricingClient);

describe('pricingFetcher', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    MockPricingClient.mockImplementation(
      () =>
        ({
          send: vi.fn(),
        }) as unknown as InstanceType<typeof PricingClient>,
    );
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

    it('should parse system inference-profile ARNs before mapping the model ID', () => {
      expect(
        mapBedrockModelIdToApiName(
          'arn:aws:bedrock:us-east-1::inference-profile/us.anthropic.claude-3-5-sonnet-20241022-v2:0',
        ),
      ).toBe('Claude 3.5 Sonnet v2');
    });

    it('should parse foundation-model ARNs before mapping the model ID', () => {
      expect(
        mapBedrockModelIdToApiName(
          'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0',
        ),
      ).toBe('Claude 3.5 Sonnet v2');
    });

    it('should leave application inference-profile ARNs opaque', () => {
      const profileArn =
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/claude-haiku-4-5-prod';

      expect(mapBedrockModelIdToApiName(profileArn)).toBe(profileArn);
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

    it('should map supported newer model IDs to current AWS pricing catalog names', () => {
      expect(mapBedrockModelIdToApiName('amazon.nova-2-lite-v1:0')).toBe('Nova 2.0 Lite');
      expect(mapBedrockModelIdToApiName('deepseek.v3-v1:0')).toBe('DeepSeek V3.1');
      expect(mapBedrockModelIdToApiName('deepseek.v3.2')).toBe('DeepSeek v3.2');
      expect(mapBedrockModelIdToApiName('us.anthropic.claude-sonnet-4-6')).toBe(
        'Claude Sonnet 4.6',
      );
      expect(mapBedrockModelIdToApiName('us.anthropic.claude-opus-4-1-20250805-v1:0')).toBe(
        'Claude Opus 4.1',
      );
      expect(mapBedrockModelIdToApiName('mistral.pixtral-large-2502-v1:0')).toBe(
        'Pixtral Large 25.02',
      );
      expect(mapBedrockModelIdToApiName('qwen.qwen3-coder-480b-a35b-v1:0')).toBe(
        'Qwen3 Coder 480B A35B',
      );
      expect(mapBedrockModelIdToApiName('qwen.qwen3-coder-30b-a3b-v1:0')).toBe(
        'Qwen3 Coder 30B A3B',
      );
      expect(mapBedrockModelIdToApiName('qwen.qwen3-235b-a22b-2507-v1:0')).toBe(
        'Qwen3 235B A22B 2507',
      );
    });
  });

  describe('calculateCostWithFetchedPricing', () => {
    const mockPricingData: BedrockPricingData = {
      models: new Map<string, BedrockModelPricing>([
        ['Claude 3.5 Sonnet v2', { input: 0.000003, output: 0.000015 }],
        ['Claude Opus 4.7', { input: 0.000005, output: 0.000025 }],
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

    it('should not infer pricing from application inference-profile ARN names', () => {
      const cost = calculateCostWithFetchedPricing(
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/claude-haiku-4-5-prod',
        null,
        10,
        5,
      );

      expect(cost).toBeUndefined();
    });

    it('should not substitute regional prices for global inference profiles', () => {
      const cost = calculateCostWithFetchedPricing(
        'global.anthropic.claude-opus-4-7',
        mockPricingData,
        10,
        5,
      );

      expect(cost).toBeUndefined();
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

    it('should calculate cost for foundation-model ARNs', () => {
      const cost = calculateCostWithFetchedPricing(
        'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0',
        mockPricingData,
        1000,
        500,
      );

      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('should not estimate costs when regional pricing data is unavailable', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
        null,
        1000,
        500,
      );

      expect(cost).toBeUndefined();
    });

    it('should return undefined when pricing data is null and no fallback exists', () => {
      const cost = calculateCostWithFetchedPricing('unknown.model-v1:0', null, 1000, 500);

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

    it('should not estimate costs for models absent from returned regional pricing', () => {
      const cost = calculateCostWithFetchedPricing(
        'anthropic.claude-opus-4-20250514-v1:0',
        mockPricingData,
        1000,
        500,
      );

      expect(cost).toBeUndefined();
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
      expect(result?.models.get('Nova Micro')?.input).toBeCloseTo(0.000000035);
      expect(result?.models.get('Nova Micro')?.output).toBeCloseTo(0.00000014);

      // Should not call the pricing API
      expect(MockPricingClient).not.toHaveBeenCalled();
    });

    it('should fetch from API when cache is expired', async () => {
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
                      pricePerUnit: { USD: '0.000035' },
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
                      pricePerUnit: { USD: '0.00014' },
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
      expect(result?.models.get('Nova Micro')?.input).toBeCloseTo(0.000000035);
      expect(result?.models.get('Nova Micro')?.output).toBeCloseTo(0.00000014);
      expect(MockPricingClient).toHaveBeenCalled();
    });

    it('should omit incomplete API pricing rows', async () => {
      const testRegion = 'eu-west-2';
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      mockGetCache.mockResolvedValue(mockCache as any);
      mockIsCacheEnabled.mockReturnValue(false);

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
                      pricePerUnit: { USD: '0.000035' },
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
      expect(result?.models.has('Nova Micro')).toBe(false);
    });

    it('should use only standard text-token rows when selecting model pricing', async () => {
      const testRegion = 'eu-central-1';
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      mockGetCache.mockResolvedValue(mockCache as any);
      mockIsCacheEnabled.mockReturnValue(false);

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
                      pricePerUnit: { USD: '0.000035' },
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
                inferenceType: 'Cache read input tokens',
                feature: 'On-demand Inference',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '0.0000035' },
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
                inferenceType: 'Input tokens priority',
                feature: 'On-demand Inference',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '0.35' },
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
                      pricePerUnit: { USD: '0.00014' },
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
                inferenceType: 'output tokens batch',
                feature: 'On-demand Inference',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '0.0000014' },
                    },
                  },
                },
              },
            },
          }),
          JSON.stringify({
            product: {
              attributes: {
                model: 'Nova 2.0 Pro',
                inferenceType: 'Text Input Token',
                feature: 'On-demand Inference',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '0.00015' },
                    },
                  },
                },
              },
            },
          }),
          JSON.stringify({
            product: {
              attributes: {
                model: 'Nova 2.0 Pro',
                inferenceType: 'Text output token',
                feature: 'On-demand Inference',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '0.0006' },
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

      expect(result?.models.get('Nova Micro')?.input).toBeCloseTo(0.000000035);
      expect(result?.models.get('Nova Micro')?.output).toBeCloseTo(0.00000014);
      expect(result?.models.get('Nova 2.0 Pro')?.input).toBeCloseTo(0.00000015);
      expect(result?.models.get('Nova 2.0 Pro')?.output).toBeCloseTo(0.0000006);
    });

    it('should parse standard million-token rows from the foundation-model pricing service', async () => {
      const testRegion = 'us-east-1';
      mockIsCacheEnabled.mockReturnValue(false);

      const mockSend = vi.fn().mockResolvedValue({
        PriceList: [
          JSON.stringify({
            product: {
              attributes: {
                servicename: 'Claude Sonnet 4.6 (Amazon Bedrock Edition)',
                usagetype: 'USE1-MP:USE1_InputTokenCount-Units',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '3.0000000000' },
                    },
                  },
                },
              },
            },
          }),
          JSON.stringify({
            product: {
              attributes: {
                servicename: 'Claude Sonnet 4.6 (Amazon Bedrock Edition)',
                usagetype: 'USE1-MP:USE1_OutputTokenCount-Units',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '15.0000000000' },
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

      expect(result?.models.get('Claude Sonnet 4.6')?.input).toBeCloseTo(0.000003);
      expect(result?.models.get('Claude Sonnet 4.6')?.output).toBeCloseTo(0.000015);
      expect(MockGetProductsCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ServiceCode: 'AmazonBedrockFoundationModels' }),
      );
    });

    it('should parse response-token output rows from the foundation-model pricing service', async () => {
      const testRegion = 'us-east-1';
      mockIsCacheEnabled.mockReturnValue(false);

      const mockSend = vi.fn().mockResolvedValue({
        PriceList: [
          JSON.stringify({
            product: {
              attributes: {
                servicename: 'Claude Sonnet 4.6 (Amazon Bedrock Edition)',
                usagetype: 'USE1-MP:USE1_InputTokenCount-Units',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      pricePerUnit: { USD: '3.0000000000' },
                    },
                  },
                },
              },
            },
          }),
          JSON.stringify({
            product: {
              attributes: {
                servicename: 'Claude Sonnet 4.6 (Amazon Bedrock Edition)',
                usagetype: 'USE1-MP:USE1_Usage-Units',
              },
            },
            terms: {
              OnDemand: {
                term1: {
                  priceDimensions: {
                    dim1: {
                      description: 'Million Response Tokens Global',
                      pricePerUnit: { USD: '15.0000000000' },
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

      expect(result?.models.get('Claude Sonnet 4.6')?.input).toBeCloseTo(0.000003);
      expect(result?.models.get('Claude Sonnet 4.6')?.output).toBeCloseTo(0.000015);
    });

    it('should return null when cache is disabled and API fails', async () => {
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
      expect(mockGetCache).not.toHaveBeenCalled();
    });

    it('should abort pricing API requests that exceed the timeout', async () => {
      vi.useFakeTimers();
      mockIsCacheEnabled.mockReturnValue(false);
      let abortSignal: AbortSignal | undefined;
      const mockSend = vi.fn((_command, options?: { abortSignal?: AbortSignal }) => {
        abortSignal = options?.abortSignal;
        return new Promise(() => undefined);
      });

      MockPricingClient.mockImplementation(function () {
        return {
          send: mockSend,
        };
      } as any);

      try {
        const resultPromise = getPricingData('us-east-1');
        await vi.advanceTimersByTimeAsync(0);
        expect(mockSend).toHaveBeenCalled();
        expect(abortSignal?.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(5_000);

        await expect(resultPromise).resolves.toBeNull();
        expect(abortSignal?.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not share an in-flight credential failure with a valid caller', async () => {
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      mockGetCache.mockResolvedValue(mockCache as any);
      mockIsCacheEnabled.mockReturnValue(false);

      const validResponse = {
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
                      pricePerUnit: { USD: '0.000035' },
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
                      pricePerUnit: { USD: '0.00014' },
                    },
                  },
                },
              },
            },
          }),
        ],
        NextToken: undefined,
      };

      let rejectInvalidFetch!: (error: Error) => void;
      let markInvalidFetchStarted!: () => void;
      const invalidFetchStarted = new Promise<void>((resolve) => {
        markInvalidFetchStarted = resolve;
      });

      MockPricingClient.mockImplementation(function (options: {
        credentials?: { accessKeyId?: string };
      }) {
        const credentials = options.credentials;
        return {
          send:
            credentials?.accessKeyId === 'invalid'
              ? vi.fn().mockImplementation(
                  () =>
                    new Promise((_, reject) => {
                      rejectInvalidFetch = reject;
                      markInvalidFetchStarted();
                    }),
                )
              : vi.fn().mockResolvedValue(validResponse),
        } as unknown as InstanceType<typeof PricingClient>;
      } as any);

      const invalidCredentials = { accessKeyId: 'invalid', secretAccessKey: 'invalid' };
      const validCredentials = { accessKeyId: 'valid', secretAccessKey: 'valid' };
      const failedPricingPromise = getPricingData('us-west-2', invalidCredentials);
      await invalidFetchStarted;
      const validPricingPromise = getPricingData('us-west-2', validCredentials);
      rejectInvalidFetch(new Error('Invalid credentials'));
      const [failedResult, validResult] = await Promise.all([
        failedPricingPromise,
        validPricingPromise,
      ]);

      expect(
        MockPricingClient.mock.calls.map(
          (call) =>
            (call[0] as { credentials?: { accessKeyId?: string } }).credentials?.accessKeyId,
        ),
      ).toEqual(expect.arrayContaining(['invalid', 'valid']));
      expect(failedResult).toBeNull();
      expect(validResult).not.toBeNull();
      expect(validResult?.models.get('Nova Micro')?.input).toBeCloseTo(0.000000035);
      expect(validResult?.models.get('Nova Micro')?.output).toBeCloseTo(0.00000014);
      expect(MockPricingClient).toHaveBeenCalledTimes(2);
    });
  });
});
