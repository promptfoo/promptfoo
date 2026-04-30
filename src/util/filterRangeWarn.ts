import logger from '../logger';

export function warnEmptyFilterRange(option: string, originalCount: number): void {
  logger.warn(
    `--filter-range ${option} selected 0 tests (had ${originalCount} before slicing). Check your range bounds.`,
  );
}
