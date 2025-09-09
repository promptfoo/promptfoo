export const sanitizeBody = (body: any) => {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  const secretKeys = ['password', 'token', 'secret', 'apiKey'];

  secretKeys.forEach((key) => {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
};

export function sanitizeUrl(url: string): string {
  try {
    // Ensure url is a string and handle edge cases
    if (typeof url !== 'string' || !url.trim()) {
      return url;
    }

    const parsedUrl = new URL(url);

    // Create a copy for sanitization to avoid modifying the original URL
    // Use href instead of toString() for better cross-platform compatibility
    const sanitizedUrl = new URL(parsedUrl.href);

    if (sanitizedUrl.username || sanitizedUrl.password) {
      sanitizedUrl.username = '***';
      sanitizedUrl.password = '***';
    }

    // Sanitize query parameters that might contain sensitive data
    const sensitiveParams =
      /(api[_-]?key|token|password|secret|signature|sig|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|authorization)/i;

    try {
      for (const key of Array.from(sanitizedUrl.searchParams.keys())) {
        if (sensitiveParams.test(key)) {
          sanitizedUrl.searchParams.set(key, '[REDACTED]');
        }
      }
    } catch {
      // If search params handling fails, continue without sanitizing them
      // Silent failure to avoid console noise in tests
    }

    return sanitizedUrl.toString();
  } catch {
    // Silent failure to avoid console noise in tests
    return url;
  }
}
