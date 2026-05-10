import { describe, expect, it } from 'vitest';
import {
  defineOperatorReportGraduationLadder,
  renderOperatorReportGraduationLadderMarkdown,
} from '../../../scripts/redteam-research/defineOperatorReportGraduationLadder';

describe('defineOperatorReportGraduationLadder', () => {
  it('defines the evidence needed before a plugin gets an operator report', () => {
    expect(defineOperatorReportGraduationLadder()).toEqual([
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
    ]);
  });

  it('renders the graduation ladder plainly', () => {
    const markdown = renderOperatorReportGraduationLadderMarkdown(
      defineOperatorReportGraduationLadder(),
    );

    expect(markdown).toContain(
      '| 4 | susceptible regime | replay against at least one susceptible target | realized yield can discriminate generators |',
    );
    expect(markdown).toContain(
      '| 6 | operator report | frontier, gaps, recommendations, and limitations in one report | operator-facing selection is auditable |',
    );
  });
});
