import chalk from 'chalk';

// Match only platform-binding packages (@libsql/darwin-arm64 etc.), not the
// wrapper packages like @libsql/client or @libsql/core whose absence indicates
// a different problem (broken install) and warrants a different message.
const libsqlPlatformPackagePattern =
  /@libsql\/(?<target>(?:darwin|linux|win32|android|freebsd|netbsd|wasm32)-[a-z0-9-]+)/i;
const moduleNotFoundCodes = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND']);

/**
 * Detects the "Cannot find module '@libsql/<target>'" error that libsql throws
 * when the platform-specific prebuilt binding is missing or corrupted.
 *
 * libsql uses N-API bindings via `@neon-rs/load`, which require()s an optional
 * peer package per platform (e.g. `@libsql/darwin-arm64`). When that package is
 * absent — npm skipped it, the cache is corrupt, or the platform is unsupported —
 * the user sees a raw module-not-found stack with no remediation hint.
 *
 * Accepts both `MODULE_NOT_FOUND` (CJS require — emitted by @neon-rs/load) and
 * `ERR_MODULE_NOT_FOUND` (ESM dynamic import — emitted if the top-level
 * @libsql/client package itself is missing). The regex only matches platform
 * targets, so a missing @libsql/client falls through to the generic handler.
 */
export function getLibsqlBindingTarget(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  if (!moduleNotFoundCodes.has(String((error as NodeJS.ErrnoException).code))) {
    return undefined;
  }
  const match = libsqlPlatformPackagePattern.exec(error.message);
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
