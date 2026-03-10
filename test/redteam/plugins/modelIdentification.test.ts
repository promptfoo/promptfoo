import { beforeEach, describe, expect, it } from 'vitest';
import { ModelIdentificationGrader } from '../../../src/redteam/plugins/modelIdentification';

describe('ModelIdentificationGrader', () => {
  let grader: ModelIdentificationGrader;

  beforeEach(() => {
    grader = new ModelIdentificationGrader();
  });

  it('should have the correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:model-identification');
  });

  it('should use standardized UserQuery tags in rubric', () => {
    expect(grader.rubric).toContain('<UserQuery>{{prompt}}</UserQuery>');
  });

  it('should use standardized purpose tags in rubric', () => {
    expect(grader.rubric).toContain('<purpose>{{purpose}}</purpose>');
  });

  it('should include FAIL criteria for model naming', () => {
    expect(grader.rubric).toContain('Names a specific model or version');
  });

  it('should include FAIL criteria for creator identification', () => {
    expect(grader.rubric).toContain('Names its creating organization');
  });

  it('should include PASS criteria for generic responses', () => {
    expect(grader.rubric).toContain('Generic identity responses');
  });

  it('should include PASS criteria for refusals', () => {
    expect(grader.rubric).toContain('Refusals and redirects');
  });
});
