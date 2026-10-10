export const createMockTracingOptions = (enabled = true) => ({
  enabled,
  includeInAttack: true,
  includeInGrading: true,
  includeInternalSpans: false,
  maxSpans: 50,
  maxDepth: 5,
  maxRetries: 3,
  retryDelayMs: 500,
  sanitizeAttributes: true,
});
