import { fetchWithProxy } from '../../../src/fetch';
import {
  ArgsSchema,
  doTargetPurposeDiscovery,
  mergeTargetPurposeDiscoveryResults,
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
});

describe('mergeTargetPurposeDiscoveryResults', () => {
  it('should correctly merge human-defined and discovered purposes', () => {
    const humanDefined = 'This is a human defined purpose';
    const discovered = {
      purpose: 'This is a discovered purpose',
      limitations: 'This is a discovered limitation',
      tools: [
        {
          name: 'tool1',
          description: 'desc1',
          arguments: [{ name: 'arg1', description: 'desc arg1', type: 'string' }],
        },
      ],
      user: 'This is a discovered user',
    };

    const mergedPurpose = mergeTargetPurposeDiscoveryResults(humanDefined, discovered);

    expect(mergedPurpose).toContain(humanDefined);
    expect(mergedPurpose).toContain(discovered.purpose);
    expect(mergedPurpose).toContain(discovered.limitations);
    expect(mergedPurpose).toContain('tool1');
    expect(mergedPurpose).toContain('desc1');
    expect(mergedPurpose).toContain('arg1');
    expect(mergedPurpose).toContain(discovered.user);
  });

  it('should handle only human-defined purpose', () => {
    const humanDefined = 'This is a human defined purpose';
    const mergedPurpose = mergeTargetPurposeDiscoveryResults(humanDefined, undefined);

    expect(mergedPurpose).toContain(humanDefined);
  });

  it('should handle only discovered purpose', () => {
    const discovered = {
      purpose: 'This is a discovered purpose',
      limitations: 'These are limitations',
      tools: [
        { name: 'tool1', description: 'desc1', arguments: [] },
        { name: 'tool2', description: 'desc2', arguments: [] },
      ],
      user: 'This is a discovered user',
    };
    const mergedPurpose = mergeTargetPurposeDiscoveryResults(undefined, discovered);

    expect(mergedPurpose).toContain(discovered.purpose);
    expect(mergedPurpose).toContain(discovered.limitations);
    expect(mergedPurpose).toContain('tool1');
    expect(mergedPurpose).toContain('tool2');
    expect(mergedPurpose).toContain(discovered.user);
  });

  it('should handle neither purpose being defined', () => {
    const mergedPurpose = mergeTargetPurposeDiscoveryResults(undefined, undefined);
    expect(mergedPurpose).toBe('');
  });

  it('should properly format complex tool structures', () => {
    const discovered = {
      purpose: 'purpose',
      limitations: 'limitations',
      tools: [
        {
          name: 'tool1',
          description: 'desc1',
          arguments: [{ name: 'a', description: 'd', type: 'string' }],
        },
        {
          name: 'tool2',
          description: 'desc2',
          arguments: [{ name: 'b', description: 'e', type: 'number' }],
        },
      ],
      user: 'user',
    };
    const mergedPurpose = mergeTargetPurposeDiscoveryResults(undefined, discovered);

    expect(mergedPurpose).toContain('purpose');
    expect(mergedPurpose).toContain('limitations');
    expect(mergedPurpose).toContain('tool1');
    expect(mergedPurpose).toContain('tool2');
    expect(mergedPurpose).toContain('desc1');
    expect(mergedPurpose).toContain('desc2');
    expect(mergedPurpose).toContain('a');
    expect(mergedPurpose).toContain('b');
    expect(mergedPurpose).toContain('user');
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
          tools: [
            {
              name: 'tool1',
              description: 'desc1',
              arguments: [{ name: 'a', description: 'd', type: 'string' }],
            },
          ],
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
      prompt: { raw: 'What is your purpose?', label: 'Target Discovery Question' },
      vars: { sessionId: expect.any(String) },
    });

    // Verify fetchWithProxy was called twice
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(2);

    // Verify the discovered purpose matches expected output
    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: 'Test limitations',
      tools: [
        {
          name: 'tool1',
          description: 'desc1',
          arguments: [{ name: 'a', description: 'd', type: 'string' }],
        },
      ],
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
          tools: [
            {
              name: 'tool1',
              description: 'desc1',
              arguments: [{ name: 'a', description: 'd', type: 'string' }],
            },
          ],
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
      prompt: { raw: 'What is your purpose?', label: 'Target Discovery Question' },
      vars: { sessionId: expect.any(String) },
    });

    // Verify fetchWithProxy was called twice
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(2);

    // Verify the discovered purpose matches expected output
    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: 'Test limitations',
      tools: [
        {
          name: 'tool1',
          description: 'desc1',
          arguments: [{ name: 'a', description: 'd', type: 'string' }],
        },
      ],
      user: 'Test user',
    });
  });
});
