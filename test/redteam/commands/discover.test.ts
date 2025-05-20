import { randomUUID } from 'crypto';
import { fetchWithProxy } from '../../../src/fetch';
import { getUserEmail } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import {
  ArgsSchema,
  DiscoveredPurposeSchema,
  TargetPurposeDiscoveryRequestSchema,
  TargetPurposeDiscoveryResponseSchema,
  TargetPurposeDiscoveryStateSchema,
  doTargetPurposeDiscovery,
  mergePurposes,
} from '../../../src/redteam/commands/discover';

jest.mock('../../../src/fetch');
jest.mock('../../../src/logger');
jest.mock('../../../src/globalConfig/accounts');
jest.mock('crypto');

describe('ArgsSchema', () => {
  it('`config` and `target` are mutually exclusive', () => {
    const args = {
      config: 'test',
      target: 'test',
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Cannot specify both config and target!');
  });

  it('Either `config` or `target` must be provided', () => {
    const args = {};

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Either config or target must be provided!');
  });
});

describe('Schema Validations', () => {
  describe('TargetPurposeDiscoveryStateSchema', () => {
    it('validates valid state', () => {
      const state = {
        currentQuestionIndex: 0,
        answers: ['answer1', 'answer2'],
      };

      const result = TargetPurposeDiscoveryStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });

    it('fails on invalid state', () => {
      const state = {
        currentQuestionIndex: 'not a number',
        answers: 'not an array',
      };

      const result = TargetPurposeDiscoveryStateSchema.safeParse(state);
      expect(result.success).toBe(false);
    });
  });

  describe('TargetPurposeDiscoveryRequestSchema', () => {
    it('validates valid request', () => {
      const request = {
        state: {
          currentQuestionIndex: 0,
          answers: ['answer1'],
        },
        task: 'target-purpose-discovery',
        version: '1.0.0',
        email: 'test@example.com',
      };

      const result = TargetPurposeDiscoveryRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('fails on invalid request', () => {
      const request = {
        state: {
          currentQuestionIndex: 0,
          answers: ['answer1'],
        },
        task: 'invalid-task',
        version: 123,
        email: null,
      };

      const result = TargetPurposeDiscoveryRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('DiscoveredPurposeSchema', () => {
    it('validates valid discovered purpose', () => {
      const purpose = {
        purpose: 'test purpose',
        limitations: 'test limitations',
        tools: [{ name: 'tool1' }],
      };

      const result = DiscoveredPurposeSchema.safeParse(purpose);
      expect(result.success).toBe(true);
    });

    it('fails on invalid discovered purpose', () => {
      const purpose = {
        purpose: 123,
        limitations: [],
        tools: 'not an array',
      };

      const result = DiscoveredPurposeSchema.safeParse(purpose);
      expect(result.success).toBe(false);
    });
  });

  describe('TargetPurposeDiscoveryResponseSchema', () => {
    it('validates valid response', () => {
      const response = {
        done: true,
        purpose: {
          purpose: 'test',
          limitations: 'test',
          tools: [],
        },
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      };

      const result = TargetPurposeDiscoveryResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('validates response with optional fields', () => {
      const response = {
        done: false,
        question: 'test question',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      };

      const result = TargetPurposeDiscoveryResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });
});

describe('doTargetPurposeDiscovery', () => {
  const mockTarget = {
    id: () => 'test-target',
    callApi: jest.fn(),
  };

  const mockUUID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(randomUUID).mockReturnValue(mockUUID);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');
    mockTarget.callApi.mockResolvedValue({ output: 'test response' });
  });

  it('handles successful discovery', async () => {
    const mockResponse = new Response(
      JSON.stringify({
        done: true,
        purpose: {
          purpose: 'test purpose',
          limitations: 'test limitations',
          tools: [],
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['answer1'],
        },
      }),
    );
    jest.mocked(fetchWithProxy).mockResolvedValue(mockResponse);

    const result = await doTargetPurposeDiscovery(mockTarget);
    expect(result).toEqual({
      purpose: 'test purpose',
      limitations: 'test limitations',
      tools: [],
    });
  });

  it('handles questioning flow', async () => {
    const questionResponse = new Response(
      JSON.stringify({
        done: false,
        question: 'test question',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      }),
    );

    const finalResponse = new Response(
      JSON.stringify({
        done: true,
        purpose: {
          purpose: 'test purpose',
          limitations: 'test limitations',
          tools: [],
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['test response'],
        },
      }),
    );

    jest
      .mocked(fetchWithProxy)
      .mockResolvedValueOnce(questionResponse)
      .mockResolvedValueOnce(finalResponse);

    const result = await doTargetPurposeDiscovery(mockTarget);

    expect(mockTarget.callApi).toHaveBeenCalledWith('test question', {
      prompt: { raw: 'test question', label: 'Target Purpose Discovery Question' },
      vars: { sessionId: mockUUID },
    });

    expect(result).toEqual({
      purpose: 'test purpose',
      limitations: 'test limitations',
      tools: [],
    });
  });

  it('handles target error response and retries', async () => {
    const errorResponse = { error: 'test error', output: '' };
    mockTarget.callApi.mockResolvedValueOnce(errorResponse);

    const questionResponse = new Response(
      JSON.stringify({
        done: false,
        question: 'test question',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      }),
    );

    const finalResponse = new Response(
      JSON.stringify({
        done: true,
        purpose: {
          purpose: 'test purpose',
          limitations: 'test limitations',
          tools: [],
        },
        state: {
          currentQuestionIndex: 1,
          answers: [],
        },
      }),
    );

    jest
      .mocked(fetchWithProxy)
      .mockResolvedValueOnce(questionResponse)
      .mockResolvedValueOnce(finalResponse);

    const result = await doTargetPurposeDiscovery(mockTarget);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('test error'));
    expect(result).toEqual({
      purpose: 'test purpose',
      limitations: 'test limitations',
      tools: [],
    });
  });

  it('gives up after max retries', async () => {
    const errorResponse = { ok: false, text: () => Promise.resolve('Error') };
    jest.mocked(fetchWithProxy).mockResolvedValue(errorResponse as Response);

    const result = await doTargetPurposeDiscovery(mockTarget);
    expect(result).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Too many retries'));
  });
});

describe('mergePurposes', () => {
  it('merges human-defined and discovered purposes with proper formatting', () => {
    const humanDefined = 'This is a human defined purpose';
    const discovered = {
      purpose: 'This is a discovered purpose',
      limitations: 'These are limitations',
      tools: [{ name: 'tool1' }],
    };

    const result = mergePurposes(humanDefined, discovered);

    expect(result).toContain('<HumanDefinedPurpose>');
    expect(result).toContain('</HumanDefinedPurpose>');
    expect(result).toContain('<AgentDiscoveredPurpose>');
    expect(result).toContain('</AgentDiscoveredPurpose>');
    expect(result).toContain(humanDefined);
    expect(result).toContain(discovered.purpose);
    expect(result).toContain(discovered.limitations);
    expect(result).toContain(JSON.stringify(discovered.tools, null, 2));
  });

  it('handles undefined human-defined purpose', () => {
    const discovered = {
      purpose: 'test purpose',
      limitations: 'test limitations',
      tools: [{ name: 'tool1' }],
    };

    const result = mergePurposes(undefined, discovered);
    expect(result).not.toContain('<HumanDefinedPurpose>');
    expect(result).toContain('<AgentDiscoveredPurpose>');
    expect(result).toContain(discovered.purpose);
  });

  it('handles undefined discovered purpose', () => {
    const humanDefined = 'test purpose';
    const result = mergePurposes(humanDefined, undefined);
    expect(result).toContain('<HumanDefinedPurpose>');
    expect(result).not.toContain('<AgentDiscoveredPurpose>');
    expect(result).toContain(humanDefined);
  });

  it('handles both purposes undefined', () => {
    const result = mergePurposes(undefined, undefined);
    expect(result).toBe('');
  });

  it('formats complex tools structure correctly', () => {
    const discovered = {
      purpose: 'purpose',
      limitations: 'limitations',
      tools: [
        {
          name: 'tool1',
          config: { key1: 'value1', nested: { key2: 'value2' } },
        },
        {
          name: 'tool2',
          options: { array: ['opt1', 'opt2'], flag: true },
        },
      ],
    };

    const result = mergePurposes(undefined, discovered);
    const toolsString = JSON.stringify(discovered.tools, null, 2);
    expect(result).toContain(toolsString);
  });
});
