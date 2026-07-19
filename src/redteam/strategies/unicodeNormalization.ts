import logger from '../../logger';
import {
  DEFAULT_UNICODE_NORMALIZATION_FORM,
  UNICODE_NORMALIZATION_FORMS,
} from '../constants/strategies';

import type { UnicodeNormalizationForm } from '../constants/strategies';
import type { TestCase } from './types';

export {
  DEFAULT_UNICODE_NORMALIZATION_FORM,
  UNICODE_NORMALIZATION_FORMS,
} from '../constants/strategies';

export type { UnicodeNormalizationForm } from '../constants/strategies';

export function resolveUnicodeNormalizationForm(
  config: Record<string, unknown> = {},
): UnicodeNormalizationForm {
  const form = config.form === undefined ? DEFAULT_UNICODE_NORMALIZATION_FORM : config.form;

  if (
    typeof form !== 'string' ||
    !UNICODE_NORMALIZATION_FORMS.includes(form as UnicodeNormalizationForm)
  ) {
    throw new Error(
      `Unicode normalization strategy form must be one of: ${UNICODE_NORMALIZATION_FORMS.join(', ')}`,
    );
  }

  return form as UnicodeNormalizationForm;
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

  const normalizedTestCases = testCases.map((testCase) => {
    const originalText = String(testCase.vars![injectVar]);
    const normalizedText = normalizeUnicode(originalText, form);

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
        normalizationChanged: normalizedText !== originalText,
      },
    };
  });

  const unchangedCount = normalizedTestCases.filter(
    (testCase) => testCase.metadata?.normalizationChanged === false,
  ).length;

  if (normalizedTestCases.length > 0 && unchangedCount === normalizedTestCases.length) {
    logger.warn(
      `[unicode-normalization] All ${normalizedTestCases.length} test cases were unchanged by ${form}; these probes are byte-identical to the baseline.`,
    );
  }

  return normalizedTestCases;
}
