type PackageManagerExecutable = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function getPackageManagerExecutable(executable: PackageManagerExecutable): string {
  if (process.platform !== 'win32') {
    return executable;
  }

  return executable === 'bun' ? 'bun.exe' : `${executable}.cmd`;
}

export function withTargetVersion(updateCommand: string, targetVersion: string): string {
  return updateCommand.replace('@latest', `@${targetVersion}`);
}

export function parseUpdateCommandForSpawn(updateCommand: string): {
  command: string;
  args: string[];
} {
  const commandParts = updateCommand.split(' ');
  const executable = commandParts[0];
  const args = commandParts.slice(1);

  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', executable, ...args],
    };
  }

  return {
    command: executable,
    args,
  };
}
