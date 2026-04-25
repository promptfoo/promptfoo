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

export function parseFilterRange(option: string): FilterRange {
  const match = /^\s*(\d*)\s*:\s*(\d*)\s*$/.exec(option);
  const startRaw = match?.[1] ?? '';
  const endRaw = match?.[2] ?? '';
  if (!match || (startRaw === '' && endRaw === '')) {
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

export function filterByRange<T>(items: T[], option: string | undefined): T[] {
  if (option === undefined) {
    return items;
  }
  const { start, end } = parseFilterRange(option);
  return items.slice(start, end);
}

export function isValidFilterRange(option: string): boolean {
  try {
    parseFilterRange(option);
    return true;
  } catch {
    return false;
  }
}
