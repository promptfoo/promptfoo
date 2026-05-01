import chalk from 'chalk';

const libsqlPackagePattern = /@libsql\/(?<target>[a-z0-9-]+)/i;

/**
 * Detects the "Cannot find module '@libsql/<target>'" error that libsql throws
 * when the platform-specific prebuilt binding is missing or corrupted.
 *
 * libsql uses N-API bindings via `@neon-rs/load`, which require()s an optional
 * peer package per platform (e.g. `@libsql/darwin-arm64`). When that package is
 * absent — npm skipped it, the cache is corrupt, or the platform is unsupported —
 * the user sees a raw "MODULE_NOT_FOUND" stack with no remediation hint.
 */
export function getLibsqlBindingTarget(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
    return undefined;
  }
  const match = libsqlPackagePattern.exec(error.message);
  return match?.groups?.target;
}

export function formatLibsqlBindingErrorMessage(error: unknown): string | undefined {
  const target = getLibsqlBindingTarget(error);
  if (!target) {
    return undefined;
  }

  return chalk.yellow(
    [
      `promptfoo could not load its SQLite dependency because the libsql binding for "${target}" is missing.`,
      '',
      `Detected platform: ${process.platform}-${process.arch}`,
      `Required package: @libsql/${target}`,
      '',
      'If you are working from a project checkout:',
      '  Run: npm install',
      '',
      'If promptfoo was installed globally with npm:',
      '  Run: npm install -g promptfoo@latest',
      '',
      'If you are running through npx:',
      '  Remove the cached npx install, then run npx -y promptfoo@latest again.',
      '',
      `If your platform is unsupported, file an issue at https://github.com/promptfoo/promptfoo/issues with "${process.platform}-${process.arch}" in the title.`,
      '',
      'More help: https://www.promptfoo.dev/docs/usage/troubleshooting/#libsql-binding-not-found',
    ].join('\n'),
  );
}
