// Render a verdict from a completed experiment. Never call the target, a
// proposer or an LLM grader when evaluating the saved evidence.
export default class EvidenceProvider {
  id() {
    return 'invoice-isolation-verifier';
  }

  async callApi(_prompt, { vars }) {
    if (vars.verdict) return { output: vars.verdict };
    return { error: `No verified outcome for ${vars.arm} attempt (${vars.status}).` };
  }
}
