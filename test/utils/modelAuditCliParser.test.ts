import {
  parseModelAuditArgs,
  validateModelAuditArgs,
  suggestReplacements,
  formatUnsupportedArgsError,
  isValidFormat,
  VALID_MODELAUDIT_OPTIONS,
  DEPRECATED_OPTIONS_MAP,
  type ModelAuditCliOptions,
} from '../../src/utils/modelAuditCliParser';

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
      const deprecated = ['--registry-uri', '--cache-dir', '--stream'];

      const suggestions = suggestReplacements(deprecated);

      expect(suggestions).toEqual({
        '--registry-uri': null,
        '--cache-dir': null,
        '--stream': null,
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
        '--format', '-f',
        '--output', '-o',
        '--verbose', '-v',
        '--quiet', '-q',
        '--blacklist', '-b',
        '--strict',
        '--progress',
        '--sbom',
        '--timeout', '-t',
        '--max-size',
        '--dry-run',
        '--no-cache',
      ];

      expectedOptions.forEach(option => {
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
});