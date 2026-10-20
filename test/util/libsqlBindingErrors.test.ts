import { describe, expect, it } from 'vitest';
import {
  formatLibsqlBindingErrorMessage,
  getLibsqlBindingTarget,
} from '../../src/util/libsqlBindingErrors';

function makeBindingError(target: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    `Cannot find module '@libsql/${target}'\nRequire stack:\n- /app/node_modules/libsql/index.js`,
  );
  error.code = 'MODULE_NOT_FOUND';
  return error;
}

describe('libsql binding errors', () => {
  it('extracts the missing libsql target from ESM import failures', () => {
    const error: NodeJS.ErrnoException = new Error(
      "Cannot find package '@libsql/linux-x64-gnu' imported from /app/node_modules/@libsql/client/lib-esm/node.js",
    );
    error.code = 'ERR_MODULE_NOT_FOUND';

    expect(getLibsqlBindingTarget(error)).toBe('linux-x64-gnu');
  });

  it('extracts the missing libsql target from the require stack', () => {
    expect(getLibsqlBindingTarget(makeBindingError('darwin-arm64'))).toBe('darwin-arm64');
    expect(getLibsqlBindingTarget(makeBindingError('linux-x64-musl'))).toBe('linux-x64-musl');
  });

  it('formats actionable repair instructions with the detected target and platform', () => {
    const message = formatLibsqlBindingErrorMessage(makeBindingError('linux-x64-gnu'));

    expect(message).toContain('Required package: @libsql/linux-x64-gnu');
    expect(message).toContain(`${process.platform}-${process.arch}`);
    expect(message).toContain('libsql-binding-not-found');
  });

  it('ignores MODULE_NOT_FOUND errors that are not from libsql', () => {
    const error: NodeJS.ErrnoException = new Error("Cannot find module 'some-other-pkg'");
    error.code = 'MODULE_NOT_FOUND';

    expect(getLibsqlBindingTarget(error)).toBeUndefined();
    expect(formatLibsqlBindingErrorMessage(error)).toBeUndefined();
  });

  it('ignores missing libsql wrapper packages that are not platform bindings', () => {
    for (const packageName of ['client', 'client-wasm', 'core', 'hrana-client']) {
      const error: NodeJS.ErrnoException = new Error(
        `Cannot find module '@libsql/${packageName}'\nRequire stack:\n- /app/index.js`,
      );
      error.code = 'MODULE_NOT_FOUND';

      expect(getLibsqlBindingTarget(error)).toBeUndefined();
      expect(formatLibsqlBindingErrorMessage(error)).toBeUndefined();
    }
  });

  it('ignores libsql-mentioning errors that are not MODULE_NOT_FOUND', () => {
    const error: NodeJS.ErrnoException = new Error("Cannot find module '@libsql/darwin-arm64'");
    // No `code` set — looks like the right message but wrong shape.

    expect(getLibsqlBindingTarget(error)).toBeUndefined();
  });

  it('ignores non-Error values', () => {
    expect(getLibsqlBindingTarget('boom')).toBeUndefined();
    expect(getLibsqlBindingTarget(undefined)).toBeUndefined();
    expect(formatLibsqlBindingErrorMessage(null)).toBeUndefined();
  });
});
