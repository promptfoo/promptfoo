import type {
  CodexDroppedEvent,
  CodexExecutionEventCoverage,
  CodexExecutionHealth,
  CodexProviderError,
  CodexSandboxFailure,
  CodexToolExitCode,
  SkillCallEntry,
} from './codexTypes';

export type {
  CodexDroppedEvent,
  CodexExecutionEventCoverage,
  CodexExecutionHealth,
  CodexProviderError,
  CodexSandboxFailure,
  CodexToolExitCode,
} from './codexTypes';

export interface CodexExecutionHealthInput {
  eventCoverage: CodexExecutionEventCoverage;
  items?: readonly unknown[];
  providerErrors?: readonly CodexProviderError[];
  droppedEvents?: readonly CodexDroppedEvent[];
  sandboxFailures?: readonly CodexSandboxFailure[];
  successfulSkillCalls?: readonly SkillCallEntry[];
}

interface CodexProviderErrorOptions {
  source: CodexProviderError['source'];
  fatal: boolean;
  retryable?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getNestedErrorDetails(
  error: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return asRecord(error.data) ?? asRecord(error.cause);
}

function getErrorInfo(error: Record<string, unknown>): Record<string, unknown> | undefined {
  const errorInfo = error.codexErrorInfo ?? error.codex_error_info;
  if (typeof errorInfo === 'string') {
    return { type: errorInfo };
  }
  const directErrorInfo = asRecord(errorInfo);
  if (directErrorInfo) {
    return directErrorInfo;
  }

  const nestedError = getNestedErrorDetails(error);
  if (!nestedError) {
    return undefined;
  }
  const nestedErrorInfo = nestedError.codexErrorInfo ?? nestedError.codex_error_info;
  return typeof nestedErrorInfo === 'string'
    ? { type: nestedErrorInfo }
    : asRecord(nestedErrorInfo);
}

function getErrorKind(
  error: Record<string, unknown>,
  errorInfo: Record<string, unknown> | undefined,
): string | undefined {
  const explicitType =
    getString(errorInfo?.type) ??
    getString(errorInfo?.kind) ??
    getString(error.kind) ??
    getString(error.errorType);
  if (explicitType) {
    return explicitType;
  }

  if (errorInfo) {
    const variantKeys = Object.keys(errorInfo).filter(
      (key) => key !== 'httpStatusCode' && key !== 'http_status_code',
    );
    if (variantKeys.length === 1) {
      return variantKeys[0];
    }
  }

  return undefined;
}

function getHttpStatusCode(
  error: Record<string, unknown>,
  errorInfo: Record<string, unknown> | undefined,
): number | undefined {
  const nestedError = getNestedErrorDetails(error);
  const errorKind = getErrorKind(error, errorInfo);
  const variantPayload = errorKind ? asRecord(errorInfo?.[errorKind]) : undefined;
  return (
    getNumber(error.httpStatusCode) ??
    getNumber(error.http_status_code) ??
    getNumber(error.statusCode) ??
    getNumber(error.status) ??
    getNumber(nestedError?.httpStatusCode) ??
    getNumber(nestedError?.http_status_code) ??
    getNumber(nestedError?.statusCode) ??
    getNumber(nestedError?.status) ??
    getNumber(errorInfo?.httpStatusCode) ??
    getNumber(errorInfo?.http_status_code) ??
    getNumber(variantPayload?.httpStatusCode) ??
    getNumber(variantPayload?.http_status_code)
  );
}

export function buildCodexProviderError(
  error: unknown,
  options: CodexProviderErrorOptions,
): CodexProviderError {
  const errorRecord = asRecord(error);
  const errorInfo = errorRecord ? getErrorInfo(errorRecord) : undefined;
  const nestedError = errorRecord ? getNestedErrorDetails(errorRecord) : undefined;
  const message =
    getString(errorRecord?.message) ??
    getString(nestedError?.message) ??
    (typeof error === 'string' ? error : undefined);
  const codeValue = errorRecord?.code ?? nestedError?.code;
  const kind = errorRecord
    ? (getErrorKind(nestedError ?? errorRecord, errorInfo) ?? getErrorKind(errorRecord, errorInfo))
    : undefined;
  const httpStatusCode = errorRecord ? getHttpStatusCode(errorRecord, errorInfo) : undefined;

  return {
    source: options.source,
    ...(message ? { message } : {}),
    ...(typeof codeValue === 'string' || typeof codeValue === 'number' ? { code: codeValue } : {}),
    ...(kind ? { kind } : {}),
    ...(httpStatusCode === undefined ? {} : { httpStatusCode }),
    ...(options.retryable === undefined ? {} : { retryable: options.retryable }),
    fatal: options.fatal,
  };
}

export function isCodexSandboxError(error: unknown): boolean {
  const errorRecord = asRecord(error);
  if (!errorRecord) {
    return false;
  }
  if (errorRecord.sandboxFailure === true || errorRecord.sandbox_failure === true) {
    return true;
  }

  const nestedError = getNestedErrorDetails(errorRecord);
  const errorInfo = getErrorInfo(errorRecord);
  const kind =
    getErrorKind(nestedError ?? errorRecord, errorInfo) ?? getErrorKind(errorRecord, errorInfo);
  const rawCode = errorRecord.code ?? nestedError?.code;
  const code = typeof rawCode === 'string' ? rawCode : undefined;
  const normalizedKind = kind?.replace(/[_-]/g, '').toLowerCase();
  const normalizedCode = code?.replace(/[_-]/g, '').toLowerCase();
  return normalizedKind === 'sandboxerror' || normalizedCode === 'sandboxerror';
}

export function buildCodexSandboxFailure(
  error: unknown,
  options: {
    source: CodexSandboxFailure['source'];
    itemId?: string;
    exitCode?: number;
  },
): CodexSandboxFailure | undefined {
  if (!isCodexSandboxError(error)) {
    return undefined;
  }

  const errorRecord = asRecord(error);
  const nestedError = errorRecord ? getNestedErrorDetails(errorRecord) : undefined;
  const codeValue = errorRecord?.code ?? nestedError?.code;
  return {
    source: options.source,
    ...((getString(errorRecord?.message) ?? getString(nestedError?.message))
      ? { message: getString(errorRecord?.message) ?? getString(nestedError?.message) }
      : {}),
    ...(typeof codeValue === 'string' || typeof codeValue === 'number' ? { code: codeValue } : {}),
    ...(options.itemId ? { itemId: options.itemId } : {}),
    ...(options.exitCode === undefined ? {} : { exitCode: options.exitCode }),
  };
}

function getItemId(item: Record<string, unknown>): string | undefined {
  const id = item.id ?? item.itemId ?? item.item_id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

function getItemStatus(item: Record<string, unknown>): string | undefined {
  return getString(item.status);
}

function getItemExitCode(item: Record<string, unknown>): number | undefined {
  return getNumber(item.exitCode) ?? getNumber(item.exit_code);
}

function isCommandExecutionItem(item: Record<string, unknown>): boolean {
  return item.type === 'commandExecution' || item.type === 'command_execution';
}

function getStructuredDroppedEvent(item: Record<string, unknown>): CodexDroppedEvent | undefined {
  const droppedEventCount =
    getNumber(item.droppedEventCount) ?? getNumber(item.dropped_event_count);
  if (droppedEventCount === undefined || droppedEventCount <= 0) {
    return undefined;
  }

  return {
    source: 'event-stream',
    reason: 'reported',
    count: droppedEventCount,
    ...(getItemId(item) ? { itemId: getItemId(item) } : {}),
    ...(getString(item.type) ? { itemType: getString(item.type) } : {}),
  };
}

function getItemProviderError(item: Record<string, unknown>): CodexProviderError | undefined {
  if (item.type !== 'error') {
    return undefined;
  }
  return buildCodexProviderError(item, { source: 'item', fatal: false });
}

function getItemSandboxFailure(item: Record<string, unknown>): CodexSandboxFailure | undefined {
  const structuredError =
    item.sandboxError ??
    item.sandbox_error ??
    item.error ??
    (item.type === 'error' ? item : undefined);
  if (!structuredError) {
    return undefined;
  }
  return buildCodexSandboxFailure(structuredError, {
    source: 'item',
    itemId: getItemId(item),
    exitCode: getItemExitCode(item),
  });
}

function dedupeByJson<T>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = JSON.stringify(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function aggregateDroppedEvents(values: readonly CodexDroppedEvent[]): CodexDroppedEvent[] {
  const aggregated = new Map<string, CodexDroppedEvent>();
  for (const value of values) {
    const identity = JSON.stringify({
      source: value.source,
      reason: value.reason,
      itemId: value.itemId,
      itemType: value.itemType,
    });
    const existing = aggregated.get(identity);
    if (existing) {
      existing.count += value.count;
    } else {
      aggregated.set(identity, { ...value });
    }
  }
  return Array.from(aggregated.values());
}

export function buildCodexExecutionHealth(input: CodexExecutionHealthInput): CodexExecutionHealth {
  const toolExitCodes: CodexToolExitCode[] = [];
  const providerErrors: CodexProviderError[] = [...(input.providerErrors ?? [])];
  const droppedEvents: CodexDroppedEvent[] = [...(input.droppedEvents ?? [])];
  const sandboxFailures: CodexSandboxFailure[] = [...(input.sandboxFailures ?? [])];

  for (const value of input.items ?? []) {
    const item = asRecord(value);
    if (!item) {
      continue;
    }

    if (isCommandExecutionItem(item)) {
      const exitCode = getItemExitCode(item);
      if (exitCode !== undefined) {
        toolExitCodes.push({
          ...(getItemId(item) ? { itemId: getItemId(item) } : {}),
          ...(getItemStatus(item) ? { status: getItemStatus(item) } : {}),
          exitCode,
        });
      }
    }

    const itemProviderError = getItemProviderError(item);
    if (itemProviderError) {
      providerErrors.push(itemProviderError);
    }
    const structuredDroppedEvent = getStructuredDroppedEvent(item);
    if (structuredDroppedEvent) {
      droppedEvents.push(structuredDroppedEvent);
    }
    const itemSandboxFailure = getItemSandboxFailure(item);
    if (itemSandboxFailure) {
      sandboxFailures.push(itemSandboxFailure);
    }
  }

  return {
    schemaVersion: 1,
    eventCoverage: input.eventCoverage,
    toolExitCodes: dedupeByJson(toolExitCodes),
    providerErrors: dedupeByJson(providerErrors),
    droppedEvents: aggregateDroppedEvents(droppedEvents),
    sandboxFailures: dedupeByJson(sandboxFailures),
    successfulSkillCalls: dedupeByJson(input.successfulSkillCalls ?? []),
  };
}
