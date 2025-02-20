/**
 * URL-related utility functions.
 */

/**
 * Ensures a URL ends with the specified suffix, handling various edge cases.
 * @param urlString The base URL to normalize
 * @param suffix The suffix to ensure the URL ends with (e.g., 'v1', 'v2', 'api/v1')
 * @returns Normalized URL ending with the suffix
 * @throws {Error} If URL string is empty or suffix is empty
 */
export function normalizeApiUrl(urlString: string, suffix: string): string {
  if (!urlString) {
    throw new Error('URL string cannot be empty');
  }

  if (!suffix) {
    throw new Error('Suffix cannot be empty');
  }

  // Remove leading/trailing slashes from suffix for consistency
  const normalizedSuffix = suffix.replace(/^\/+|\/+$/g, '');
  const suffixParts = normalizedSuffix.split('/');

  // Only try HTTPS for strings that look like valid domains
  if (!urlString.includes('://') && /^[a-zA-Z0-9][a-zA-Z0-9-.]+(\.([a-zA-Z]{2,}|localhost))(:\d+)?$/.test(urlString)) {
    try {
      return normalizeApiUrl(`https://${urlString}`, suffix);
    } catch {
      // If that fails, treat as invalid URL
    }
  }

  try {
    const url = new URL(urlString);
    const parts = url.pathname.split('/').filter(Boolean);
    
    // Check if all parts of the suffix exist in sequence at the end of the path
    const lastIndex = parts.length - suffixParts.length;
    const hasSuffixAtEnd = lastIndex >= 0 && suffixParts.every(
      (part, i) => parts[lastIndex + i] === part
    );

    if (!hasSuffixAtEnd) {
      // Suffix not found at the end, append it
      parts.push(...suffixParts);
      url.pathname = '/' + parts.join('/');
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    // For invalid URLs, just do simple string manipulation
    return `${urlString.replace(/\/+$/, '')}/${normalizedSuffix}`;
  }
}
