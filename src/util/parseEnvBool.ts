export function parseEnvBool(input: string | undefined, defaultValue?: boolean): boolean {
  if (!input) {
    return defaultValue ?? false;
  }
  return ['1', 'true', 'yes', 'yup', 'yeppers'].includes(input.toLowerCase());
}
