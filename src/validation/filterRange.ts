export interface FilterRange {
  end?: number;
  start: number;
}

function parseRangeBound(raw: string, option: string): number | undefined {
  if (raw === '') {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`--filter-range bounds must be safe integers, got: ${option}`);
  }
  return value;
}

function isDigitString(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

export function parseFilterRange(option: string): FilterRange {
  const trimmed = option.trim();
  const separatorIndex = trimmed.indexOf(':');
  const hasSingleSeparator = separatorIndex !== -1 && separatorIndex === trimmed.lastIndexOf(':');

  const startRaw = hasSingleSeparator ? trimmed.slice(0, separatorIndex).trim() : '';
  const endRaw = hasSingleSeparator ? trimmed.slice(separatorIndex + 1).trim() : '';

  if (
    !hasSingleSeparator ||
    (startRaw === '' && endRaw === '') ||
    !isDigitString(startRaw) ||
    !isDigitString(endRaw)
  ) {
    throw new Error(
      `--filter-range must be specified in start:end format using zero-based indices, got: ${option}`,
    );
  }

  const start = parseRangeBound(startRaw, option) ?? 0;
  const end = parseRangeBound(endRaw, option);
  if (end !== undefined && start > end) {
    throw new Error(`--filter-range start must be less than or equal to end, got: ${option}`);
  }

  return { start, end };
}

export function filterByRange<T>(
  items: T[],
  option: string | undefined,
  onEmpty?: (option: string, originalCount: number) => void,
): T[] {
  if (option === undefined) {
    return items;
  }
  const { start, end } = parseFilterRange(option);
  const sliced = items.slice(start, end);
  if (items.length > 0 && sliced.length === 0) {
    onEmpty?.(option, items.length);
  }
  return sliced;
}
