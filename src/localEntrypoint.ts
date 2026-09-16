/**
 * Development CLI entrypoint used by `npm run local`.
 *
 * Keep the local TypeScript execution path aligned with the shipped entrypoint for
 * structured code-scan output: mute logs before main.ts imports the larger CLI graph,
 * then point argv[1] at main.ts so its existing main-module detection still runs.
 */
import { fileURLToPath } from 'node:url';

import { requestsStructuredCodeScanOutput } from './codeScan/util/structuredOutputDetect';

if (requestsStructuredCodeScanOutput(process.argv.slice(2))) {
  // Match the shipped entrypoint: quiet the logger AND route whatever it still
  // emits (error-level survives LOG_LEVEL=error) to stderr, so it cannot corrupt
  // the SARIF/JSON payload on stdout.
  Object.assign(process.env, { LOG_LEVEL: 'error', PROMPTFOO_LOG_TO_STDERR: 'true' });
}

process.argv[1] = fileURLToPath(new URL('./main.ts', import.meta.url));
await import('./main.js');

export {};
