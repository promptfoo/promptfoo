/**
 * Development CLI entrypoint used by `npm run local`.
 *
 * Keep the local TypeScript execution path aligned with the shipped entrypoint for
 * structured code-scan output: mute logs before main.ts imports the larger CLI graph,
 * then point argv[1] at main.ts so its existing main-module detection still runs.
 */
import { fileURLToPath } from 'node:url';

import { requestsStructuredCodeScanOutput } from './codeScan/util/structuredOutputDetect';
import { onlineCaptureArgs } from './commands/online/captureArgs';

if (requestsStructuredCodeScanOutput(process.argv.slice(2))) {
  // Match the shipped entrypoint: quiet the logger AND route whatever it still
  // emits (error-level survives LOG_LEVEL=error) to stderr, so it cannot corrupt
  // the SARIF/JSON payload on stdout.
  Object.assign(process.env, { LOG_LEVEL: 'error', PROMPTFOO_LOG_TO_STDERR: 'true' });
}

// Hook capture must not load project configuration, dotenv, telemetry or the database.
const captureArgs = onlineCaptureArgs(process.argv.slice(2));
if (captureArgs) {
  const { runCapture } = await import('./commands/online/capture.js');
  await runCapture(captureArgs);
} else {
  process.argv[1] = fileURLToPath(new URL('./main.ts', import.meta.url));
  await import('./main.js');
}

export {};
