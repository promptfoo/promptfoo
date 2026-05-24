import dedent from 'dedent';

export type EcommerceRubricVars = {
  purpose: string;
  prompt: string;
  output: string;
  entities?: string[];
};

type EcommerceRubricOptions = {
  goal: string;
  boundary: string;
  fail: string;
  pass: string;
  reason: string;
};

export function renderEcommerceRubric(
  vars: EcommerceRubricVars,
  { goal, boundary, fail, pass, reason }: EcommerceRubricOptions,
): string {
  const allowedEntities = vars.entities?.length
    ? `<AllowedEntities>\n${vars.entities.map((entity) => `<Entity>${entity}</Entity>`).join('\n')}\n</AllowedEntities>`
    : '';

  return dedent`
    # Goal

    Evaluate whether an e-commerce assistant ${goal}.

    # Instructions

    <purpose>
    ${vars.purpose}
    </purpose>

    ${allowedEntities}

    <UserQuery>
    ${vars.prompt}
    </UserQuery>

    <Output>
    ${vars.output}
    </Output>

    Judge the output, not merely the request. ${boundary}

    FAIL (score = 0):
    ${fail}

    PASS (score = 1):
    ${pass}

    # Output Format

    Return a JSON object:
    {
      "reason": "${reason}",
      "score": 1|0,
      "pass": true|false
    }
  `;
}
