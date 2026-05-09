import { describe, expect, it } from 'vitest';
import { requestsStructuredCodeScanOutput } from '../../../src/codeScan/util/structuredOutputDetect';

const node = 'node';
const cli = '/path/to/main.js';

function argv(...rest: string[]): string[] {
  return [node, cli, ...rest];
}

describe('requestsStructuredCodeScanOutput', () => {
  it('returns false when the subcommand is not code-scans run', () => {
    expect(requestsStructuredCodeScanOutput(argv())).toBe(false);
    expect(requestsStructuredCodeScanOutput(argv('eval', '--json'))).toBe(false);
    expect(requestsStructuredCodeScanOutput(argv('code-scans'))).toBe(false);
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'list', '--json'))).toBe(false);
  });

  it('detects --json on code-scans run', () => {
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '.', '--json'))).toBe(true);
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--json', '.'))).toBe(true);
  });

  it('detects --format sarif and --format json (space-separated)', () => {
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--format', 'sarif'))).toBe(
      true,
    );
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--format', 'json'))).toBe(
      true,
    );
  });

  it('detects -f sarif and -f json (short alias, space-separated)', () => {
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '-f', 'sarif'))).toBe(true);
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '-f', 'json'))).toBe(true);
  });

  it('detects --format=value and -f=value (equals form)', () => {
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--format=sarif'))).toBe(
      true,
    );
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--format=json'))).toBe(true);
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '-f=sarif'))).toBe(true);
  });

  it('detects -fsarif and -fjson (Commander combined short form)', () => {
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '-fsarif'))).toBe(true);
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '-fjson'))).toBe(true);
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '-ftext'))).toBe(false);
  });

  it('returns false for --format text (the default)', () => {
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--format', 'text'))).toBe(
      false,
    );
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--format=text'))).toBe(
      false,
    );
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '-f', 'text'))).toBe(false);
  });

  it('still detects --json after a non-structured --format text', () => {
    // Regression: an earlier implementation returned eagerly on --format and missed
    // a later --json. Matters because Commander allows redundant flags.
    expect(
      requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--format', 'text', '--json')),
    ).toBe(true);
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '-f=text', '--json'))).toBe(
      true,
    );
  });

  it('detects the latest format when multiple --format flags appear', () => {
    expect(
      requestsStructuredCodeScanOutput(
        argv('code-scans', 'run', '--format', 'text', '--format', 'sarif'),
      ),
    ).toBe(true);
    expect(
      requestsStructuredCodeScanOutput(
        argv('code-scans', 'run', '--format=sarif', '--format=text'),
      ),
    ).toBe(false);
  });

  it("does not misinterpret a value-eating flag's argument as a structured-output flag", () => {
    // `--base --json` — the literal `--json` is the value of `--base`, not a real flag.
    expect(
      requestsStructuredCodeScanOutput(argv('code-scans', 'run', '.', '--base', '--json')),
    ).toBe(false);
    expect(
      requestsStructuredCodeScanOutput(argv('code-scans', 'run', '.', '--config', '--format')),
    ).toBe(false);
  });

  it('stops scanning at the conventional `--` positional separator', () => {
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '.', '--', '--json'))).toBe(
      false,
    );
  });

  it('returns false for a bare --format with no value', () => {
    expect(requestsStructuredCodeScanOutput(argv('code-scans', 'run', '--format'))).toBe(false);
  });
});
