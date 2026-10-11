import listenerEvidence from './listener-evidence.js';

/** Fail explicitly when evidence is missing instead of letting a judge infer it. */
export default function validateEvidence(output, context) {
  try {
    listenerEvidence(output, { metadata: context.providerResponse?.metadata });
    return { pass: true, score: 1, reason: 'Both participants returned listener transcripts.' };
  } catch (error) {
    return { pass: false, score: 0, reason: error.message };
  }
}
