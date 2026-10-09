import { describe, expect, it } from 'vitest';
import {
  isMissingPackageImportError,
  optionalPackageInstallHint,
} from '../../src/util/packageImportErrors';

describe('optionalPackageInstallHint', () => {
  it('gives the command for a project install and for a global one', () => {
    expect(optionalPackageInstallHint('npm install promptfoo @slack/web-api@^8.1.1')).toBe(
      'Install it with: npm install promptfoo @slack/web-api@^8.1.1 ' +
        '(or, if Promptfoo is installed globally with npm: npm install -g promptfoo @slack/web-api@^8.1.1; ' +
        'with pnpm, Yarn or Bun, use its global install instead)',
    );
  });

  it('keeps every package of a multi-package command in the global form', () => {
    expect(
      optionalPackageInstallHint(
        'npm install promptfoo @ibm-cloud/watsonx-ai@^1.7.16 ibm-cloud-sdk-core@5.6.2',
      ),
    ).toContain(
      'with npm: npm install -g promptfoo @ibm-cloud/watsonx-ai@^1.7.16 ibm-cloud-sdk-core@5.6.2;',
    );
  });

  it('keeps every step of a multi-line installation global', () => {
    expect(
      optionalPackageInstallHint(
        'npm install promptfoo ibm-cloud-sdk-core@5.6.2\nnpm install --save-exact ibm-cloud-sdk-core@5.6.2',
      ),
    ).toContain(
      'with npm: npm install -g promptfoo ibm-cloud-sdk-core@5.6.2\nnpm install -g --save-exact ibm-cloud-sdk-core@5.6.2;',
    );
  });
});

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
