/**
 * Formats the ASR with a fixed number of fractional digits, without a percentage sign.
 * @param asr - The ASR to format.
 * @param fractionDigits - The number of digits to display after the decimal point.
 * @returns The formatted ASR.
 */
export function formatASRForDisplay(asr: number, fractionDigits: number = 2): string {
  return asr.toFixed(fractionDigits);
}
