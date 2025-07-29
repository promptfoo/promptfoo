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

/**
 * Extracts the file path from an issue, checking multiple possible locations
 * @param issue - The scan issue object
 * @returns The file path or 'Unknown' if not found
 */
export const getIssueFilePath = (issue: {
  location?: string | null;
  details?: Record<string, any> & { path?: string; files?: string[] };
}): string => {
  // Check location first (most common)
  if (issue.location && typeof issue.location === 'string' && issue.location.trim()) {
    return issue.location;
  }

  // Check details.path
  if (issue.details?.path && typeof issue.details.path === 'string' && issue.details.path.trim()) {
    return issue.details.path;
  }

  // Check details.files array
  if (
    issue.details?.files &&
    Array.isArray(issue.details.files) &&
    issue.details.files.length > 0 &&
    typeof issue.details.files[0] === 'string' &&
    issue.details.files[0].trim()
  ) {
    return issue.details.files[0];
  }

  return 'Unknown';
};
