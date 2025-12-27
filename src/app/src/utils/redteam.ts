// TODO(Will): Should ASR and Pass Rate use the same color scale? Probably...
const COLOR_MAP = {
  darkRed: '#d32f2f',
  red: '#f44336',
  orange: '#ff9800',
  amber: '#ffc107',
  green: '#4caf50',
  lightGreen: '#8bc34a',
  yellow: '#ffeb3b',
};

/**
 * Get the color for an attack success rate percentage.
 * Colors range from red (high ASR) to green (low ASR).
 * @param percentage - The attack success rate percentage
 * @returns Color Hex
 */
export function getASRColor(percentage: number): string {
  // For attack success rate, high percentages are bad
  if (percentage >= 75) {
    return COLOR_MAP.darkRed;
  }
  if (percentage >= 50) {
    return COLOR_MAP.red;
  }
  if (percentage >= 25) {
    return COLOR_MAP.orange;
  }
  if (percentage >= 10) {
    return COLOR_MAP.amber;
  } else {
    return COLOR_MAP.green;
  }
}

/**
 * Get the color for a pass rate percentage.
 * Colors range from green (high pass rate) to red (low pass rate).
 * @param percentage - The pass rate percentage
 * @returns Color Hex
 */
export function getPassRateColor(percentage: number): string {
  // For pass rate, high percentages are good
  if (percentage >= 90) {
    return COLOR_MAP.green;
  }
  if (percentage >= 75) {
    return COLOR_MAP.lightGreen;
  }
  if (percentage >= 50) {
    return COLOR_MAP.yellow;
  }
  if (percentage >= 25) {
    return COLOR_MAP.orange;
  } else {
    return COLOR_MAP.red;
  }
}

/**
 * Formats the ASR for display, applying a consistent number of significant digits and appending a percentage sign.
 * @param asr - The ASR to format.
 * @param significantDigits - The number of significant digits to display.
 * @returns The formatted ASR.
 */
export function formatASRForDisplay(asr: number, significantDigits: number = 2): string {
  return asr.toFixed(significantDigits);
}
