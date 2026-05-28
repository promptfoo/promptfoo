import { InvalidArgumentError } from 'commander';

export function collectKeyValueOption(
  optionName: string,
  value: string,
  previous: Record<string, string> | undefined,
): Record<string, string> {
  const separatorIndex = value.indexOf('=');
  const key = separatorIndex === -1 ? '' : value.slice(0, separatorIndex);
  const val = separatorIndex === -1 ? undefined : value.slice(separatorIndex + 1);

  if (!key || val === undefined) {
    throw new InvalidArgumentError(`${optionName} must be specified in key=value format.`);
  }

  return { ...previous, [key]: val };
}
