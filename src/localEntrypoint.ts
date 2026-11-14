/**
 * Development CLI entrypoint used by `npm run local`.
 *
 * Keep the local TypeScript execution path aligned with the shipped entrypoint for
 * structured output before loading the larger CLI graph. Point argv[1] at
 * main.ts so its existing main-module detection still runs.
 */
import { fileURLToPath } from 'node:url';

import { configureCliOutput } from './commands/cliOutput';

configureCliOutput(process.argv.slice(2));

process.argv[1] = fileURLToPath(new URL('./main.ts', import.meta.url));
await import('./main.js');

export {};
