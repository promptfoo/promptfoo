import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleJavascript } from '../src/assertions/javascript';
import cliState from '../src/cliState';
import { evalCommand } from '../src/commands/eval';
import { isSafeMode, SafeModeError } from '../src/util/safeMode';
import { TransformInputType, transform } from '../src/util/transform';
import { mockProcessEnv } from './util/utils';

import type { Assertion, AssertionParams, AtomicTestCase } from '../src/types/index';

function makeAssertionParams(overrides: Partial<AssertionParams> = {}): AssertionParams {
  const assertion: Assertion = overrides.assertion ?? {
    type: 'javascript',
    value: 'output === "correct"',
  };
  return {
    assertion,
    baseType: 'javascript',
    renderedValue: typeof assertion.value === 'string' ? assertion.value : undefined,
    assertionValueContext: {} as any,
    outputString: 'correct',
    output: 'correct',
    inverse: false,
    providerResponse: { output: 'correct' },
    test: {} as AtomicTestCase,
    ...overrides,
  };
}

vi.mock('../src/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Safe Mode', () => {
  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    cliState.safeMode = undefined;
    restoreEnv = mockProcessEnv({ PROMPTFOO_SAFE_MODE: undefined });
  });

  afterEach(() => {
    cliState.safeMode = undefined;
    restoreEnv?.();
    vi.clearAllMocks();
  });

  describe('isSafeMode helper & precedence', () => {
    it('returns false by default when neither CLI flag nor env var is set', () => {
      expect(isSafeMode()).toBe(false);
    });

    it('returns true when cliState.safeMode is enabled via CLI flag', () => {
      cliState.safeMode = true;
      expect(isSafeMode()).toBe(true);
    });

    it('returns true when PROMPTFOO_SAFE_MODE is set in process.env', () => {
      restoreEnv?.();
      restoreEnv = mockProcessEnv({ PROMPTFOO_SAFE_MODE: 'true' });
      expect(isSafeMode()).toBe(true);
    });

    it('handles truthy string variants for PROMPTFOO_SAFE_MODE', () => {
      for (const val of ['1', 'true', 'yes', 'yup', 'yeppers']) {
        restoreEnv?.();
        restoreEnv = mockProcessEnv({ PROMPTFOO_SAFE_MODE: val });
        expect(isSafeMode()).toBe(true);
      }
    });

    it('returns false when PROMPTFOO_SAFE_MODE is explicitly falsy', () => {
      for (const val of ['0', 'false', 'no']) {
        restoreEnv?.();
        restoreEnv = mockProcessEnv({ PROMPTFOO_SAFE_MODE: val });
        expect(isSafeMode()).toBe(false);
      }
    });

    it('returns true when suite/config environment opts into safe mode', () => {
      cliState.withEnv({ PROMPTFOO_SAFE_MODE: 'true' }, () => {
        expect(isSafeMode()).toBe(true);
      });
    });

    it('enforces anti-tamper precedence: config.env cannot disable safe mode if enabled via process.env', () => {
      restoreEnv?.();
      restoreEnv = mockProcessEnv({ PROMPTFOO_SAFE_MODE: 'true' });
      // Malicious or untrusted config attempting to disable safe mode
      cliState.withEnv({ PROMPTFOO_SAFE_MODE: 'false' }, () => {
        expect(isSafeMode()).toBe(true);
      });
    });

    it('enforces anti-tamper precedence: config.env cannot disable safe mode if enabled via CLI flag', () => {
      cliState.safeMode = true;
      // Malicious or untrusted config attempting to disable safe mode
      cliState.withEnv({ PROMPTFOO_SAFE_MODE: 'false' }, () => {
        expect(isSafeMode()).toBe(true);
      });
    });
  });

  it('isolates overlapping async scopes and preserves an enabled outer scope', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const enabled = cliState.withSafeMode(true, async () => {
      await gate;
      expect(isSafeMode()).toBe(true);
      await cliState.withSafeMode(false, async () => {
        expect(isSafeMode()).toBe(true);
      });
    });
    await cliState.withSafeMode(false, async () => {
      expect(isSafeMode()).toBe(false);
      release();
      await enabled;
      expect(isSafeMode()).toBe(false);
    });
    expect(isSafeMode()).toBe(false);
  });

  describe('transform function under safe mode', () => {
    it('allows inline string transform when safe mode is off', async () => {
      const output = 'hello world';
      const context = { vars: {}, prompt: { id: 'test' } };
      const result = await transform('output.toUpperCase()', output, context);
      expect(result).toBe('HELLO WORLD');
    });

    it('throws SafeModeError when evaluating inline string transform in safe mode', async () => {
      cliState.safeMode = true;
      const output = 'hello world';
      const context = { vars: {}, prompt: { id: 'test' } };

      await expect(transform('output.toUpperCase()', output, context)).rejects.toThrow(
        SafeModeError,
      );
      await expect(transform('output.toUpperCase()', output, context)).rejects.toThrow(
        /Inline JavaScript execution is disabled in safe mode/i,
      );
    });

    it('allows direct function transforms even in safe mode', async () => {
      cliState.safeMode = true;
      const output = 'hello world';
      const context = { vars: {}, prompt: { id: 'test' } };
      const directFn = (val: unknown) => String(val).toUpperCase();

      const result = await transform(directFn, output, context);
      expect(result).toBe('HELLO WORLD');
    });

    it('blocks vars transform with inline code in safe mode', async () => {
      cliState.safeMode = true;
      const vars = { key: 'value' };
      const context = { vars: {}, prompt: {} };

      await expect(
        transform('JSON.stringify(vars)', vars, context, true, TransformInputType.VARS),
      ).rejects.toThrow(SafeModeError);
    });
  });

  describe('javascript assertions under safe mode', () => {
    it('allows inline JS assertion when safe mode is off', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'output === "correct"',
      };

      const result = await handleJavascript(
        makeAssertionParams({
          assertion,
          renderedValue: assertion.value as string,
          outputString: 'correct',
          output: 'correct',
        }),
      );

      expect(result).toMatchObject({
        pass: true,
        score: 1,
      });
    });

    it('fails inline JS assertion with SafeMode reason when safe mode is on', async () => {
      cliState.safeMode = true;
      const assertion: Assertion = {
        type: 'javascript',
        value: 'output === "correct"',
      };

      const result = await handleJavascript(
        makeAssertionParams({
          assertion,
          renderedValue: assertion.value as string,
          outputString: 'correct',
          output: 'correct',
        }),
      );

      expect(result).toMatchObject({
        pass: false,
        score: 0,
      });
      expect(result.reason).toContain('Inline JavaScript execution is disabled in safe mode');
      expect(result.reason).toContain('file://');
    });

    it('allows direct function assertions even when safe mode is on', async () => {
      cliState.safeMode = true;
      const assertion: Assertion = {
        type: 'javascript',
        value: ((output: string) => output === 'correct') as any,
      };

      const result = await handleJavascript(
        makeAssertionParams({
          assertion,
          renderedValue: undefined,
          outputString: 'correct',
          output: 'correct',
        }),
      );

      expect(result).toMatchObject({
        pass: true,
        score: 1,
      });
    });

    it('allows file-based script assertions when safe mode is on', async () => {
      cliState.safeMode = true;
      const assertion: Assertion = {
        type: 'javascript',
        value: 'file://someScript.js',
      };

      // When loaded from file, valueFromScript is provided by the assertion loader
      const result = await handleJavascript(
        makeAssertionParams({
          assertion,
          renderedValue: 'file://someScript.js',
          valueFromScript: true,
          outputString: 'any',
          output: 'any',
        }),
      );

      expect(result).toMatchObject({
        pass: true,
        score: 1,
      });
    });
  });

  describe('eval command CLI options', () => {
    it('registers --safe-mode option on eval command', () => {
      const program = new Command();
      const cmd = evalCommand(program, {}, undefined);
      const options = cmd.options.map((opt) => opt.long);

      expect(options).toContain('--safe-mode');
      expect(cmd.helpInformation()).toContain('--safe-mode');
    });
  });
});
