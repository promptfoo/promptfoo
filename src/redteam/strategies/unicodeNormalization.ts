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
 * Returns whether normalizing a test case would change the injected value.
 *
 * Layer composition uses this to distinguish Unicode's intentional no-op
 * filtering from strategies that return an empty array for other reasons.
 */
export function wouldUnicodeNormalizationChange(
  testCase: TestCase,
  injectVar: string,
  config: Record<string, unknown> = {},
): boolean {
  const form = resolveUnicodeNormalizationForm(config);
  const originalText = testCase.vars?.[injectVar];
  if (typeof originalText !== 'string') {
    return false;
  }
  return normalizeUnicode(originalText, form) !== originalText;
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
  let normalizationCandidateCount = 0;

  const normalizedTestCases = testCases
    .map((testCase): TestCase | undefined => {
      const originalText = testCase.vars?.[injectVar];
      if (typeof originalText !== 'string') {
        return undefined;
      }
      normalizationCandidateCount++;
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

  if (normalizationCandidateCount > 0 && normalizedTestCases.length === 0) {
    logger.warn(
      `[unicode-normalization] Skipped all ${normalizationCandidateCount} test cases because ${form} normalization produced no changes.`,
    );
  }

  return normalizedTestCases;
}
