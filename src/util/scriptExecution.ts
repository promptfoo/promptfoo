import { AsyncLocalStorage } from 'node:async_hooks';

const scriptsDisabled = new AsyncLocalStorage<boolean>();

export function withoutExecutableScripts<T>(run: () => T): T {
  return scriptsDisabled.run(true, run);
}

export function requireLocalCommand(command: string): void {
  if (scriptsDisabled.getStore()) {
    throw new Error('Executable prompts and exec providers require the CLI or Node.js library');
  }
  if (!command) {
    throw new Error('No command found in script path');
  }
}
