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
});
