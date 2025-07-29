/**
 * Maps internal severity values to user-friendly display labels
 * @param severity - The internal severity value
 * @returns The display label for the severity
 */
export const getSeverityLabel = (severity: string): string => {
  return severity === 'error' ? 'critical' : severity;
};

/**
 * Maps display labels back to internal severity values
 * @param label - The display label
 * @returns The internal severity value
 */
export const getSeverityValue = (label: string): string => {
  return label === 'critical' ? 'error' : label;
};
