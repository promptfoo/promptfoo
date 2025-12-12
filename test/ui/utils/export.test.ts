/**
 * Tests for export utility.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  EXPORT_FORMATS,
  convertTableToFormat,
  generateDefaultFilename,
  exportTableToFile,
  getFormatFromKey,
  type ExportFormat,
} from '../../../src/ui/utils/export';
import type { EvaluateTable } from '../../../src/types/index';

describe('export utility', () => {
  const mockTable: EvaluateTable = {
    head: {
      vars: ['input', 'expected'],
      prompts: [
        { provider: 'openai:gpt-4', label: 'GPT-4', raw: '', display: '' },
        { provider: 'anthropic:claude', label: 'Claude', raw: '', display: '' },
      ],
    },
    body: [
      {
        testIdx: 0,
        vars: ['hello', 'greeting'],
        description: 'Test 1',
        test: { vars: { input: 'hello', expected: 'greeting' } },
        outputs: [
          {
            pass: true,
            score: 1,
            text: 'Hi there!',
            cost: 0.001,
            latencyMs: 100,
            id: '1',
            failureReason: null as any,
            namedScores: {},
            prompt: 'hello',
            testCase: { vars: {} },
          },
          {
            pass: false,
            score: 0,
            text: 'Error occurred',
            cost: 0.002,
            latencyMs: 200,
            id: '2',
            failureReason: 'ASSERT' as any,
            namedScores: {},
            prompt: 'hello',
            testCase: { vars: {} },
          },
        ],
      },
      {
        testIdx: 1,
        vars: ['test', 'testing'],
        test: { vars: { input: 'test', expected: 'testing' } },
        outputs: [
          {
            pass: true,
            score: 0.8,
            text: 'Testing response',
            cost: 0.001,
            latencyMs: 150,
            id: '3',
            failureReason: null as any,
            namedScores: {},
            prompt: 'test',
            testCase: { vars: {} },
          },
          {
            pass: true,
            score: 0.9,
            text: 'Another response',
            cost: 0.002,
            latencyMs: 180,
            id: '4',
            failureReason: null as any,
            namedScores: {},
            prompt: 'test',
            testCase: { vars: {} },
          },
        ],
      },
    ],
  };

  describe('EXPORT_FORMATS', () => {
    it('should define all supported formats', () => {
      expect(EXPORT_FORMATS).toHaveLength(4);
      expect(EXPORT_FORMATS.map((f) => f.extension)).toEqual(['.json', '.yaml', '.csv', '.txt']);
    });

    it('should have unique keys', () => {
      const keys = EXPORT_FORMATS.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('getFormatFromKey', () => {
    it('should return correct format for valid keys', () => {
      expect(getFormatFromKey('j')).toBe('json');
      expect(getFormatFromKey('y')).toBe('yaml');
      expect(getFormatFromKey('c')).toBe('csv');
      expect(getFormatFromKey('t')).toBe('txt');
    });

    it('should return null for invalid keys', () => {
      expect(getFormatFromKey('x')).toBeNull();
      expect(getFormatFromKey('z')).toBeNull();
    });

    it('should be case-insensitive', () => {
      expect(getFormatFromKey('J')).toBe('json');
      expect(getFormatFromKey('Y')).toBe('yaml');
    });
  });

  describe('convertTableToFormat', () => {
    describe('json format', () => {
      it('should convert table to valid JSON', () => {
        const result = convertTableToFormat(mockTable, 'json');
        const parsed = JSON.parse(result);
        expect(parsed).toEqual(mockTable);
      });

      it('should be pretty-printed', () => {
        const result = convertTableToFormat(mockTable, 'json');
        expect(result).toContain('\n');
        expect(result).toContain('  ');
      });
    });

    describe('yaml format', () => {
      it('should convert table to YAML', () => {
        const result = convertTableToFormat(mockTable, 'yaml');
        expect(result).toContain('head:');
        expect(result).toContain('vars:');
        expect(result).toContain('body:');
        expect(result).toContain('testIdx: 0');
      });

      it('should include header comment', () => {
        const result = convertTableToFormat(mockTable, 'yaml');
        expect(result).toContain('# Promptfoo Evaluation Results');
      });
    });

    describe('csv format', () => {
      it('should convert table to CSV', () => {
        const result = convertTableToFormat(mockTable, 'csv');
        const lines = result.split('\n');

        // Header row
        expect(lines[0]).toContain('input');
        expect(lines[0]).toContain('expected');
        expect(lines[0]).toContain('[openai:gpt-4] GPT-4');
        expect(lines[0]).toContain('[anthropic:claude] Claude');

        // Data rows
        expect(lines[1]).toContain('hello');
        expect(lines[1]).toContain('[PASS]');
        expect(lines[1]).toContain('[FAIL]');
      });

      it('should escape fields with commas', () => {
        const tableWithComma: EvaluateTable = {
          head: { vars: ['input'], prompts: [] },
          body: [
            {
              testIdx: 0,
              vars: ['hello, world'],
              test: { vars: {} },
              outputs: [],
            },
          ],
        };
        const result = convertTableToFormat(tableWithComma, 'csv');
        expect(result).toContain('"hello, world"');
      });
    });

    describe('txt format', () => {
      it('should convert table to plain text summary', () => {
        const result = convertTableToFormat(mockTable, 'txt');
        expect(result).toContain('PROMPTFOO EVALUATION RESULTS');
        expect(result).toContain('Total Tests: 2');
        expect(result).toContain('Passed:');
        expect(result).toContain('Failed:');
        expect(result).toContain('PROVIDERS:');
        expect(result).toContain('VARIABLES:');
      });

      it('should include summary statistics', () => {
        const result = convertTableToFormat(mockTable, 'txt');
        // 3 passes, 1 fail
        expect(result).toContain('Passed: 3');
        expect(result).toContain('Failed: 1');
      });
    });

    it('should throw for unsupported format', () => {
      expect(() => convertTableToFormat(mockTable, 'invalid' as ExportFormat)).toThrow(
        'Unsupported export format',
      );
    });
  });

  describe('generateDefaultFilename', () => {
    it('should generate filename with timestamp', () => {
      const filename = generateDefaultFilename('json');
      // Timestamp format may include milliseconds: 2025-12-11T22-03-20-508Z
      expect(filename).toMatch(/^promptfoo-results-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.*\.json$/);
    });

    it('should use correct extension for each format', () => {
      expect(generateDefaultFilename('json')).toContain('.json');
      expect(generateDefaultFilename('yaml')).toContain('.yaml');
      expect(generateDefaultFilename('csv')).toContain('.csv');
      expect(generateDefaultFilename('txt')).toContain('.txt');
    });
  });

  describe('exportTableToFile', () => {
    let tempDir: string;

    beforeEach(() => {
      // Create a temp directory for test files
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-export-test-'));
    });

    afterEach(() => {
      // Clean up temp directory
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should write file with correct content', () => {
      const outputPath = path.join(tempDir, 'output.json');
      const result = exportTableToFile(mockTable, 'json', outputPath);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('output.json');
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify content
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.head.vars).toEqual(['input', 'expected']);
    });

    it('should create directory if needed', () => {
      const outputPath = path.join(tempDir, 'subdir', 'output.json');
      const result = exportTableToFile(mockTable, 'json', outputPath);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'subdir'))).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should generate default filename if not provided', () => {
      // Change to temp dir for this test
      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        const result = exportTableToFile(mockTable, 'json');

        expect(result.success).toBe(true);
        expect(result.filePath).toContain('promptfoo-results');
        expect(result.filePath).toContain('.json');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should write different formats correctly', () => {
      const formats: ExportFormat[] = ['json', 'yaml', 'csv', 'txt'];

      for (const format of formats) {
        const outputPath = path.join(tempDir, `output.${format}`);
        const result = exportTableToFile(mockTable, format, outputPath);

        expect(result.success).toBe(true);
        expect(fs.existsSync(outputPath)).toBe(true);
        expect(fs.readFileSync(outputPath, 'utf-8').length).toBeGreaterThan(0);
      }
    });
  });
});
