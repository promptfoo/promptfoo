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
 * Strips position information from a file path
 * @param filePath - The file path that may contain position info
 * @returns The file path without position information
 */
const stripPositionInfo = (filePath: string): string => {
  // Remove position information like " (pos 123)" from the end of the path
  return filePath.replace(/\s*\(pos\s+\d+\)\s*$/i, '').trim();
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
    return stripPositionInfo(issue.location);
  }

  // Check details.path
  if (issue.details?.path && typeof issue.details.path === 'string' && issue.details.path.trim()) {
    return stripPositionInfo(issue.details.path);
  }

  // Check details.files array - iterate to find first valid string
  if (issue.details?.files && Array.isArray(issue.details.files)) {
    for (const file of issue.details.files) {
      if (file && typeof file === 'string' && file.trim()) {
        return stripPositionInfo(file);
      }
    }
  }

  return 'Unknown';
};
