import { AsyncLocalStorage } from 'node:async_hooks';

import type { RequestHandler } from 'express';

const scriptsDisabled = new AsyncLocalStorage<'over HTTP' | 'for cloud configurations'>();

export function withoutExecutableScripts<T>(run: () => T): T {
  return scriptsDisabled.run('over HTTP', run);
}

export function withCloudScriptPolicy<T>(run: () => T): T {
  return scriptsDisabled.run('for cloud configurations', run);
}

export const blockExecutableScripts: RequestHandler = (_req, _res, next) =>
  withoutExecutableScripts(next);

export function requireLocalCommand(command: string): void {
  const restriction = scriptsDisabled.getStore();
  if (restriction) {
    throw new Error(`Executable prompts and exec providers are disabled ${restriction}`);
  }
  if (!command) {
    throw new Error('No command found in script path');
  }
}
