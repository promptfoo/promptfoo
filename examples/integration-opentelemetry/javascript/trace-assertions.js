module.exports = (output, context) => {
  // Check if trace data is available
  if (!context.trace) {
    // Tracing not enabled, skip trace-based checks
    return true;
  }

  const { spans } = context.trace;

  // Check for errors in any span
  const errorSpans = spans.filter((s) => s.statusCode >= 400);
  if (errorSpans.length > 0) {
    return {
      pass: false,
      score: 0,
      reason: `Found ${errorSpans.length} error spans`,
    };
  }

  // Calculate total trace duration
  if (spans.length > 0) {
    const duration =
      Math.max(...spans.map((s) => s.endTime || 0)) - Math.min(...spans.map((s) => s.startTime));
    if (duration > 5000) {
      // 5 seconds
      return {
        pass: false,
        score: 0,
        reason: `Trace took too long: ${duration}ms`,
      };
    }
  }

  // Check for specific operations - look for HTTP/API calls
  const apiCalls = spans.filter((s) => s.name.toLowerCase().includes('http'));
  if (apiCalls.length > 10) {
    return {
      pass: false,
      score: 0,
      reason: `Too many API calls: ${apiCalls.length}`,
    };
  }

  // Verify all expected RAG steps are present
  const expectedSteps = [
    'query_analysis',
    'document_retrieval',
    'context_augmentation',
    'reasoning_chain',
    'response_generation',
  ];

  const missingSteps = expectedSteps.filter((step) => !spans.some((s) => s.name === step));

  if (missingSteps.length > 0) {
    return {
      pass: false,
      score: 0,
      reason: `Missing RAG workflow steps: ${missingSteps.join(', ')}`,
    };
  }

  // Check for the main workflow span (optional - may be missing due to timing)
  const workflowSpan = spans.find((s) => s.name === 'rag_agent_workflow');
  if (workflowSpan) {
    // Validate workflow attributes if present
    const attrs = workflowSpan.attributes;
    if (!attrs['workflow.success'] || attrs['workflow.success'] !== true) {
      return {
        pass: false,
        score: 0,
        reason: 'Workflow did not complete successfully',
      };
    }
  }

  // Check document retrieval performance
  const retrievalSpans = spans.filter((s) => s.name.startsWith('retrieve_document_'));
  if (retrievalSpans.length < 3) {
    return {
      pass: false,
      score: 0,
      reason: `Expected 3 document retrievals, found ${retrievalSpans.length}`,
    };
  }

  // Check reasoning chain has expected sub-steps
  const reasoningSteps = spans.filter((s) => s.name.startsWith('reasoning_'));
  if (reasoningSteps.length < 3) {
    return {
      pass: false,
      score: 0,
      reason: `Expected at least 3 reasoning steps, found ${reasoningSteps.length}`,
    };
  }

  // All checks passed
  return {
    pass: true,
    score: 1,
    reason: 'Trace validation successful',
  };
};
