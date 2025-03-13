export function oldStyleEval() {
  return {
    id: 'eval-2024-10-01T18:24:51',
    createdAt: 1727807091574,
    description: 'Simple test',
    results: {
      version: 2,
      timestamp: '2024-10-01T18:24:51.574Z',
      results: [
        {
          provider: {
            id: 'openai:gpt-4o-mini',
            label: '',
          },
          prompt: {
            raw: 'Rephrase this in French: Hello world',
            label: 'Rephrase this in {{language}}: {{body}}',
          },
          vars: {
            language: 'French',
            body: 'Hello world',
          },
          response: {
            output: 'Bonjour le monde.',
            tokenUsage: {
              total: 19,
              prompt: 15,
              completion: 4,
            },
            cached: false,
            cost: 0.0000046499999999999995,
          },
          success: true,
          score: 1,
          namedScores: {},
          latencyMs: 684,
          cost: 0.0000046499999999999995,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'No assertions',
            tokensUsed: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
            },
            assertion: null,
          },
        },
        {
          provider: {
            id: 'openai:gpt-4o-mini',
            label: '',
          },
          prompt: {
            raw: 'Translate this to conversational French: Hello world',
            label: 'Translate this to conversational {{language}}: {{body}}',
          },
          vars: {
            language: 'French',
            body: 'Hello world',
          },
          response: {
            output: 'Salut tout le monde !',
            tokenUsage: {
              total: 20,
              prompt: 15,
              completion: 5,
            },
            cached: false,
            cost: 0.0000052500000000000006,
          },
          success: true,
          score: 1,
          namedScores: {},
          latencyMs: 683,
          cost: 0.0000052500000000000006,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'No assertions',
            tokensUsed: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
            },
            assertion: null,
          },
        },
      ],
      stats: {
        successes: 2,
        failures: 0,
        tokenUsage: {
          total: 39,
          prompt: 30,
          completion: 9,
          cached: 0,
        },
      },
      table: {
        head: {
          prompts: [
            {
              raw: 'Rephrase this in {{language}}: {{body}}',
              label: 'Rephrase this in {{language}}: {{body}}',
              id: 'dd3415036994f2d82d0ba70cc5bb2caed82da6ccbdaca8a2174cf3992141c207',
              provider: 'openai:gpt-4o-mini',
              metrics: {
                score: 1,
                testPassCount: 1,
                testFailCount: 0,
                assertPassCount: 0,
                assertFailCount: 0,
                totalLatencyMs: 684,
                tokenUsage: {
                  total: 19,
                  prompt: 15,
                  completion: 4,
                  cached: 0,
                },
                namedScores: {},
                namedScoresCount: {},
                cost: 0.0000046499999999999995,
              },
            },
            {
              raw: 'Translate this to conversational {{language}}: {{body}}',
              label: 'Translate this to conversational {{language}}: {{body}}',
              id: '68f67e9473a10ba8e5294074e90b8cc9daa9aed6256e89391e4ad7adbffba52c',
              provider: 'openai:gpt-4o-mini',
              metrics: {
                score: 1,
                testPassCount: 1,
                testFailCount: 0,
                assertPassCount: 0,
                assertFailCount: 0,
                totalLatencyMs: 683,
                tokenUsage: {
                  total: 20,
                  prompt: 15,
                  completion: 5,
                  cached: 0,
                },
                namedScores: {},
                namedScoresCount: {},
                cost: 0.0000052500000000000006,
              },
            },
          ],
          vars: ['body', 'language'],
        },
        body: [
          {
            outputs: [
              {
                pass: true,
                score: 1,
                namedScores: {},
                text: 'Bonjour le monde.',
                prompt: 'Rephrase this in French: Hello world',
                provider: 'openai:gpt-4o-mini',
                latencyMs: 684,
                tokenUsage: {
                  total: 19,
                  prompt: 15,
                  completion: 4,
                },
                gradingResult: {
                  pass: true,
                  score: 1,
                  reason: 'No assertions',
                  tokensUsed: {
                    total: 0,
                    prompt: 0,
                    completion: 0,
                    cached: 0,
                  },
                  assertion: null,
                },
                cost: 0.0000046499999999999995,
              },
              {
                pass: true,
                score: 1,
                namedScores: {},
                text: 'Salut tout le monde !',
                prompt: 'Translate this to conversational French: Hello world',
                provider: 'openai:gpt-4o-mini',
                latencyMs: 683,
                tokenUsage: {
                  total: 20,
                  prompt: 15,
                  completion: 5,
                },
                gradingResult: {
                  pass: true,
                  score: 1,
                  reason: 'No assertions',
                  tokensUsed: {
                    total: 0,
                    prompt: 0,
                    completion: 0,
                    cached: 0,
                  },
                  assertion: null,
                },
                cost: 0.0000052500000000000006,
              },
            ],
            test: {
              vars: {
                language: 'French',
                body: 'Hello world',
              },
              assert: [],
              options: {},
              metadata: {},
            },
            vars: ['Hello world', 'French'],
          },
        ],
      },
    },
    config: {
      description: 'Simple test',
      prompts: [
        'Rephrase this in {{language}}: {{body}}',
        'Translate this to conversational {{language}}: {{body}}',
      ],
      providers: ['openai:gpt-4o-mini'],
      tests: [
        {
          vars: {
            language: 'French',
            body: 'Hello world',
          },
        },
      ],
      sharing: true,
      extensions: [],
    },
    author: 'test@example.com',
  };
}
