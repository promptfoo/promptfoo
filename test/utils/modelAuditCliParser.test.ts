import { describe, expect, it } from 'vitest';
import {
  DEPRECATED_OPTIONS_MAP,
  formatUnsupportedArgsError,
  isValidFormat,
  type ModelAuditCliOptions,
  parseModelAuditArgs,
  safeValidateModelAuditOptions,
  suggestReplacements,
  VALID_MODELAUDIT_OPTIONS,
  validateModelAuditArgs,
  validateModelAuditOptions,
} from '../../src/util/modelAuditCliParser';

describe('ModelAudit CLI Parser', () => {
  describe('parseModelAuditArgs', () => {
    it('should parse basic options correctly', () => {
      const paths = ['model.pkl'];
      const options: ModelAuditCliOptions = {
        format: 'json',
        verbose: true,
        timeout: 300,
      };

      const result = parseModelAuditArgs(paths, options);

      expect(result.args).toEqual([
        'scan',
        'model.pkl',
        '--format',
        'json',
        '--verbose',
        '--timeout',
        '300',
      ]);
      expect(result.unsupportedOptions).toEqual([]);
    });

    it('should handle multiple blacklist patterns', () => {
      const paths = ['model.pkl'];
      const options: ModelAuditCliOptions = {
        blacklist: ['pattern1', 'pattern2', 'pattern3'],
      };

      const result = parseModelAuditArgs(paths, options);

      expect(result.args).toEqual([
        'scan',
        'model.pkl',
        '--blacklist',
        'pattern1',
        '--blacklist',
        'pattern2',
        '--blacklist',
        'pattern3',
      ]);
    });

    it('should handle multiple paths', () => {
      const paths = ['model1.pkl', 'model2.h5', 'model3.onnx'];
      const options: ModelAuditCliOptions = {
        format: 'sarif',
      };

      const result = parseModelAuditArgs(paths, options);

      expect(result.args).toEqual([
        'scan',
        'model1.pkl',
        'model2.h5',
        'model3.onnx',
        '--format',
        'sarif',
      ]);
    });

    it('should handle all supported options', () => {
      const paths = ['model.pkl'];
      const options: ModelAuditCliOptions = {
        blacklist: ['unsafe'],
        format: 'json',
        output: 'results.json',
        verbose: true,
        quiet: false, // Should not add --quiet
        strict: true,
        progress: true,
        sbom: 'sbom.json',
        timeout: 600,
        maxSize: '1GB',
        dryRun: true,
        cache: false, // Should add --no-cache
      };

      const result = parseModelAuditArgs(paths, options);

      const expectedArgs = [
        'scan',
        'model.pkl',
        '--blacklist',
        'unsafe',
        '--format',
        'json',
        '--output',
        'results.json',
        '--verbose',
        '--strict',
        '--progress',
        '--sbom',
        'sbom.json',
        '--timeout',
        '600',
        '--max-size',
        '1GB',
        '--dry-run',
        '--no-cache',
      ];

      expect(result.args).toEqual(expectedArgs);
    });

    it('should not add flags for falsy values', () => {
      const paths = ['model.pkl'];
      const options: ModelAuditCliOptions = {
        verbose: false,
        quiet: false,
        strict: false,
        progress: false,
        dryRun: false,
        cache: true, // Should not add --no-cache
      };

      const result = parseModelAuditArgs(paths, options);

      expect(result.args).toEqual(['scan', 'model.pkl']);
    });
  });

  describe('validateModelAuditArgs', () => {
    it('should validate supported arguments', () => {
      const args = [
        'scan',
        'model.pkl',
        '--format',
        'json',
        '--verbose',
        '--timeout',
        '300',
        '--max-size',
        '1GB',
      ];

      const result = validateModelAuditArgs(args);

      expect(result.valid).toBe(true);
      expect(result.unsupportedArgs).toEqual([]);
    });

    it('should detect unsupported arguments', () => {
      const args = [
        'scan',
        'model.pkl',
        '--format',
        'json',
        '--max-file-size', // Unsupported
        '1000000',
        '--registry-uri', // Unsupported
        'http://mlflow:5000',
        '--preview', // Unsupported
      ];

      const result = validateModelAuditArgs(args);

      expect(result.valid).toBe(false);
      expect(result.unsupportedArgs).toEqual(['--max-file-size', '--registry-uri', '--preview']);
    });

    it('should ignore non-option arguments', () => {
      const args = [
        'scan',
        'model.pkl',
        'another-model.h5',
        '--format',
        'json',
        'output-value',
        '--verbose',
      ];

      const result = validateModelAuditArgs(args);

      expect(result.valid).toBe(true);
      expect(result.unsupportedArgs).toEqual([]);
    });
  });

  describe('suggestReplacements', () => {
    it('should suggest replacements for deprecated options', () => {
      const deprecated = ['--max-file-size', '--preview', '--strict-license'];

      const suggestions = suggestReplacements(deprecated);

      expect(suggestions).toEqual({
        '--max-file-size': '--max-size',
        '--preview': '--dry-run',
        '--strict-license': '--strict',
      });
    });

    it('should return null for options with no replacement', () => {
      const deprecated = ['--registry-uri', '--cache-dir'];

      const suggestions = suggestReplacements(deprecated);

      expect(suggestions).toEqual({
        '--registry-uri': null,
        '--cache-dir': null,
      });
    });

    it('should handle unknown deprecated options', () => {
      const deprecated = ['--unknown-option'];

      const suggestions = suggestReplacements(deprecated);

      expect(suggestions).toEqual({});
    });
  });

  describe('formatUnsupportedArgsError', () => {
    it('should return empty string for no unsupported args', () => {
      const result = formatUnsupportedArgsError([]);
      expect(result).toBe('');
    });

    it('should format error with replacements', () => {
      const unsupported = ['--max-file-size', '--preview'];

      const result = formatUnsupportedArgsError(unsupported);

      expect(result).toContain('Unsupported ModelAudit arguments: --max-file-size, --preview');
      expect(result).toContain('Suggested replacements:');
      expect(result).toContain('--max-file-size → --max-size');
      expect(result).toContain('--preview → --dry-run');
    });

    it('should format error with no replacements', () => {
      const unsupported = ['--registry-uri', '--cache-dir'];

      const result = formatUnsupportedArgsError(unsupported);

      expect(result).toContain('Unsupported ModelAudit arguments: --registry-uri, --cache-dir');
      expect(result).toContain('No replacement available for: --registry-uri, --cache-dir');
      expect(result).toContain('handled automatically by modelaudit or use environment variables');
    });

    it('should format error with mixed replacements', () => {
      const unsupported = ['--max-file-size', '--registry-uri'];

      const result = formatUnsupportedArgsError(unsupported);

      expect(result).toContain('Suggested replacements:');
      expect(result).toContain('--max-file-size → --max-size');
      expect(result).toContain('No replacement available for: --registry-uri');
    });
  });

  describe('isValidFormat', () => {
    it('should validate correct formats', () => {
      expect(isValidFormat('text')).toBe(true);
      expect(isValidFormat('json')).toBe(true);
      expect(isValidFormat('sarif')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidFormat('xml')).toBe(false);
      expect(isValidFormat('yaml')).toBe(false);
      expect(isValidFormat('')).toBe(false);
      expect(isValidFormat('TEXT')).toBe(false); // Case sensitive
    });
  });

  describe('Constants', () => {
    it('should have correct valid options', () => {
      const expectedOptions = [
        '--format',
        '-f',
        '--output',
        '-o',
        '--verbose',
        '-v',
        '--quiet',
        '-q',
        '--blacklist',
        '-b',
        '--strict',
        '--progress',
        '--sbom',
        '--timeout',
        '-t',
        '--max-size',
        '--dry-run',
        '--no-cache',
        '--stream',
      ];

      expectedOptions.forEach((option) => {
        expect(VALID_MODELAUDIT_OPTIONS.has(option)).toBe(true);
      });
    });

    it('should have correct deprecated options mapping', () => {
      expect(DEPRECATED_OPTIONS_MAP['--max-file-size']).toBe('--max-size');
      expect(DEPRECATED_OPTIONS_MAP['--preview']).toBe('--dry-run');
      expect(DEPRECATED_OPTIONS_MAP['--strict-license']).toBe('--strict');
      expect(DEPRECATED_OPTIONS_MAP['--registry-uri']).toBeNull();
      expect(DEPRECATED_OPTIONS_MAP['--cache-dir']).toBeNull();
    });
  });

  describe('Zod Schema Validation', () => {
    describe('validateModelAuditOptions', () => {
      it('should validate correct options', () => {
        const validOptions = {
          format: 'json',
          verbose: true,
          timeout: 300,
          maxSize: '1GB',
        };

        expect(() => validateModelAuditOptions(validOptions)).not.toThrow();
        const result = validateModelAuditOptions(validOptions);
        expect(result.format).toBe('json');
        expect(result.verbose).toBe(true);
        expect(result.timeout).toBe(300);
        expect(result.maxSize).toBe('1GB');
      });

      it('should reject invalid format', () => {
        const invalidOptions = {
          format: 'xml',
        };

        expect(() => validateModelAuditOptions(invalidOptions)).toThrow();
      });

      it('should reject invalid timeout', () => {
        const invalidOptions = {
          timeout: -1,
        };

        expect(() => validateModelAuditOptions(invalidOptions)).toThrow();
      });

      it('should reject invalid maxSize format', () => {
        const invalidOptions = {
          maxSize: 'invalid-size',
        };

        expect(() => validateModelAuditOptions(invalidOptions)).toThrow();
      });

      it('should accept valid maxSize formats', () => {
        const validSizes = [
          '1GB',
          '500MB',
          '1.5GB',
          '100KB',
          '1024B',
          '1 GB',
          '500 MB',
          ' 1GB ',
          '2.5 TB',
        ];

        for (const size of validSizes) {
          expect(() => validateModelAuditOptions({ maxSize: size })).not.toThrow();
        }
      });
    });

    describe('safeValidateModelAuditOptions', () => {
      it('should return success for valid options', () => {
        const validOptions = {
          format: 'sarif',
          strict: true,
        };

        const result = safeValidateModelAuditOptions(validOptions);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validOptions);
        expect(result.error).toBeUndefined();
      });

      it('should return error for invalid options', () => {
        const invalidOptions = {
          format: 'invalid-format',
          timeout: -5,
        };

        const result = safeValidateModelAuditOptions(invalidOptions);
        expect(result.success).toBe(false);
        expect(result.data).toBeUndefined();
        expect(result.error).toBeDefined();
        expect(result.error?.issues).toHaveLength(2); // format and timeout errors
      });

      it('should handle empty options', () => {
        const result = safeValidateModelAuditOptions({});
        expect(result.success).toBe(true);
        expect(result.data).toEqual({});
      });
    });

    describe('parseModelAuditArgs with invalid input', () => {
      it('should throw on invalid options passed to parseModelAuditArgs', () => {
        const paths = ['model.pkl'];
        const invalidOptions = {
          format: 'xml', // Invalid format
          timeout: -1, // Invalid timeout
        };

        expect(() => parseModelAuditArgs(paths, invalidOptions)).toThrow();
      });
    });
  });
});
