import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { runAssertion, runAssertions, readAssertions } from '../../src/assertions';
import type { Assertion, AtomicTestCase } from '../../src/types';
import { transform } from '../../src/util/transform';

jest.mock('fs');
jest.mock('path');
jest.mock('js-yaml');
jest.mock('../../src/util/transform');

describe('assertions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('runAssertion', () => {
    it('should run basic assertion', async () => {
      const assertion: Assertion = {
        type: 'equals',
        value: 'test',
      };

      const result = await runAssertion({
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: {
          output: 'test',
        },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle inverse assertions', async () => {
      const assertion: Assertion = {
        type: 'not-equals',
        value: 'wrong',
      };

      const result = await runAssertion({
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: {
          output: 'test',
        },
      });

      expect(result.pass).toBe(true);
    });

    it('should apply transforms', async () => {
      const assertion: Assertion = {
        type: 'equals',
        value: 'TEST',
        transform: 'uppercase',
      };

      jest.mocked(transform).mockResolvedValue('TEST');

      const result = await runAssertion({
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: {
          output: 'test',
        },
      });

      expect(result.pass).toBe(true);
      expect(transform).toHaveBeenCalledWith('uppercase', 'test', expect.any(Object));
    });

    it('should handle file references (unsupported file type)', async () => {
      const mockFileContent = 'test content';
      const mockFilePath = '/path/to/test.txt';

      jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
      jest.mocked(path.resolve).mockReturnValue(mockFilePath);

      const assertion: Assertion = {
        type: 'equals',
        value: 'file://test.txt',
      };

      await expect(
        runAssertion({
          assertion,
          test: {} as AtomicTestCase,
          providerResponse: {
            output: mockFileContent,
          },
        }),
      ).rejects.toThrow('Unsupported file type: /path/to/test.txt');
    });

    it('should handle weight=0 assertions as metrics', async () => {
      const assertion: Assertion = {
        type: 'equals',
        value: 'wrong',
        weight: 0,
      };

      const result = await runAssertion({
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: {
          output: 'test',
        },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle array values', async () => {
      const assertion: Assertion = {
        type: 'contains-any',
        value: ['test', 'example'],
      };

      const result = await runAssertion({
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: {
          output: 'this is a test',
        },
      });

      expect(result.pass).toBe(true);
    });

    it('should throw error if assertion type is unknown', async () => {
      const assertion: Assertion = {
        // @ts-expect-error
        type: 'unknown-assertion-type',
        value: 'foo',
      };

      await expect(
        runAssertion({
          assertion,
          test: {} as AtomicTestCase,
          providerResponse: {
            output: 'foo',
          },
        }),
      ).rejects.toThrow('Unknown assertion type: unknown-assertion-type');
    });

    it('should throw error if assertion type is missing', async () => {
      // @ts-expect-error
      const assertion: Assertion = {
        value: 'foo',
      };

      await expect(
        runAssertion({
          assertion,
          test: {} as AtomicTestCase,
          providerResponse: {
            output: 'foo',
          },
        }),
      ).rejects.toThrow('Assertion must have a type');
    });

    it('should handle traceId and add trace to context if present', async () => {
      // This test will exercise the traceId code path, but won't actually test the trace result
      // since the trace store module is dynamic and not loaded in this test env.
      const assertion: Assertion = {
        type: 'equals',
        value: 'test',
      };

      const result = await runAssertion({
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: {
          output: 'test',
        },
        traceId: 'fake-trace-id',
      });

      expect(result.pass).toBe(true);
    });

    it('should support array value with file references', async () => {
      const assertion: Assertion = {
        type: 'contains-any',
        value: ['file://test.txt', 'foo'],
      };
      // processFileReference will throw for .txt, so we expect an error
      jest.mocked(fs.readFileSync).mockReturnValue('abc');
      jest.mocked(path.resolve).mockReturnValue('/abs/path/to/test.txt');
      await expect(
        runAssertion({
          assertion,
          test: {} as AtomicTestCase,
          providerResponse: {
            output: 'abc',
          },
        }),
      ).rejects.toThrow('Unsupported file type: /abs/path/to/test.txt');
    });

    it('should support nunjucks rendering for string value', async () => {
      const assertion: Assertion = {
        type: 'equals',
        value: 'Hello, {{ name }}!',
      };
      const test: AtomicTestCase = {
        vars: { name: 'World' },
      } as AtomicTestCase;
      const result = await runAssertion({
        assertion,
        test,
        providerResponse: {
          output: 'Hello, World!',
        },
      });
      expect(result.pass).toBe(true);
    });
  });

  describe('runAssertions', () => {
    it('should handle empty assertions', async () => {
      const result = await runAssertions({
        test: { assert: [] },
        providerResponse: { output: 'test' },
      });

      expect(result.pass).toBe(true);
    });

    it('should run multiple assertions', async () => {
      const test: AtomicTestCase = {
        assert: [
          { type: 'equals', value: 'test' },
          { type: 'contains', value: 'es' },
        ],
      };

      const result = await runAssertions({
        test,
        providerResponse: { output: 'test' },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle assertion sets', async () => {
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            assert: [
              { type: 'equals', value: 'test' },
              { type: 'contains', value: 'es' },
            ],
            threshold: 1,
          },
        ],
      };

      const result = await runAssertions({
        test,
        providerResponse: { output: 'test' },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle assertion failure', async () => {
      const test: AtomicTestCase = {
        assert: [{ type: 'equals', value: 'wrong' }],
      };

      const result = await runAssertions({
        test,
        providerResponse: { output: 'test' },
      });

      expect(result.pass).toBe(false);
    });

    it('should handle select-type assertions (ignored in runAssertions)', async () => {
      const test: AtomicTestCase = {
        assert: [
          { type: 'select-best', value: 'foo' },
          { type: 'equals', value: 'bar' },
        ],
      };

      const result = await runAssertions({
        test,
        providerResponse: { output: 'bar' },
      });
      expect(result.pass).toBe(true);
    });
  });

  describe('readAssertions', () => {
    it('should read assertions from YAML file', async () => {
      const mockYaml = [
        { type: 'equals', value: 'test' },
        { type: 'contains', value: 'es' },
      ];
      jest.mocked(fs.readFileSync).mockReturnValue('dummy yaml content');
      jest.mocked(yaml.load).mockReturnValue(mockYaml);

      const assertions = await readAssertions('test.yaml');
      expect(assertions).toEqual(mockYaml);
    });

    it('should throw error for invalid assertions file', async () => {
      jest.mocked(fs.readFileSync).mockReturnValue('invalid yaml');
      jest.mocked(yaml.load).mockReturnValue({});

      await expect(readAssertions('invalid.yaml')).rejects.toThrow(
        'Assertions file must be an array of assertion objects',
      );
    });

    it('should throw error if fs or yaml throws', async () => {
      jest.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('fs error');
      });

      await expect(readAssertions('fail.yaml')).rejects.toThrow(
        /Failed to read assertions from fail.yaml/,
      );
    });
  });
});
