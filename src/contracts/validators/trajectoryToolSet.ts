export function toolSetError(value: unknown): string | undefined {
  if (
    !Array.isArray(value) ||
    value.some((name) => typeof name !== 'string' || name.trim().length === 0)
  ) {
    return 'Enter an array of tool names. Use [] to require no tool calls.';
  }
  return undefined;
}
