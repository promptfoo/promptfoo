/**
 * Shared logic for generating update commands based on environment
 */

export interface UpdateCommandOptions {
  isContainer: boolean;
  isOfficialDockerImage: boolean;
  isNpx: boolean;
}

export interface UpdateCommandResult {
  primary: string;
  alternative: string | null;
  commandType: 'docker' | 'npx' | 'npm';
  isCustomContainer?: boolean;
}

export function getUpdateCommands(options: UpdateCommandOptions): UpdateCommandResult {
  const { isContainer, isOfficialDockerImage, isNpx } = options;

  // Preserve compatibility with existing official images, where the official marker is sufficient.
  if (isOfficialDockerImage) {
    return {
      primary: 'docker pull ghcr.io/promptfoo/promptfoo:latest',
      alternative: null,
      commandType: 'docker',
    };
  }

  if (isContainer) {
    return {
      // Keep the existing public response fields backward-compatible. New clients use the
      // additive marker, while older Web UIs already hide empty commands.
      primary: '',
      alternative: null,
      commandType: 'npm',
      isCustomContainer: true,
    };
  }

  return {
    primary: isNpx ? 'npx promptfoo@latest' : 'npm install -g promptfoo@latest',
    alternative: isNpx ? 'npm install -g promptfoo@latest' : 'npx promptfoo@latest',
    commandType: isNpx ? 'npx' : 'npm',
  };
}

export function getUpdateCommandLabel(isNpx: boolean, isPrimary: boolean): string {
  if (isPrimary) {
    return 'Copy Command';
  }
  return isNpx ? 'or global install' : 'or npx';
}
