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

function makeEsmBindingError(specifier: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`Cannot find package '${specifier}'`);
  error.code = 'ERR_MODULE_NOT_FOUND';
  return error;
}

describe('libsql binding errors', () => {
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

  it('also accepts ESM ERR_MODULE_NOT_FOUND for platform bindings', () => {
    const error: NodeJS.ErrnoException = new Error(
      "Cannot find package '@libsql/darwin-arm64' imported from /app/node_modules/libsql/index.js",
    );
    error.code = 'ERR_MODULE_NOT_FOUND';

    expect(getLibsqlBindingTarget(error)).toBe('darwin-arm64');
  });

  it('does not misclassify a missing wrapper package as a platform-binding error', () => {
    // If @libsql/client or @libsql/core itself is missing (broken install,
    // not a platform-binding issue) the friendly handler must fall through
    // so the user does not see a misleading "binding for 'client' is missing"
    // message that tells them to file a platform-support issue.
    expect(getLibsqlBindingTarget(makeEsmBindingError('@libsql/client'))).toBeUndefined();
    expect(getLibsqlBindingTarget(makeEsmBindingError('@libsql/client/node'))).toBeUndefined();
    expect(getLibsqlBindingTarget(makeEsmBindingError('@libsql/core'))).toBeUndefined();
    const cjsClientMiss: NodeJS.ErrnoException = new Error(
      "Cannot find module '@libsql/client'\nRequire stack:\n- /app/something.js",
    );
    cjsClientMiss.code = 'MODULE_NOT_FOUND';
    expect(getLibsqlBindingTarget(cjsClientMiss)).toBeUndefined();
  });
});
