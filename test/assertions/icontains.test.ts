import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';

// Mock setup similar to index.test.ts
jest.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: jest.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: jest.fn().mockReturnValue(mockRequire),
  };
});

jest.mock('../../src/fetch', () => {
  const actual = jest.requireActual('../../src/fetch');
  return {
    ...actual,
    fetchWithRetries: jest.fn(actual.fetchWithRetries),
  };
});

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../../src/esm');
jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(jest.requireActual('path').resolve),
  extname: jest.fn(jest.requireActual('path').extname),
}));

jest.mock('../../src/cliState', () => ({
  basePath: '/base/path',
}));

jest.mock('../../src/matchers', () => {
  const actual = jest.requireActual('../../src/matchers');
  return {
    ...actual,
    matchesContextRelevance: jest
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
    matchesContextFaithfulness: jest
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
  };
});

describe('Case-insensitive contains assertions', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('icontains assertion', () => {
    const containsLowerAssertion: Assertion = {
      type: 'icontains',
      value: 'expected output',
    };

    it('should pass when the icontains assertion passes', async () => {
      const output = 'EXPECTED OUTPUT';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: containsLowerAssertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the icontains assertion fails', async () => {
      const output = 'Different output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: containsLowerAssertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Expected output to contain "expected output"',
      });
    });
  });

  describe('not-icontains assertion', () => {
    const notContainsLowerAssertion: Assertion = {
      type: 'not-icontains',
      value: 'unexpected output',
    };

    it('should pass when the not-icontains assertion passes', async () => {
      const output = 'Expected output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: notContainsLowerAssertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the not-icontains assertion fails', async () => {
      const output = 'UNEXPECTED OUTPUT';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: notContainsLowerAssertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Expected output to not contain "unexpected output"',
      });
    });
  });

  describe('icontains-any assertion', () => {
    it('should pass when the icontains-any assertion passes', async () => {
      const output = 'This output contains OPTION1';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'icontains-any',
          value: ['option1', 'option2', 'option3'],
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the icontains-any assertion fails', async () => {
      const output = 'This output does not contain any option';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'icontains-any',
          value: ['option1', 'option2', 'option3'],
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Expected output to contain one of "option1, option2, option3"',
      });
    });
  });

  describe('icontains-all assertion', () => {
    it('should pass when the icontains-all assertion passes', async () => {
      const output = 'This output contains OPTION1, option2, and opTiOn3';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'icontains-all',
          value: ['option1', 'option2', 'option3'],
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the icontains-all assertion fails', async () => {
      const output = 'This output contains only OPTION1 and option2';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'icontains-all',
          value: ['option1', 'option2', 'option3'],
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Expected output to contain all of [option1, option2, option3]. Missing: [option3]',
      });
    });
  });
});
