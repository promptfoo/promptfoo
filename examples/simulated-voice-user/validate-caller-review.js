const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const boundedText = (value) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 3000;

/** Require actual caller quotes and preserve uncertainty independently of model confidence. */
export default function validateCallerReview(output, context) {
  try {
    const review = JSON.parse(output);
    const conversation = JSON.parse(context.vars.conversation);
    const callerText = Array.isArray(conversation.messages)
      ? conversation.messages
          .filter((message) => message.speaker === 'caller')
          .map((message) => message.text)
          .join(' ')
      : conversation.callerHeardByTarget;
    if (typeof callerText !== 'string' || !callerText.trim()) {
      throw new Error('Missing recognized caller evidence.');
    }
    if (
      !review ||
      typeof review !== 'object' ||
      Array.isArray(review) ||
      Object.keys(review).length !== 3 ||
      !['valid', 'invalid', 'inconclusive'].includes(review.status) ||
      !boundedText(review.reason) ||
      !Array.isArray(review.issues) ||
      review.issues.length > 20 ||
      (review.status === 'valid' && review.issues.length !== 0) ||
      (review.status === 'invalid' && review.issues.length === 0)
    ) {
      throw new Error('Missing, malformed, or contradictory caller review.');
    }
    for (const issue of review.issues) {
      if (
        !issue ||
        typeof issue !== 'object' ||
        Object.keys(issue).length !== 3 ||
        !['role', 'closing', 'scenario'].includes(issue.kind) ||
        !boundedText(issue.reason) ||
        !boundedText(issue.caller_quote) ||
        !normalize(callerText).includes(normalize(issue.caller_quote))
      ) {
        throw new Error('A finding lacks an exact recognized caller quote.');
      }
    }
    if (review.status === 'valid' && conversation.order === 'unavailable') {
      return {
        pass: false,
        score: 0,
        reason:
          'Caller review: inconclusive. Conversation order is unavailable; a confident model verdict cannot establish goal or closing order. The original model output is retained.',
      };
    }
    const pass = review.status === 'valid';
    return {
      pass,
      score: Number(pass),
      reason: `Caller review: ${review.status}. ${review.reason} This is advisory listener-text evidence; reconcile disputes with delivered audio.`,
    };
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid caller review: ${error.message} Caller validity remains unreviewed.`,
    };
  }
}
