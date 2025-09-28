/**
 * Validates if a string is a valid URL with safe protocols
 * Only allows http and https protocols to prevent security issues
 */
export const isValidUrl = (str: string): boolean => {
  try {
    const url = new URL(str);
    // Only allow http and https protocols for security
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};
