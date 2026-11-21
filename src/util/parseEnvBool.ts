export function parseEnvBool(input: string | boolean | undefined, defaultValue?: boolean): boolean {
  if (input == null || input === '') {
    return defaultValue ?? false;
  }
  return ['1', 'true', 'yes', 'yup', 'yeppers'].includes(String(input).toLowerCase());
}
