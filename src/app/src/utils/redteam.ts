/**
 * Formats the ASR for display, applying a consistent number of significant digits and appending a percentage sign.
 * @param asr - The ASR to format.
 * @param significantDigits - The number of significant digits to display.
 * @returns The formatted ASR.
 */
export function formatASRForDisplay(asr: number, significantDigits: number = 2): string {
  return asr.toFixed(significantDigits);
}
