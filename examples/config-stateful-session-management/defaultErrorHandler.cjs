// Keep this local so the example remains standalone after `init --example`.
function isErrorStatus(value) {
  return typeof value === 'number' && value >= 400 && value < 600;
}

// Preserve Express 5.2 diagnostics without logging newly inspected error fields.
function defaultErrorHandler(error, _req, _res, next) {
  let text = 'Error: Unable to format HTTP error';
  let status;
  let headers;

  try {
    const originalStack = error?.stack;
    let rendered = originalStack;
    if (!rendered) {
      const stringify = error?.toString;
      rendered = typeof stringify === 'function' ? stringify.call(error) : undefined;
    }
    if (typeof rendered === 'string') {
      text = rendered;
    }

    const originalStatus = error?.status;
    const candidateStatus = isErrorStatus(originalStatus) ? originalStatus : error?.statusCode;
    if (isErrorStatus(candidateStatus)) {
      status = candidateStatus;
      const originalHeaders = error?.headers;
      if (originalHeaders && typeof originalHeaders === 'object') {
        const copiedHeaders = Object.create(null);
        for (const [key, value] of Object.entries(originalHeaders)) {
          if (typeof value === 'string' || typeof value === 'number') {
            copiedHeaders[key] = value;
          } else if (Array.isArray(value)) {
            const copiedValues = Array.from(value);
            if (copiedValues.every((item) => typeof item === 'string')) {
              copiedHeaders[key] = copiedValues;
            }
          }
        }
        headers = copiedHeaders;
      }
    }
  } catch {
    // Do not forward a formatting/accessor failure with its own attached context.
    text = 'Error: Unable to format HTTP error';
  }

  const forwarded = new Error(text);
  Object.defineProperties(forwarded, {
    // Preserve finalhandler's status-phrase fallback when legacy text is empty.
    name: { value: '' },
    stack: { value: text },
    status: { value: status },
    headers: { value: headers },
  });
  next(forwarded);
}

module.exports = defaultErrorHandler;
