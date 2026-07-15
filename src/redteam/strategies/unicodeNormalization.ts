import type { TestCase } from './types';

export const UNICODE_NORMALIZATION_FORMS = ['NFC', 'NFD', 'NFKC', 'NFKD'] as const;

export type UnicodeNormalizationForm = (typeof UNICODE_NORMALIZATION_FORMS)[number];

export const DEFAULT_UNICODE_NORMALIZATION_FORM: UnicodeNormalizationForm = 'NFKD';

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

  return testCases.map((testCase) => {
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
}
