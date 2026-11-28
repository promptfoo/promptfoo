/**
 * Custom assertion handlers for exact money calculation, ISO 4217 currency codes,
 * and temporal UTC boundary conditions.
 */

function parseJsonOutput(output) {
  if (typeof output === 'object' && output !== null) {
    return output;
  }
  if (typeof output === 'string') {
    try {
      return JSON.parse(output);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parse a decimal string or number to integer cents without floating-point errors.
 */
function parseCents(amount) {
  if (typeof amount === 'number') {
    amount = String(amount);
  }
  if (typeof amount !== 'string') {
    return NaN;
  }
  const clean = amount.trim().replace(/^[$€£¥]/, '');
  const match = clean.match(/^(-?\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    return NaN;
  }
  const cents = Number(match[1] + (match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : NaN;
}

function validateExactMoney(output, context) {
  const data = parseJsonOutput(output);
  if (!data) {
    return {
      pass: false,
      score: 0,
      reason: 'Output is not valid JSON or object',
    };
  }

  const expectedCurrency = context?.vars?.expectedCurrency;
  if (expectedCurrency && data.currency !== expectedCurrency) {
    return {
      pass: false,
      score: 0,
      reason: `Currency mismatch: expected ${expectedCurrency}, got ${data.currency}`,
    };
  }

  if (!Array.isArray(data.items)) {
    return {
      pass: false,
      score: 0,
      reason: 'Missing items array in output',
    };
  }

  let calculatedCents = 0;
  for (const item of data.items) {
    const itemCents = parseCents(item?.amount);
    if (Number.isNaN(itemCents)) {
      return {
        pass: false,
        score: 0,
        reason: `Invalid item amount: ${item?.amount}`,
      };
    }
    calculatedCents += itemCents;
    if (!Number.isSafeInteger(calculatedCents)) {
      return { pass: false, score: 0, reason: 'Total exceeds the safe integer cent range' };
    }
  }

  const reportedCents = parseCents(data.total);
  if (Number.isNaN(reportedCents)) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid total amount: ${data.total}`,
    };
  }

  if (calculatedCents !== reportedCents) {
    const calcStr = (calculatedCents / 100).toFixed(2);
    const repStr = (reportedCents / 100).toFixed(2);
    return {
      pass: false,
      score: 0,
      reason: `Total mismatch: calculated sum of items is ${calcStr} (${calculatedCents} cents), but reported total is ${repStr} (${reportedCents} cents)`,
    };
  }

  const expectedTotal = context?.vars?.expectedTotal;
  if (expectedTotal !== undefined) {
    const expectedCents = parseCents(expectedTotal);
    if (reportedCents !== expectedCents) {
      return {
        pass: false,
        score: 0,
        reason: `Expected total mismatch: expected ${expectedTotal}, got ${data.total}`,
      };
    }
  }

  return {
    pass: true,
    score: 1,
    reason: `Exact money calculation verified: items sum to ${(calculatedCents / 100).toFixed(2)} ${data.currency}`,
  };
}

function validateCurrencyCode(output, context) {
  const data = parseJsonOutput(output);
  if (!data) {
    return {
      pass: false,
      score: 0,
      reason: 'Output is not valid JSON or object',
    };
  }

  const expectedCurrency = context?.vars?.expectedCurrency;
  if (expectedCurrency && data.currency !== expectedCurrency) {
    return {
      pass: false,
      score: 0,
      reason: `Currency mismatch: expected ${expectedCurrency}, got ${data.currency}`,
    };
  }

  const expectedTotal = context?.vars?.expectedTotal;
  if (expectedTotal !== undefined) {
    const reportedCents = parseCents(data.total);
    const expectedCents = parseCents(expectedTotal);
    if (reportedCents !== expectedCents) {
      return {
        pass: false,
        score: 0,
        reason: `Amount mismatch: expected ${expectedTotal}, got ${data.total}`,
      };
    }
  }

  return {
    pass: true,
    score: 1,
    reason: `Currency ${data.currency} and amount ${data.total} matched expected values`,
  };
}

// Require an explicit time zone so the result is independent of the machine running the eval.
function parseTimestamp(value) {
  const match =
    typeof value === 'string' &&
    /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) {
    return NaN;
  }
  // Date.parse rolls dates such as February 30 into the following month.
  const midnight = Date.parse(match[1] + 'T00:00:00Z');
  return Number.isFinite(midnight) && new Date(midnight).toISOString().startsWith(match[1])
    ? Date.parse(value)
    : NaN;
}

function validateTemporalBoundary(output, context) {
  const cutoffUtc = context?.vars?.cutoffUtc;
  const effectiveUntil = parseJsonOutput(output)?.effectiveUntil;
  const cutoffTime = parseTimestamp(cutoffUtc);
  const effectiveTime = parseTimestamp(effectiveUntil);
  if (!Number.isFinite(cutoffTime) || !Number.isFinite(effectiveTime)) {
    return {
      pass: false,
      score: 0,
      reason: 'Both timestamps must be valid ISO dates with an explicit time zone',
    };
  }
  const pass = effectiveTime <= cutoffTime;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `Quote effective until ${effectiveUntil} is within cutoff ${cutoffUtc}`
      : `Quote expired: effectiveUntil ${effectiveUntil} is past cutoff ${cutoffUtc}`,
  };
}

module.exports = {
  validateExactMoney,
  validateCurrencyCode,
  validateTemporalBoundary,
};
