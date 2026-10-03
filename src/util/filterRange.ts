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
  const match = option.trim().match(/^(\d*)\s*:\s*(\d*)$/);

  if (!match || (match[1] === '' && match[2] === '')) {
    throw new Error(
      `--filter-range must be specified in start:end format using zero-based indices, got: ${option}`,
    );
  }

  const start = parseRangeBound(match[1], option) ?? 0;
  const end = parseRangeBound(match[2], option);
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
