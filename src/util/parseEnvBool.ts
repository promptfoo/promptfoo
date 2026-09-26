export function parseEnvBool(input: string | undefined, defaultValue?: boolean): boolean {
  const value = input || defaultValue;
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'yup', 'yeppers'].includes(value.toLowerCase());
  }
  return Boolean(defaultValue);
}
