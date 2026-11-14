// Adapter: turns CIGE cases into promptfoo test cases.
//
// Promptfoo parses each `case: file://...cige.yaml` entry before calling this function,
// so no YAML dependency is needed here. The complete CIGE object is passed through
// unchanged in `vars.cige`; the CIGE file stays the source of truth.

import { validateCige } from './cige.mjs';

export default function cigeTests(config = {}) {
  const cases = config.cases ?? [];
  if (cases.length === 0) {
    throw new Error('cige-tests.mjs: config.cases must list at least one CIGE case');
  }

  return cases.map((entry, index) => {
    const source = entry.source ?? `cases[${index}]`;
    const errors = validateCige(entry.case);
    if (errors.length > 0) {
      throw new Error(`Invalid CIGE case ${source}:\n- ${errors.join('\n- ')}`);
    }
    return {
      description: entry.description ?? entry.case.intent.goal,
      vars: {
        cige: entry.case,
        // Environment knobs for the local fixture; not part of the CIGE case itself.
        fixture: entry.fixture ?? {},
      },
      metadata: { cigeSource: source },
    };
  });
}
