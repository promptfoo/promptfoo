/**
 * Shared logic for generating update commands based on environment
 */

export interface UpdateCommandOptions {
  selfHosted: boolean;
  isNpx: boolean;
}

export function getUpdateCommands(options: UpdateCommandOptions): {
  primary: string;
  alternative: string | null;
} {
  const { selfHosted, isNpx } = options;

  if (selfHosted) {
    return {
      primary: 'docker pull promptfoo/promptfoo:latest',
      alternative: null,
    };
  }

  return {
    primary: isNpx ? 'npx promptfoo@latest' : 'npm install -g promptfoo@latest',
    alternative: isNpx ? 'npm install -g promptfoo@latest' : 'npx promptfoo@latest',
  };
}

export function getUpdateCommandLabel(isNpx: boolean, isPrimary: boolean): string {
  if (isPrimary) {
    return 'Copy Command';
  }
  return isNpx ? 'or global install' : 'or npx';
}
