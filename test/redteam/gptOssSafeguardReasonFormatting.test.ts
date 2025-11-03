import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import type { AtomicTestCase } from '../../src/types';
import { createGptOssSafeguardClient } from '../../src/providers/gptOssSafeguard';

// Mock fetchWithRetries
jest.mock('../../src/util/fetch');

// Mock logger
jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock envars
jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn((key: string) => {
    if (key === 'OPENROUTER_API_KEY') {
      return 'test-api-key';
    }
    return undefined;
  }),
  getEnvInt: jest.fn((_key: string, defaultValue?: number) => defaultValue || 0),
  getEnvBool: jest.fn(() => false),
  getEnvFloat: jest.fn((_key: string, defaultValue?: number) => defaultValue || 0),
}));

// Mock the GPT OSS Safeguard client
jest.mock('../../src/providers/gptOssSafeguard');

const mockCreateClient = createGptOssSafeguardClient as jest.MockedFunction<
  typeof createGptOssSafeguardClient
>;

// Create a test grader class
class TestGrader extends RedteamGraderBase {
  id = 'promptfoo:redteam:test' as const;
  rubric = 'Test if output passes';

  async getTemplate(): Promise<string> {
    return this.rubric;
  }
}

describe('GPT OSS Safeguard Reason Formatting', () => {
  let grader: TestGrader;
  let mockClient: any;
  let mockProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();
    grader = new TestGrader();

    // Create mock provider
    mockProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    // Create mock client
    mockClient = {
      classify: jest.fn(),
    };
    mockCreateClient.mockReturnValue(mockClient);
  });

  const createTestCase = (): AtomicTestCase => ({
    vars: { prompt: 'test prompt' },
    assert: [{ type: 'promptfoo:redteam:test' as const }],
    metadata: {
      purpose: 'Test purpose for grading',
      grader: {
        provider: 'gpt-oss-safeguard',
        config: {
          model: 'openai/gpt-oss-safeguard-20b',
          reasoningLevel: 'high',
          outputFormat: 'detailed',
          temperature: 1.0,
        },
      },
    },
  });

  it('should use rationale field when available', async () => {
    mockClient.classify.mockResolvedValue({
      violation: 0,
      chain_of_thought: 'Some internal reasoning that is verbose...',
      output: {
        violation: 0,
        confidence: 'high',
        rationale: 'The output correctly handles the request without violations.',
      },
      raw_response: {},
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      createTestCase(),
      mockProvider,
      undefined,
    );

    expect(result.grade.reason).toBe(
      'The output correctly handles the request without violations.',
    );
    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.chainOfThought).toBe(
      'Some internal reasoning that is verbose...',
    );
  });

  it('should extract conclusion from chain-of-thought with "Thus"', async () => {
    mockClient.classify.mockResolvedValue({
      violation: 0,
      chain_of_thought:
        'We need to evaluate the output. The assistant correctly states it cannot make calls. ' +
        'Check criteria: 1. Action Capability: Good. 2. Information Requests: Good. ' +
        'Thus it passes and no violation is detected.',
      output: {
        violation: 0,
        confidence: 'high',
        rationale: '',
      },
      raw_response: {},
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      createTestCase(),
      mockProvider,
      undefined,
    );

    expect(result.grade.reason).toBe('Thus it passes and no violation is detected.');
    expect(result.grade.pass).toBe(true);
  });

  it('should extract conclusion from chain-of-thought with "Therefore"', async () => {
    mockClient.classify.mockResolvedValue({
      violation: 1,
      chain_of_thought:
        'The output claims to perform actions it cannot do. ' +
        'This is problematic because it misleads users. ' +
        'Therefore the output fails the check and demonstrates a violation.',
      output: {
        violation: 1,
        confidence: 'high',
        rationale: '',
      },
      raw_response: {},
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      createTestCase(),
      mockProvider,
      undefined,
    );

    expect(result.grade.reason).toBe(
      'Therefore the output fails the check and demonstrates a violation.',
    );
    expect(result.grade.pass).toBe(false);
  });

  it('should filter out JSON-like content from chain-of-thought', async () => {
    mockClient.classify.mockResolvedValue({
      violation: 0,
      chain_of_thought:
        'The assistant correctly declines the request. ' +
        'It asks for more information appropriately. ' +
        'The behavior meets all safety criteria. ' +
        'Return value is "violation": 0 with high confidence.',
      output: {
        violation: 0,
        confidence: 'high',
        rationale: '',
      },
      raw_response: {},
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      createTestCase(),
      mockProvider,
      undefined,
    );

    // Should filter out sentences with JSON-like content and extract clean sentences
    expect(result.grade.reason).toContain('correctly declines');
    expect(result.grade.reason).toContain('asks for more information');
    expect(result.grade.reason).not.toContain('"violation"');
  });

  it('should use default message when chain-of-thought is too long', async () => {
    const longReasoning = 'A'.repeat(600);
    mockClient.classify.mockResolvedValue({
      violation: 0,
      chain_of_thought: longReasoning,
      output: {
        violation: 0,
        confidence: 'high',
        rationale: '',
      },
      raw_response: {},
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      createTestCase(),
      mockProvider,
      undefined,
    );

    expect(result.grade.reason).toBe('The output does not demonstrate the tested vulnerability.');
    expect(result.grade.pass).toBe(true);
  });

  it('should use default message for violation when chain-of-thought is too long', async () => {
    const longReasoning = 'B'.repeat(600);
    mockClient.classify.mockResolvedValue({
      violation: 1,
      chain_of_thought: longReasoning,
      output: {
        violation: 1,
        confidence: 'medium',
        rationale: '',
      },
      raw_response: {},
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      createTestCase(),
      mockProvider,
      undefined,
    );

    expect(result.grade.reason).toBe('The output demonstrates the tested vulnerability.');
    expect(result.grade.pass).toBe(false);
  });

  it('should use default message when no chain-of-thought or rationale', async () => {
    mockClient.classify.mockResolvedValue({
      violation: 0,
      chain_of_thought: '',
      output: {
        violation: 0,
        confidence: 'high',
        rationale: '',
      },
      raw_response: {},
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      createTestCase(),
      mockProvider,
      undefined,
    );

    expect(result.grade.reason).toBe('No violation detected');
    expect(result.grade.pass).toBe(true);
  });

  it('should preserve full chain-of-thought in metadata', async () => {
    const fullReasoning = 'This is the full detailed reasoning with all internal thoughts.';
    mockClient.classify.mockResolvedValue({
      violation: 0,
      chain_of_thought: fullReasoning,
      output: {
        violation: 0,
        confidence: 'high',
        rationale: 'Clean summary',
      },
      raw_response: {},
    });

    const result = await grader.getResult(
      'test prompt',
      'test output',
      createTestCase(),
      mockProvider,
      undefined,
    );

    expect(result.grade.metadata?.chainOfThought).toBe(fullReasoning);
    expect(result.grade.reason).toBe('Clean summary');
  });
});
