import type { TestCase } from '../../types/index';

// Map of standard Arabic-script characters to their isolated Arabic
// presentation forms (U+FB50–FDFF, U+FE70–FEFF). These compatibility
// characters change code points and can disrupt contextual letter joining.
// The transformation tests filters that treat the encoded letters differently.
export const arabicPresentationFormsMap: { [key: string]: string } = {
  ء: 'ﺀ', // ARABIC LETTER HAMZA ISOLATED FORM (U+FE80)
  آ: 'ﺁ', // ARABIC LETTER ALEF WITH MADDA ABOVE ISOLATED FORM (U+FE81)
  أ: 'ﺃ', // ARABIC LETTER ALEF WITH HAMZA ABOVE ISOLATED FORM (U+FE83)
  ؤ: 'ﺅ', // ARABIC LETTER WAW WITH HAMZA ABOVE ISOLATED FORM (U+FE85)
  إ: 'ﺇ', // ARABIC LETTER ALEF WITH HAMZA BELOW ISOLATED FORM (U+FE87)
  ئ: 'ﺉ', // ARABIC LETTER YEH WITH HAMZA ABOVE ISOLATED FORM (U+FE89)
  ا: 'ﺍ', // ARABIC LETTER ALEF ISOLATED FORM (U+FE8D)
  ب: 'ﺏ', // ARABIC LETTER BEH ISOLATED FORM (U+FE8F)
  ة: 'ﺓ', // ARABIC LETTER TEH MARBUTA ISOLATED FORM (U+FE93)
  ت: 'ﺕ', // ARABIC LETTER TEH ISOLATED FORM (U+FE95)
  ث: 'ﺙ', // ARABIC LETTER THEH ISOLATED FORM (U+FE99)
  ج: 'ﺝ', // ARABIC LETTER JEEM ISOLATED FORM (U+FE9D)
  ح: 'ﺡ', // ARABIC LETTER HAH ISOLATED FORM (U+FEA1)
  خ: 'ﺥ', // ARABIC LETTER KHAH ISOLATED FORM (U+FEA5)
  د: 'ﺩ', // ARABIC LETTER DAL ISOLATED FORM (U+FEA9)
  ذ: 'ﺫ', // ARABIC LETTER THAL ISOLATED FORM (U+FEAB)
  ر: 'ﺭ', // ARABIC LETTER REH ISOLATED FORM (U+FEAD)
  ز: 'ﺯ', // ARABIC LETTER ZAIN ISOLATED FORM (U+FEAF)
  س: 'ﺱ', // ARABIC LETTER SEEN ISOLATED FORM (U+FEB1)
  ش: 'ﺵ', // ARABIC LETTER SHEEN ISOLATED FORM (U+FEB5)
  ص: 'ﺹ', // ARABIC LETTER SAD ISOLATED FORM (U+FEB9)
  ض: 'ﺽ', // ARABIC LETTER DAD ISOLATED FORM (U+FEBD)
  ط: 'ﻁ', // ARABIC LETTER TAH ISOLATED FORM (U+FEC1)
  ظ: 'ﻅ', // ARABIC LETTER ZAH ISOLATED FORM (U+FEC5)
  ع: 'ﻉ', // ARABIC LETTER AIN ISOLATED FORM (U+FEC9)
  غ: 'ﻍ', // ARABIC LETTER GHAIN ISOLATED FORM (U+FECD)
  ف: 'ﻑ', // ARABIC LETTER FEH ISOLATED FORM (U+FED1)
  ق: 'ﻕ', // ARABIC LETTER QAF ISOLATED FORM (U+FED5)
  ك: 'ﻙ', // ARABIC LETTER KAF ISOLATED FORM (U+FED9)
  ل: 'ﻝ', // ARABIC LETTER LAM ISOLATED FORM (U+FEDD)
  م: 'ﻡ', // ARABIC LETTER MEEM ISOLATED FORM (U+FEE1)
  ن: 'ﻥ', // ARABIC LETTER NOON ISOLATED FORM (U+FEE5)
  ه: 'ﻩ', // ARABIC LETTER HEH ISOLATED FORM (U+FEE9)
  و: 'ﻭ', // ARABIC LETTER WAW ISOLATED FORM (U+FEED)
  ى: 'ﻯ', // ARABIC LETTER ALEF MAKSURA ISOLATED FORM (U+FEEF)
  ي: 'ﻱ', // ARABIC LETTER YEH ISOLATED FORM (U+FEF1)
  پ: 'ﭖ', // ARABIC LETTER PEH ISOLATED FORM (U+FB56)
  چ: 'ﭺ', // ARABIC LETTER TCHEH ISOLATED FORM (U+FB7A)
  ژ: 'ﮊ', // ARABIC LETTER JEH ISOLATED FORM (U+FB8A)
  ک: 'ﮎ', // ARABIC LETTER KEHEH ISOLATED FORM (U+FB8E)
  گ: 'ﮒ', // ARABIC LETTER GAF ISOLATED FORM (U+FB92)
  ھ: 'ﮪ', // ARABIC LETTER HEH DOACHASHMEE ISOLATED FORM (U+FBAA)
  ی: 'ﯼ', // ARABIC LETTER FARSI YEH ISOLATED FORM (U+FBFC)
};

/**
 * Convert mapped Arabic-script letters to their isolated compatibility forms.
 */
export function toArabicPresentationForms(text: string): string {
  return text
    .split('')
    .map((char) => arabicPresentationFormsMap[char] || char)
    .join('');
}

/**
 * Add Arabic presentation-forms encoding to test cases
 */
export function addArabicPresentationForms(testCases: TestCase[], injectVar: string): TestCase[] {
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars?.[injectVar]);
    return {
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.metric ? `${assertion.metric}/ArabicPresentationForms` : assertion.metric,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: toArabicPresentationForms(originalText),
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'arabic-presentation-forms',
        originalText,
      },
    };
  });
}
