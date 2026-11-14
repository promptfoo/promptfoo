import { requestsStructuredCodeScanOutput } from '../codeScan/util/structuredOutputDetect';

// Run before importing main so startup and shutdown logs use the same stream.
export function configureCliOutput(argv: readonly string[]): void {
  if (requestsStructuredCodeScanOutput(argv)) {
    Object.assign(process.env, { LOG_LEVEL: 'error', PROMPTFOO_LOG_TO_STDERR: 'true' });
    return;
  }

  const positionals: string[] = [];
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      break;
    }
    if (arg === '--env-file' || arg === '--env-path' || arg === '-n') {
      i++;
    } else if (arg === '--json') {
      json = true;
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  if (
    json &&
    positionals[0] === 'list' &&
    ['evals', 'prompts', 'datasets'].includes(positionals[1])
  ) {
    Object.assign(process.env, { PROMPTFOO_LOG_TO_STDERR: 'true' });
  }
}
