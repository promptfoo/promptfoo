import { AsyncLocalStorage } from 'node:async_hooks';

type LogRedactor = (message: string) => string;

const logRedactionStorage = new AsyncLocalStorage<LogRedactor>();

export function withLogRedaction<T>(redactor: LogRedactor, callback: () => T): T {
  const inheritedRedactor = logRedactionStorage.getStore();
  const combinedRedactor = inheritedRedactor
    ? (message: string) => redactor(inheritedRedactor(message))
    : redactor;
  return logRedactionStorage.run(combinedRedactor, callback);
}

export function redactLogMessage(message: string): string {
  return logRedactionStorage.getStore()?.(message) ?? message;
}
