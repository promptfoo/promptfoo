// Lightweight argv parser used by src/entrypoint.ts to decide whether to pre-suppress
// logger output before main.ts loads. Lives in its own module so that:
//   - The entrypoint stays free of test imports (it has top-level side effects).
//   - The detector is unit-testable in isolation.
//
// Must stay in sync with the flag set on `code-scans run` in src/codeScan/commands/run.ts.

const CODE_SCANS_RUN_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--api-key',
  '--base',
  '--compare',
  '-c',
  '--config',
  '--api-host',
  '--github-pr',
  '--min-severity',
  '--minimum-severity',
  '--guidance',
  '--guidance-file',
  '--env-file',
  '--env-path',
]);

/**
 * Detect whether `code-scans run` is being invoked with structured output (`--json`,
 * `--format json`, `--format sarif`, `-f json`, `-f sarif`, or their `=value` forms).
 *
 * Mirrors Commander's "last wins" semantics for repeated --format, so we track all
 * candidates across the argv and decide at the end rather than returning eagerly.
 */
export function requestsStructuredCodeScanOutput(argv: readonly string[]): boolean {
  const codeScansIndex = argv.indexOf('code-scans');
  if (codeScansIndex === -1 || argv[codeScansIndex + 1] !== 'run') {
    return false;
  }

  let jsonFlag = false;
  let lastFormat: string | undefined;

  for (let index = codeScansIndex + 2; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') {
      // Conventional positional separator; nothing past it is a flag.
      break;
    }
    if (arg === '--json') {
      jsonFlag = true;
      continue;
    }
    if (arg === '--format' || arg === '-f') {
      lastFormat = argv[index + 1];
      // Skip the value so we don't misread it as another flag.
      index++;
      continue;
    }
    if (arg.startsWith('--format=') || arg.startsWith('-f=')) {
      lastFormat = arg.slice(arg.indexOf('=') + 1);
      continue;
    }
    // Commander also accepts a combined short form for one-character flags: `-fsarif`
    // is equivalent to `-f sarif`. Match it explicitly so structured-output detection
    // stays aligned with the parser the actual command uses.
    if (arg.startsWith('-f') && arg.length > 2 && arg[2] !== '=') {
      lastFormat = arg.slice(2);
      continue;
    }
    if (CODE_SCANS_RUN_VALUE_FLAGS.has(arg)) {
      // Skip the value so a literal like `--base --json` doesn't trip the loop.
      index++;
    }
  }

  if (jsonFlag) {
    return true;
  }
  return lastFormat === 'json' || lastFormat === 'sarif';
}
