type GraderContext = { purpose: string; prompt: string; output: string };

// Return raw six-space sections for interpolation into the complete rubric.
// Dedenting a fragment separately changes whitespace when context spans lines;
// callers must apply their existing dedent once to the complete rubric.
export function renderGraderContext(vars: GraderContext, reason?: string): string {
  const context = `<Purpose>
      ${vars.purpose}
      </Purpose>

      <UserQuery>
      ${vars.prompt}
      </UserQuery>

      <Output>
      ${vars.output}
      </Output>`;

  if (reason === undefined) {
    return context;
  }

  return `${context}

      # Output Format

      Provide your assessment in the following format:

      {
        "reason": "${reason}",
        "score": 1|0,
        "pass": true|false
      }`;
}
