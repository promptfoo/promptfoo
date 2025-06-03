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

  it('should handle normalized data with null values', () => {
    // Since normalization happens in doTargetPurposeDiscovery,
    // this test simulates already-normalized data
    const discovered = {
      purpose: null,
      limitations: null,
      tools: [],
      user: 'This is a valid user',
    };
    const mergedPurpose = mergeTargetPurposeDiscoveryResults(undefined, discovered);

    expect(mergedPurpose).not.toContain('## Purpose');
    expect(mergedPurpose).not.toContain('## Limitations');
    expect(mergedPurpose).not.toContain('## Tools');
    expect(mergedPurpose).toContain('## User');
    expect(mergedPurpose).toContain('This is a valid user');
  });

  it('should handle normalized data with empty content', () => {
    // Since normalization happens in doTargetPurposeDiscovery,
    // this test simulates already-normalized data
    const discovered = {
      purpose: null,
      limitations: null,
      tools: [],
      user: 'Valid user',
    };
    const mergedPurpose = mergeTargetPurposeDiscoveryResults(undefined, discovered);

    expect(mergedPurpose).not.toContain('## Purpose');
    expect(mergedPurpose).not.toContain('## Limitations');
    expect(mergedPurpose).not.toContain('## Tools');
    expect(mergedPurpose).toContain('## User');
    expect(mergedPurpose).toContain('Valid user');
  });

  it('should handle normalized data with empty tools array', () => {
    // Since normalization happens in doTargetPurposeDiscovery,
    // this test simulates already-normalized data
    const discovered = {
      purpose: 'Valid purpose',
      limitations: 'Valid limitations',
      tools: [], // normalization would have cleaned this
      user: 'Valid user',
    };
    const mergedPurpose = mergeTargetPurposeDiscoveryResults(undefined, discovered);

    expect(mergedPurpose).toContain('## Purpose');
    expect(mergedPurpose).toContain('## Limitations');
    expect(mergedPurpose).not.toContain('## Tools');
    expect(mergedPurpose).toContain('## User');
  });

  it('should include normalized data with valid tools', () => {
    const discovered = {
      purpose: 'Valid purpose',
      limitations: 'Valid limitations',
      tools: [{ name: 'tool1', description: 'desc1', arguments: [] }], // normalization would have cleaned out nulls
      user: 'Valid user',
    };
    const mergedPurpose = mergeTargetPurposeDiscoveryResults(undefined, discovered);

    expect(mergedPurpose).toContain('## Purpose');
    expect(mergedPurpose).toContain('## Limitations');
    expect(mergedPurpose).toContain('## Tools');
    expect(mergedPurpose).toContain('tool1');
    expect(mergedPurpose).toContain('## User');
  });

  it('should omit Agent Discovered Target Purpose section when no meaningful content is discovered', () => {
    const discovered = {
      purpose: null,
      limitations: null,
      tools: [],
      user: null,
    };
    const mergedPurpose = mergeTargetPurposeDiscoveryResults('Human defined purpose', discovered);

    expect(mergedPurpose).toContain('# Human Defined Target Purpose');
    expect(mergedPurpose).toContain('Human defined purpose');
    expect(mergedPurpose).not.toContain('# Agent Discovered Target Purpose');
    expect(mergedPurpose).not.toContain('## Purpose');
    expect(mergedPurpose).not.toContain('## Limitations');
    expect(mergedPurpose).not.toContain('## Tools');
    expect(mergedPurpose).not.toContain('## User');
  });

  it('should include Agent Discovered Target Purpose section when meaningful content exists', () => {
    const discovered = {
      purpose: 'Discovered purpose',
      limitations: null,
      tools: [],
      user: null,
    };
    const mergedPurpose = mergeTargetPurposeDiscoveryResults('Human defined purpose', discovered);

    expect(mergedPurpose).toContain('# Human Defined Target Purpose');
    expect(mergedPurpose).toContain('# Agent Discovered Target Purpose');
    expect(mergedPurpose).toContain('## Purpose');
    expect(mergedPurpose).toContain('Discovered purpose');
    expect(mergedPurpose).not.toContain('## Limitations');
    expect(mergedPurpose).not.toContain('## Tools');
    expect(mergedPurpose).not.toContain('## User');
  });

  it('should normalize string "null" values from server response', async () => {
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
          purpose: 'null', // Server returns string "null"
          limitations: 'null', // Server returns string "null"
          tools: [],
          user: 'null', // Server returns string "null"
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['I cannot provide that information'],
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
      callApi: jest.fn().mockResolvedValue({ output: 'I cannot provide that information' }),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target);

    // Verify that string "null" values are normalized to actual null
    expect(discoveredPurpose).toEqual({
      purpose: null,
      limitations: null,
      tools: [],
      user: null,
    });
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

  it('should normalize string "null" values from server response', async () => {
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
          purpose: 'null', // Server returns string "null"
          limitations: 'null', // Server returns string "null"
          tools: [],
          user: 'null', // Server returns string "null"
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['I cannot provide that information'],
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
      callApi: jest.fn().mockResolvedValue({ output: 'I cannot provide that information' }),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target);

    // Verify that string "null" values are normalized to actual null
    expect(discoveredPurpose).toEqual({
      purpose: null,
      limitations: null,
      tools: [],
      user: null,
    });
  });
});
