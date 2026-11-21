import { AsyncLocalStorage } from 'node:async_hooks';

import type { RequestHandler } from 'express';

const scriptsDisabled = new AsyncLocalStorage<boolean>();

export function withoutExecutableScripts<T>(run: () => T): T {
  return scriptsDisabled.run(true, run);
}

export const blockExecutableScripts: RequestHandler = (_req, _res, next) =>
  withoutExecutableScripts(next);

export function requireLocalCommand(command: string): void {
  if (scriptsDisabled.getStore()) {
    throw new Error('Executable prompts and exec providers are disabled over HTTP');
  }
  if (!command) {
    throw new Error('No command found in script path');
  }
}
