/** Detect capture before loading CLI startup modules. Common options are inert for hooks. */
export function onlineCaptureArgs(argv: readonly string[]): string[] | undefined {
  let command = 0;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--verbose' || arg === '-v') {
      continue;
    }
    if (arg === '--env-file' || arg === '--env-path') {
      index++; // Never interpret an option value as a subcommand or load the file.
      continue;
    }
    if (arg.startsWith('--env-file=') || arg.startsWith('--env-path=')) {
      continue;
    }
    if (command === 0 && arg === 'online') {
      command++;
    } else if (command === 1 && arg === 'capture') {
      return argv.slice(index + 1);
    } else {
      return undefined;
    }
  }
  return undefined;
}
