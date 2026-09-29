import { describe, expect, it } from 'vitest';
import { isMissingPackageImportError } from '../../src/util/packageImportErrors';

describe('isMissingPackageImportError', () => {
  it('recognizes missing optional packages', () => {
    const error = Object.assign(new Error('Cannot find package @googleapis/sheets'), {
      code: 'ERR_MODULE_NOT_FOUND',
    });

    expect(isMissingPackageImportError(error, '@googleapis/sheets')).toBe(true);
  });

  it('recognizes CommonJS-style missing optional package errors', () => {
    const error = Object.assign(new Error('Missing optional dependency @googleapis/sheets'), {
      code: 'MODULE_NOT_FOUND',
    });

    expect(isMissingPackageImportError(error, '@googleapis/sheets')).toBe(true);
  });

  it('ignores import failures for unrelated packages', () => {
    const error = new Error('Cannot find package @promptfoo/unrelated');

    expect(isMissingPackageImportError(error, '@googleapis/sheets')).toBe(false);
  });

  it('preserves import-time runtime errors from present packages', () => {
    const error = new Error('@googleapis/sheets failed during initialization');

    expect(isMissingPackageImportError(error, '@googleapis/sheets')).toBe(false);
  });

  it('recognizes the optional package itself from a realistic ESM message', () => {
    const error = Object.assign(
      new Error(
        "Cannot find package '@googleapis/sheets' imported from /app/dist/src/googleSheets.js",
      ),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );

    expect(isMissingPackageImportError(error, '@googleapis/sheets')).toBe(true);
  });

  it('recognizes a subpath import of the optional package', () => {
    const error = Object.assign(
      new Error(
        "Cannot find package '@googleapis/sheets/build/index' imported from /app/dist/src/googleSheets.js",
      ),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );

    expect(isMissingPackageImportError(error, '@googleapis/sheets')).toBe(true);
  });

  it('does not misreport a missing transitive dependency as the optional package (ESM)', () => {
    // The optional package is installed, but one of ITS dependencies is not.
    // The package name appears only in the importer path, not as the failed
    // specifier, so it must not be reported as the package itself being absent.
    const error = Object.assign(
      new Error(
        "Cannot find package 'gaxios' imported from /app/node_modules/@googleapis/sheets/build/index.js",
      ),
      { code: 'ERR_MODULE_NOT_FOUND' },
    );

    expect(isMissingPackageImportError(error, '@googleapis/sheets')).toBe(false);
  });

  it('does not misreport a missing transitive dependency as the optional package (CommonJS)', () => {
    const error = Object.assign(
      new Error(
        "Cannot find module 'gaxios'\nRequire stack:\n- /app/node_modules/@googleapis/sheets/build/index.js",
      ),
      { code: 'MODULE_NOT_FOUND' },
    );

    expect(isMissingPackageImportError(error, '@googleapis/sheets')).toBe(false);
  });
});
