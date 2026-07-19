import logger from '../../logger';
import {
  DEFAULT_UNICODE_NORMALIZATION_FORM,
  isUnicodeNormalizationForm,
  UNICODE_NORMALIZATION_FORMS,
} from '../constants/strategies';

import type { UnicodeNormalizationForm } from '../constants/strategies';
import type { TestCase } from './types';

export function resolveUnicodeNormalizationForm(
  config: Record<string, unknown> = {},
): UnicodeNormalizationForm {
  const form = config.form === undefined ? DEFAULT_UNICODE_NORMALIZATION_FORM : config.form;

  if (!isUnicodeNormalizationForm(form)) {
    throw new Error(
      `Unicode normalization strategy form must be one of: ${UNICODE_NORMALIZATION_FORMS.join(', ')}`,
    );
  }

  return form;
}

export function normalizeUnicode(
  text: string,
  form: UnicodeNormalizationForm = DEFAULT_UNICODE_NORMALIZATION_FORM,
): string {
  return text.normalize(form);
}

/**
 * Rewrites the injected variable using one of the Unicode normalization forms
 * defined by Unicode Standard Annex #15.
 */
export function addUnicodeNormalization(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, unknown> = {},
): TestCase[] {
  const form = resolveUnicodeNormalizationForm(config);

  const normalizedTestCases = testCases
    .map((testCase): TestCase | undefined => {
      const originalText = String(testCase.vars![injectVar]);
      const normalizedText = normalizeUnicode(originalText, form);

      // Do not emit a second probe when normalization is a byte-for-byte no-op.
      if (normalizedText === originalText) {
        return undefined;
      }

      return {
        ...testCase,
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: assertion.metric
            ? `${assertion.metric}/UnicodeNormalization-${form}`
            : assertion.metric,
        })),
        vars: {
          ...testCase.vars,
          [injectVar]: normalizedText,
        },
        metadata: {
          ...testCase.metadata,
          strategyId: 'unicode-normalization',
          originalText,
          normalizationForm: form,
        },
      };
    })
    .filter((testCase): testCase is TestCase => testCase !== undefined);

  if (testCases.length > 0 && normalizedTestCases.length === 0) {
    logger.warn(
      `[unicode-normalization] Skipped all ${testCases.length} test cases because ${form} normalization produced no changes.`,
    );
  }

  return normalizedTestCases;
}
