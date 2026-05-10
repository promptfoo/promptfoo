import { pathToFileURL } from 'node:url';

import { renderMarkdownTable } from './reportRenderingShared';

export type OperatorReportGraduationStep = {
  evidence: string;
  outcome: string;
  stage: number;
  step: string;
};

export function defineOperatorReportGraduationLadder(): OperatorReportGraduationStep[] {
  return [
    {
      evidence: 'shared predicate frontier with explicit coverage target',
      outcome: 'semantic comparison is possible',
      stage: 1,
      step: 'semantic frontier',
    },
    {
      evidence: 'prompt-level readiness or quality proxy',
      outcome: 'attack-shape quality is measurable',
      stage: 2,
      step: 'quality proxy',
    },
    {
      evidence: 'replay against a hardened target',
      outcome: 'good prompts can be separated from target susceptibility',
      stage: 3,
      step: 'hardened regime',
    },
    {
      evidence: 'replay against at least one susceptible target',
      outcome: 'realized yield can discriminate generators',
      stage: 4,
      step: 'susceptible regime',
    },
    {
      evidence: 'multi-regime aggregation with breadth-sensitive reporting',
      outcome: 'expected yield is evaluated across targets',
      stage: 5,
      step: 'suite aggregation',
    },
    {
      evidence: 'frontier, gaps, recommendations, and limitations in one report',
      outcome: 'operator-facing selection is auditable',
      stage: 6,
      step: 'operator report',
    },
  ];
}

export function renderOperatorReportGraduationLadderMarkdown(
  steps: readonly OperatorReportGraduationStep[],
): string {
  return [
    '# Operator Report Graduation Ladder',
    '',
    ...renderMarkdownTable(
      ['Stage', 'Step', 'Required evidence', 'Unlocks'],
      steps.map((step) => ({
        cells: [String(step.stage), step.step, step.evidence, step.outcome],
      })),
    ),
    '',
    '## Reading',
    '',
    'A plugin should not inherit the full operator report just because it has a semantic frontier. It graduates into that report only after it also has prompt-quality evidence, target replay evidence, suite aggregation, and auditable selection guidance.',
  ].join('\n');
}

async function main() {
  console.log(renderOperatorReportGraduationLadderMarkdown(defineOperatorReportGraduationLadder()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
