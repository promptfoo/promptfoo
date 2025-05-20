import { fetchWithProxy } from '../../../src/fetch';
import {
  ArgsSchema,
  doTargetPurposeDiscovery,
  mergePurposes,
} from '../../../src/redteam/commands/discover';

jest.mock('../../../src/fetch');

const mockedFetchWithProxy = jest.mocked(fetchWithProxy);

describe('ArgsSchema', () => {
  it('`config` and `target` are mutually exclusive', () => {
    const args = {
      config: 'test',
      target: 'test',
      preview: false,
      overwrite: false,
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Cannot specify both config and target!');
  });

  it('Either `config` or `target` must be provided', () => {
    const args = {
      preview: false,
      overwrite: false,
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Either config or target must be provided!');
  });
});

describe('mergePurposes', () => {
  it('should correctly merge human-defined and discovered purposes', () => {
    const humanDefined = 'This is a human defined purpose';
    const discovered = {
      purpose: 'This is a discovered purpose',
      limitations: 'This is a discovered limitation',
      tools: ['This is a discovered tool'],
      user: 'This is a discovered user',
    };

    const mergedPurpose = mergePurposes(humanDefined, discovered);

    expect(mergedPurpose).toContain(humanDefined);
    expect(mergedPurpose).toContain(discovered.purpose);
    expect(mergedPurpose).toContain(discovered.limitations);
    expect(mergedPurpose).toContain(discovered.tools[0]);
    expect(mergedPurpose).toContain(discovered.user);
    expect(mergedPurpose).toContain('<HumanDefinedPurpose>');
    expect(mergedPurpose).toContain('<AgentDiscoveredPurpose>');
  });

  it('should handle only human-defined purpose', () => {
    const humanDefined = 'This is a human defined purpose';
    const mergedPurpose = mergePurposes(humanDefined, undefined);

    expect(mergedPurpose).toContain(humanDefined);
    expect(mergedPurpose).toContain('<HumanDefinedPurpose>');
    expect(mergedPurpose).not.toContain('<AgentDiscoveredPurpose>');
  });

  it('should handle only discovered purpose', () => {
    const discovered = {
      purpose: 'This is a discovered purpose',
      limitations: 'These are limitations',
      tools: [{ name: 'tool1', description: 'desc1' }],
      user: 'This is a discovered user',
    };
    const mergedPurpose = mergePurposes(undefined, discovered);

    expect(mergedPurpose).not.toContain('<HumanDefinedPurpose>');
    expect(mergedPurpose).toContain('<AgentDiscoveredPurpose>');
    expect(mergedPurpose).toContain(discovered.purpose);
    expect(mergedPurpose).toContain(discovered.limitations);
    expect(mergedPurpose).toContain(JSON.stringify(discovered.tools, null, 2));
    expect(mergedPurpose).toContain(discovered.user);
  });

  it('should handle neither purpose being defined', () => {
    const mergedPurpose = mergePurposes(undefined, undefined);
    expect(mergedPurpose).toBe('');
  });

  it('should properly format complex tool structures', () => {
    const discovered = {
      purpose: 'purpose',
      limitations: 'limitations',
      tools: [
        { name: 'tool1', config: { key: 'value' } },
        { name: 'tool2', options: ['opt1', 'opt2'] },
      ],
    };
    const mergedPurpose = mergePurposes(undefined, discovered);

    expect(mergedPurpose).toContain(JSON.stringify(discovered.tools, null, 2));
    expect(mergedPurpose).toContain('tool1');
    expect(mergedPurpose).toContain('tool2');
  });
});

describe('doTargetPurposeDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle empty prompt', async () => {
    const mockResponses = [
      {
        done: false,
        question: 'What is your purpose?',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      },
      {
        done: true,
        purpose: {
          purpose: 'Test purpose',
          limitations: 'Test limitations',
          tools: [],
          user: 'Test user',
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['I am a test assistant'],
        },
      },
    ];

    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const target = {
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'I am a test assistant' }),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target);

    // Verify the target was called with the rendered prompt
    expect(target.callApi).toHaveBeenCalledWith('What is your purpose?', {
      prompt: { raw: 'What is your purpose?', label: 'Target Purpose Discovery Question' },
      vars: { sessionId: expect.any(String) },
    });

    // Verify fetchWithProxy was called twice
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(2);

    // Verify the discovered purpose matches expected output
    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: 'Test limitations',
      tools: [],
      user: 'Test user',
    });
  });

  it('should render the prompt if passed in', async () => {
    const mockResponses = [
      {
        done: false,
        question: 'What is your purpose?',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      },
      {
        done: true,
        purpose: {
          purpose: 'Test purpose',
          limitations: 'Test limitations',
          tools: [],
          user: 'Test user',
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['I am a test assistant'],
        },
      },
    ];

    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const target = {
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'I am a test assistant' }),
    };
    const prompt = {
      raw: 'This is a test prompt {{prompt}}',
      label: 'Test Prompt',
    };
    const discoveredPurpose = await doTargetPurposeDiscovery(target, prompt);

    // Verify the target was called with the rendered prompt
    expect(target.callApi).toHaveBeenCalledWith('This is a test prompt What is your purpose?', {
      prompt: { raw: 'What is your purpose?', label: 'Target Purpose Discovery Question' },
      vars: { sessionId: expect.any(String) },
    });

    // Verify fetchWithProxy was called twice
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(2);

    // Verify the discovered purpose matches expected output
    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: 'Test limitations',
      tools: [],
      user: 'Test user',
    });
  });
});
