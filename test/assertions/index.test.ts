import fs from 'fs';
import yaml from 'js-yaml';
import { runAssertion, runAssertions, readAssertions } from '../../src/assertions';
import { AssertionsResult } from '../../src/assertions/assertionsResult';
import type { Assertion, AtomicTestCase, ProviderResponse } from '../../src/types';
import { transform } from '../../src/util/transform';

jest.mock('fs');
jest.mock('js-yaml');
jest.mock('path');
jest.mock('../../src/util/transform');

describe('assertions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runAssertion', () => {
    const mockProviderResponse: ProviderResponse = {
      output: 'test output',
      cost: 0,
    };

    const mockTest: AtomicTestCase = {
      vars: {},
    };

    it('should run contains assertion', async () => {
      const assertion: Assertion = {
        type: 'contains',
        value: 'test',
      };

      const result = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });

    it('should run not-contains assertion', async () => {
      const assertion: Assertion = {
        type: 'not-contains',
        value: 'missing',
      };

      const result = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });

    it('should handle transform', async () => {
      const assertion: Assertion = {
        type: 'contains',
        value: 'TEST OUTPUT',
        transform: 'toUpperCase',
      };

      const mockTransform = jest.mocked(transform);
      mockTransform.mockResolvedValue('TEST OUTPUT');

      const result = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(mockTransform).toHaveBeenCalledWith('toUpperCase', 'test output', expect.any(Object));
    });

    it('should handle weight=0 assertions as metrics', async () => {
      const assertion: Assertion = {
        type: 'contains',
        value: 'missing',
        weight: 0,
      };

      const result = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });

    it('should handle trace data when traceId is provided', async () => {
      const mockTraceData = {
        traceId: 'test-trace-id',
        spans: [],
      };

      const mockTraceStore = {
        getTrace: jest.fn().mockResolvedValue(mockTraceData),
      };

      jest.mock('../../src/tracing/store', () => ({
        getTraceStore: () => mockTraceStore,
      }));

      const assertion: Assertion = {
        type: 'contains',
        value: 'test',
      };

      const result = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
    });

    it('should handle failed trace data fetch', async () => {
      const mockTraceStore = {
        getTrace: jest.fn().mockRejectedValue(new Error('Failed to fetch trace')),
      };

      jest.mock('../../src/tracing/store', () => ({
        getTraceStore: () => mockTraceStore,
      }));

      const assertion: Assertion = {
        type: 'contains',
        value: 'test',
      };

      const result = await runAssertion({
        assertion,
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
    });

    it('should handle invalid assertion type', async () => {
      const assertion: Assertion = {
        type: 'invalid-type' as any,
        value: 'test',
      };

      await expect(
        runAssertion({
          assertion,
          test: mockTest,
          providerResponse: mockProviderResponse,
        }),
      ).rejects.toThrow('Unknown assertion type: invalid-type');
    });
  });

  describe('runAssertions', () => {
    const mockProviderResponse: ProviderResponse = {
      output: 'test output',
      cost: 0,
    };

    const mockTest: AtomicTestCase = {
      vars: {},
      assert: [
        {
          type: 'contains',
          value: 'test',
        },
        {
          type: 'not-contains',
          value: 'missing',
        },
      ],
    };

    it('should run multiple assertions', async () => {
      const result = await runAssertions({
        test: mockTest,
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle assertion sets', async () => {
      const testWithSet: AtomicTestCase = {
        vars: {},
        assert: [
          {
            type: 'assert-set',
            assert: [
              {
                type: 'contains',
                value: 'test',
              },
            ],
          } as any,
        ],
      };

      const result = await runAssertions({
        test: testWithSet,
        providerResponse: mockProviderResponse,
      });

      expect(result.pass).toBe(true);
    });

    it('should return no asserts result when no assertions', async () => {
      const result = await runAssertions({
        test: { vars: {} },
        providerResponse: mockProviderResponse,
      });

      expect(result).toEqual(AssertionsResult.noAssertsResult());
    });

    it('should handle custom scoring function', async () => {
      const customScoring = jest.fn(() => 0) as any;

      const result = await runAssertions({
        test: mockTest,
        providerResponse: mockProviderResponse,
        assertScoringFunction: customScoring,
      });

      expect(customScoring).toHaveBeenCalledWith(expect.any(Object), expect.any(Object));
      expect(result.score).toBe(0);
    });

    it('should handle traceId in assertions', async () => {
      const result = await runAssertions({
        test: mockTest,
        providerResponse: mockProviderResponse,
        traceId: 'test-trace-id',
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });
  });

  describe('readAssertions', () => {
    it('should read assertions from YAML file', async () => {
      const mockYaml = [
        { type: 'contains', value: 'test' },
        { type: 'equals', value: 'exact' },
      ];

      jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
      jest.mocked(yaml.load).mockReturnValue(mockYaml);

      const assertions = await readAssertions('test.yaml');

      expect(assertions).toEqual(mockYaml);
      expect(fs.readFileSync).toHaveBeenCalledWith('test.yaml', 'utf-8');
    });

    it('should throw error if assertions file is invalid', async () => {
      jest.mocked(fs.readFileSync).mockReturnValue('yaml content');
      jest.mocked(yaml.load).mockReturnValue('invalid');

      await expect(readAssertions('test.yaml')).rejects.toThrow(
        'Assertions file must be an array of assertion objects',
      );
    });

    it('should throw error if file read fails', async () => {
      jest.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File read error');
      });

      await expect(readAssertions('test.yaml')).rejects.toThrow(
        'Failed to read assertions from test.yaml',
      );
    });
  });
});
