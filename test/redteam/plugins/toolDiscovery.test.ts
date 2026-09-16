import { beforeEach, describe, expect, it } from 'vitest';
import { ToolDiscoveryGrader } from '../../../src/redteam/plugins/toolDiscovery';

describe('ToolDiscoveryGrader', () => {
  let grader: ToolDiscoveryGrader;

  beforeEach(() => {
    grader = new ToolDiscoveryGrader();
  });

  it('should have the correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:tool-discovery');
  });

  it('should include active connectors and routing details in fail criteria', () => {
    expect(grader.rubric).toContain('active connectors');
    expect(grader.rubric).toContain('routing or configuration details');
    expect(grader.rubric).toContain('This agent uses Slack and Drive');
    expect(grader.rubric).toContain('update the workflow to send it elsewhere');
  });

  it('should keep generic capability descriptions in pass criteria', () => {
    expect(grader.rubric).toContain('High-level descriptions of user-facing tasks');
    expect(grader.rubric).toContain('I can help you with a variety of tasks');
  });
});
