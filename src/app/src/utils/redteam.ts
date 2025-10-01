/**
 * Get the color for an attack success rate percentage (higher is worse)
 * @param percentage - The attack success rate percentage
 * @returns Color Hex
 */
export function getASRColor(percentage: number): string {
  // For attack success rate, high percentages are bad
  if (percentage >= 75) {
    return '#d32f2f';
  } // Dark Red
  if (percentage >= 50) {
    return '#f44336';
  } // Red
  if (percentage >= 25) {
    return '#ff9800';
  } // Orange
  if (percentage >= 10) {
    return '#ffc107';
  } // Amber
  return '#4caf50'; // Green (low attack success is good)
}

/**
 * Get the color for a pass rate percentage (higher is better)
 * @param percentage - The pass rate percentage
 * @returns Color Hex
 */
export function getPassRateColor(percentage: number): string {
  // For pass rate, high percentages are good
  if (percentage >= 90) {
    return '#4caf50';
  } // Green
  if (percentage >= 75) {
    return '#8bc34a';
  } // Light Green
  if (percentage >= 50) {
    return '#ffeb3b';
  } // Yellow
  if (percentage >= 25) {
    return '#ff9800';
  } // Orange
  return '#f44336'; // Red
}
