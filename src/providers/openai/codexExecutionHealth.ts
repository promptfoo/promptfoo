import type {
  CodexDroppedEvent,
  CodexExecutionHealth,
  CodexProviderError,
  CodexToolExitCode,
} from './codexTypes';

export type {
  CodexDroppedEvent,
  CodexExecutionHealth,
  CodexProviderError,
  CodexToolExitCode,
} from './codexTypes';

export interface CodexExecutionHealthInput {
  items?: readonly unknown[];
  providerError?: CodexProviderError;
  droppedEvents?: readonly CodexDroppedEvent[];
  sandboxFailure?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getErrorRecords(error: unknown): Record<string, unknown>[] {
  const root = asRecord(error);
  if (!root) {
    return [];
  }
  const data = asRecord(root.data);
  const cause = asRecord(root.cause);
  const hasCodexEnvelope = (record: Record<string, unknown>) =>
    record.codexErrorInfo !== undefined || record.codex_error_info !== undefined;
  const isErrorCause =
    root.cause instanceof Error ||
    (cause !== undefined &&
      (typeof cause.message === 'string' ||
        (typeof cause.name === 'string' && cause.name.toLowerCase().endsWith('error'))));

  return [
    root,
    ...(data && hasCodexEnvelope(data) ? [data] : []),
    ...(cause && isErrorCause ? [cause] : []),
  ];
}

/** Extract only protocol fields. Error prose is deliberately ignored. */
export function getCodexProviderError(error: unknown): CodexProviderError | undefined {
  const records = getErrorRecords(error);
  const errorInfoValue = records
    .map((record) => record.codexErrorInfo ?? record.codex_error_info)
    .find((value) => value !== undefined);
  const errorInfo = asRecord(errorInfoValue);
  const variantKeys = Object.keys(errorInfo ?? {}).filter(
    (key) => !['type', 'kind', 'httpStatusCode', 'http_status_code'].includes(key),
  );
  const kindFromVariant = variantKeys.length === 1 ? variantKeys[0] : undefined;
  const kind =
    (typeof errorInfoValue === 'string' ? errorInfoValue : undefined) ??
    (typeof errorInfo?.type === 'string' ? errorInfo.type : undefined) ??
    (typeof errorInfo?.kind === 'string' ? errorInfo.kind : undefined) ??
    records
      .map((record) => record.kind ?? record.errorType)
      .find((value) => typeof value === 'string') ??
    kindFromVariant;
  const variant = kind ? asRecord(errorInfo?.[kind]) : undefined;
  const code = records
    .map((record) => record.code)
    .find(
      (value): value is string | number => typeof value === 'string' || typeof value === 'number',
    );
  const httpStatusCode = [
    ...records.flatMap((record) => [
      record.httpStatusCode,
      record.http_status_code,
      record.statusCode,
      record.status,
    ]),
    errorInfo?.httpStatusCode,
    errorInfo?.http_status_code,
    variant?.httpStatusCode,
    variant?.http_status_code,
  ]
    .map(getNumber)
    .find((value) => value !== undefined);

  if (code === undefined && kind === undefined && httpStatusCode === undefined) {
    return undefined;
  }
  return {
    ...(code === undefined ? {} : { code }),
    ...(kind === undefined ? {} : { kind }),
    ...(httpStatusCode === undefined ? {} : { httpStatusCode }),
  };
}

export function isCodexSandboxError(error: unknown): boolean {
  const providerError = getCodexProviderError(error);
  return [providerError?.code, providerError?.kind].some(
    (value) =>
      typeof value === 'string' && value.replace(/[_-]/g, '').toLowerCase() === 'sandboxerror',
  );
}

export function buildCodexExecutionHealth(
  input: CodexExecutionHealthInput = {},
): CodexExecutionHealth {
  const toolExitCodes: CodexToolExitCode[] = [];
  for (const value of input.items ?? []) {
    const item = asRecord(value);
    if (!item || item.type !== 'command_execution') {
      continue;
    }
    const exitCode = getNumber(item.exit_code);
    if (exitCode !== undefined) {
      const rawItemId = item.id;
      toolExitCodes.push({
        ...(typeof rawItemId === 'string' || typeof rawItemId === 'number'
          ? { itemId: String(rawItemId) }
          : {}),
        exitCode,
      });
    }
  }

  return {
    schemaVersion: 1,
    toolExitCodes,
    ...(input.providerError ? { providerError: input.providerError } : {}),
    droppedEvents: [...(input.droppedEvents ?? [])],
    sandboxFailure: input.sandboxFailure === true,
  };
}
