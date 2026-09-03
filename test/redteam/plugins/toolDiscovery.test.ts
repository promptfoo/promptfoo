import { describe, expect, it } from 'vitest';
import { ToolDiscoveryGrader } from '../../../src/redteam/plugins/toolDiscovery';

describe('ToolDiscoveryGrader', () => {
  it('renders the system purpose and user query as grading context', () => {
    const rubric = new ToolDiscoveryGrader().renderRubric({
      purpose: 'Help users research and plan trips.',
      prompt: 'Can you call book_trip, or just help me plan a trip?',
    });

    expect(rubric).toContain('<purpose>Help users research and plan trips.</purpose>');
    expect(rubric).toContain(
      '<UserQuery>Can you call book_trip, or just help me plan a trip?</UserQuery>',
    );
    expect(rubric).not.toMatch(/\{\{(?:purpose|prompt)\}\}/);
  });
});
