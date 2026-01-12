/**
 * Promptfoo Assertions for UCP Agent Evaluation
 *
 * These assertion functions validate the UCP agent result artifact.
 * Each function receives the output string (JSON) and returns a score (0-1)
 * and optional reasoning.
 */

/**
 * Parse the result artifact from output string
 */
function parseResult(output) {
  if (typeof output === 'string') {
    return JSON.parse(output);
  }
  return output;
}

/**
 * Assert that checkout completed successfully with an order ID
 */
function assertSuccessCompleted(output) {
  const result = parseResult(output);

  if (!result.success) {
    return {
      pass: false,
      score: 0,
      reason: `Checkout failed: ${result.error || result.final_status}`,
    };
  }

  if (result.final_status !== 'completed') {
    return {
      pass: false,
      score: 0.5,
      reason: `Expected status 'completed', got '${result.final_status}'`,
    };
  }

  if (!result.order_id) {
    return {
      pass: false,
      score: 0.7,
      reason: 'Checkout completed but no order_id returned',
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `Checkout completed successfully with order ${result.order_id}`,
  };
}

/**
 * Assert that escalation was handled correctly
 */
function assertRequiresEscalation(output) {
  const result = parseResult(output);

  if (!result.requires_escalation) {
    return {
      pass: false,
      score: 0,
      reason: 'Expected escalation but none required',
    };
  }

  if (!result.continue_url) {
    return {
      pass: false,
      score: 0.5,
      reason: 'Escalation required but no continue_url provided',
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `Escalation handled correctly with continue_url: ${result.continue_url}`,
  };
}

/**
 * Assert that UCP-Agent header was sent (REST protocol compliance)
 */
function assertUCPAgentHeader(output) {
  const result = parseResult(output);
  const sent = result.protocol?.sent_ucp_agent_header;

  return {
    pass: sent === true,
    score: sent ? 1 : 0,
    reason: sent ? 'UCP-Agent header sent correctly' : 'UCP-Agent header not sent',
  };
}

/**
 * Assert that idempotency keys were used
 */
function assertIdempotencyUsed(output) {
  const result = parseResult(output);
  const used = result.protocol?.used_idempotency_keys;

  return {
    pass: used === true,
    score: used ? 1 : 0,
    reason: used ? 'Idempotency keys used correctly' : 'Idempotency keys not used',
  };
}

/**
 * Assert that a discount was applied successfully
 */
function assertDiscountApplied(output) {
  const result = parseResult(output);
  const applied = result.applied_discounts || [];

  if (applied.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No discounts were applied',
    };
  }

  const totalDiscount = applied.reduce((sum, d) => sum + (d.amount || 0), 0);

  return {
    pass: true,
    score: 1,
    reason: `${applied.length} discount(s) applied, total savings: ${totalDiscount}`,
  };
}

/**
 * Assert that rejected discount codes were properly surfaced
 */
function assertRejectedDiscountSurfaced(output) {
  const result = parseResult(output);

  // Check messages for discount rejection codes
  const discountMessages = (result.messages_seen || []).filter(
    (m) => m.code && m.code.startsWith('discount_code_')
  );

  if (discountMessages.length === 0) {
    // Also check rejected_discounts array
    if ((result.rejected_discounts || []).length > 0) {
      return {
        pass: true,
        score: 1,
        reason: `Rejected discounts tracked: ${result.rejected_discounts.length}`,
      };
    }

    return {
      pass: false,
      score: 0,
      reason: 'No discount rejection messages found',
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `Discount rejection surfaced: ${discountMessages.map((m) => m.code).join(', ')}`,
  };
}

/**
 * Assert discount replacement semantics (new codes replace old)
 * This validates that the discount system works - at minimum, the submitted
 * code should either be applied or rejected (not silently ignored).
 */
function assertDiscountReplacementSemantics(output) {
  const result = parseResult(output);
  const applied = result.applied_discounts || [];
  const rejected = result.rejected_discounts || [];

  // The scenario submits a discount code - it should be processed (applied or explicitly rejected)
  const totalProcessed = applied.length + rejected.length;

  if (totalProcessed === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'Discount code was neither applied nor rejected - may have been silently ignored',
    };
  }

  // If we have applied discounts, check they look reasonable
  if (applied.length > 0) {
    return {
      pass: true,
      score: 1,
      reason: `Discount replacement working: ${applied.length} code(s) applied`,
    };
  }

  // If all codes were rejected, that's still valid behavior (code may be invalid)
  return {
    pass: true,
    score: 0.7,
    reason: `Discount code(s) rejected: ${rejected.length}. Verify code validity with merchant.`,
  };
}

/**
 * Assert that fulfillment was properly handled
 */
function assertFulfillmentHandled(output) {
  const result = parseResult(output);

  // Check if fulfillment-related messages were addressed
  const fulfillmentErrors = (result.messages_seen || []).filter(
    (m) => m.code && (m.code.includes('fulfillment') || m.code.includes('shipping'))
  );

  // If checkout succeeded, fulfillment was handled
  if (result.success && result.final_status === 'completed') {
    return {
      pass: true,
      score: 1,
      reason: 'Fulfillment handled, checkout completed',
    };
  }

  // If escalation required, that's also valid
  if (result.requires_escalation) {
    return {
      pass: true,
      score: 0.8,
      reason: 'Fulfillment requires escalation (expected for complex scenarios)',
    };
  }

  return {
    pass: false,
    score: 0.3,
    reason: `Fulfillment not fully handled. Errors: ${fulfillmentErrors.map((m) => m.code).join(', ')}`,
  };
}

/**
 * Assert that line items match expected quantities
 */
function assertLineItemsCorrect(output, expected) {
  const result = parseResult(output);
  const items = result.line_items || [];

  if (items.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No line items in result',
    };
  }

  // Check quantities match if expected is provided
  if (expected) {
    const expectedItems = typeof expected === 'string' ? JSON.parse(expected) : expected;
    let matchCount = 0;

    for (const exp of expectedItems) {
      const found = items.find(
        (i) => i.merchant_item_id === exp.merchant_item_id && i.quantity === exp.quantity
      );
      if (found) matchCount++;
    }

    const score = matchCount / expectedItems.length;
    return {
      pass: score === 1,
      score,
      reason: `${matchCount}/${expectedItems.length} items match expected`,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `${items.length} line items present`,
  };
}

/**
 * Assert that total amount is within expected bounds
 */
function assertTotalInRange(output, min, max) {
  const result = parseResult(output);
  const total = result.total_amount || 0;

  const minVal = parseInt(min) || 0;
  const maxVal = parseInt(max) || Number.MAX_SAFE_INTEGER;

  const inRange = total >= minVal && total <= maxVal;

  return {
    pass: inRange,
    score: inRange ? 1 : 0,
    reason: `Total ${total} ${inRange ? 'is' : 'is not'} in range [${minVal}, ${maxVal}]`,
  };
}

/**
 * Assert no sensitive data in transcript
 */
function assertNoSensitiveData(output) {
  const result = parseResult(output);
  const transcript = JSON.stringify(result.transcript || []);

  // Check for common sensitive patterns
  const sensitivePatterns = [
    { pattern: /\b\d{16}\b/, name: 'credit card (16 digits)' },
    { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, name: 'credit card (formatted)' },
    { pattern: /\b\d{3,4}\b.*cvv/i, name: 'CVV' },
    { pattern: /cvv.*\b\d{3,4}\b/i, name: 'CVV (reversed)' },
    { pattern: /\bpassword\s*[:=]\s*\S+/i, name: 'password value' },
    { pattern: /\bsecret\s*[:=]\s*\S+/i, name: 'secret value' },
    { pattern: /api[_-]?key\s*[:=]\s*\S+/i, name: 'API key value' },
    { pattern: /\b[A-Za-z0-9]{32,}\b/, name: 'potential token/key (32+ chars)' },
    { pattern: /bearer\s+[A-Za-z0-9._-]+/i, name: 'bearer token' },
  ];

  for (const { pattern, name } of sensitivePatterns) {
    if (pattern.test(transcript)) {
      return {
        pass: false,
        score: 0,
        reason: `Sensitive data pattern detected: ${name}`,
      };
    }
  }

  return {
    pass: true,
    score: 1,
    reason: 'No sensitive data patterns detected in transcript',
  };
}

/**
 * Assert error was handled gracefully (no crash, proper error message)
 */
function assertGracefulErrorHandling(output) {
  const result = parseResult(output);

  // Even on error, we should have a structured response
  if (typeof result !== 'object') {
    return {
      pass: false,
      score: 0,
      reason: 'Response is not a valid object',
    };
  }

  if (result.final_status === 'provider_error' && !result.error) {
    return {
      pass: false,
      score: 0.5,
      reason: 'Provider error without error message',
    };
  }

  return {
    pass: true,
    score: 1,
    reason: result.error ? `Error handled: ${result.error}` : 'No errors',
  };
}

/**
 * Composite scoring function for overall UCP agent quality
 * Uses the weighted rubric from the evaluation plan
 */
function assertOverallQuality(output) {
  const result = parseResult(output);

  let score = 0;
  const breakdown = [];

  // Task success (40%)
  if (result.success) {
    if (result.order_id || result.requires_escalation) {
      score += 40;
      breakdown.push('Task success: 40/40');
    } else {
      score += 20;
      breakdown.push('Task partial: 20/40');
    }
  } else {
    breakdown.push('Task failed: 0/40');
  }

  // Correctness (25%)
  if (result.line_items && result.line_items.length > 0) {
    score += 15;
    breakdown.push('Items present: 15/25');
    if (result.total_amount > 0) {
      score += 10;
      breakdown.push('Total calculated: 10/25');
    }
  } else {
    breakdown.push('Correctness issues: 0/25');
  }

  // Protocol compliance (20%)
  if (result.protocol?.sent_ucp_agent_header) {
    score += 10;
    breakdown.push('UCP-Agent header: 10/20');
  }
  if (result.protocol?.used_idempotency_keys) {
    score += 10;
    breakdown.push('Idempotency: 10/20');
  }

  // UX and safety (15%)
  const hasTranscript = result.transcript && result.transcript.length > 0;
  if (hasTranscript) {
    score += 7;
    breakdown.push('Transcript recorded: 7/15');
  }
  const noErrors = !result.error;
  if (noErrors) {
    score += 8;
    breakdown.push('No errors: 8/15');
  }

  return {
    pass: score >= 70,
    score: score / 100,
    reason: `Overall quality: ${score}/100. ${breakdown.join('; ')}`,
  };
}

/**
 * Assert that checkout has at least the expected number of line items
 */
function assertMinLineItems(output, minCount) {
  const result = parseResult(output);
  const count = (result.line_items || []).length;
  const min = parseInt(minCount) || 3;

  return {
    pass: count >= min,
    score: count >= min ? 1 : count / min,
    reason: `Expected ${min}+ items, got ${count}`,
  };
}

module.exports = {
  assertSuccessCompleted,
  assertRequiresEscalation,
  assertUCPAgentHeader,
  assertIdempotencyUsed,
  assertDiscountApplied,
  assertRejectedDiscountSurfaced,
  assertDiscountReplacementSemantics,
  assertFulfillmentHandled,
  assertLineItemsCorrect,
  assertMinLineItems,
  assertTotalInRange,
  assertNoSensitiveData,
  assertGracefulErrorHandling,
  assertOverallQuality,
};
