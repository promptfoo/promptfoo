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
    amount = amount.toFixed(2);
  }
  if (typeof amount !== 'string') {
    return NaN;
  }
  const clean = amount.trim().replace(/^[$€£¥]/, '');
  const match = clean.match(/^(-?\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    return NaN;
  }
  const whole = parseInt(match[1], 10);
  const frac = (match[2] || '').padEnd(2, '0');
  const cents = parseInt(frac, 10);
  return whole < 0 ? whole * 100 - cents : whole * 100 + cents;
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
    const itemCents = parseCents(item.amount);
    if (Number.isNaN(itemCents)) {
      return {
        pass: false,
        score: 0,
        reason: `Invalid item amount: ${item.amount}`,
      };
    }
    calculatedCents += itemCents;
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

function validateTemporalBoundary(output, context) {
  const data = parseJsonOutput(output);
  if (!data) {
    return {
      pass: false,
      score: 0,
      reason: 'Output is not valid JSON or object',
    };
  }

  const cutoffUtc = context?.vars?.cutoffUtc;
  if (!cutoffUtc) {
    return {
      pass: false,
      score: 0,
      reason: 'Missing cutoffUtc in test vars',
    };
  }

  const cutoffTime = new Date(cutoffUtc).getTime();
  if (Number.isNaN(cutoffTime)) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid cutoffUtc timestamp: ${cutoffUtc}`,
    };
  }

  const effectiveUntil = data.effectiveUntil;
  if (!effectiveUntil) {
    return {
      pass: false,
      score: 0,
      reason: 'Missing effectiveUntil date in output',
    };
  }

  const effectiveTime = new Date(effectiveUntil).getTime();
  if (Number.isNaN(effectiveTime)) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid effectiveUntil timestamp: ${effectiveUntil}`,
    };
  }

  if (effectiveTime > cutoffTime) {
    return {
      pass: false,
      score: 0,
      reason: `Quote expired: effectiveUntil ${effectiveUntil} is past cutoff ${cutoffUtc}`,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `Quote effective until ${effectiveUntil} is within cutoff ${cutoffUtc}`,
  };
}

module.exports = {
  validateExactMoney,
  validateCurrencyCode,
  validateTemporalBoundary,
};
