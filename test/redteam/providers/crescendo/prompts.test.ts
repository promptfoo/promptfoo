import {
  CRESCENDO_SYSTEM_PROMPT,
  REFUSAL_SYSTEM_PROMPT,
  EVAL_SYSTEM_PROMPT,
} from '../../../../src/redteam/providers/crescendo/prompts';

describe('Crescendo prompts', () => {
  describe('CRESCENDO_SYSTEM_PROMPT', () => {
    it('should contain required template variables', () => {
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('{{maxTurns}}');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('{{currentRound}}');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('{{conversationObjective}}');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('{{purpose}}');
    });

    it('should contain required sections', () => {
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('###Instruction###');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('###Examples###');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('###Task###');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('###Inputs###');
    });

    it('should contain example jailbreak sequences', () => {
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('Example 1:');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('Example 2:');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('Example 3:');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('Example 4:');
    });

    it('should contain conditional purpose section', () => {
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('{% if purpose %}');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('{% endif %}');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('<purpose>');
      expect(CRESCENDO_SYSTEM_PROMPT).toContain('</purpose>');
    });
  });

  describe('REFUSAL_SYSTEM_PROMPT', () => {
    it('should contain evaluation instructions', () => {
      expect(REFUSAL_SYSTEM_PROMPT).toContain('## When to return True');
      expect(REFUSAL_SYSTEM_PROMPT).toContain('## When to return False');
    });

    it('should contain example evaluations', () => {
      expect(REFUSAL_SYSTEM_PROMPT).toContain('Example1:');
      expect(REFUSAL_SYSTEM_PROMPT).toContain('Example2:');
      expect(REFUSAL_SYSTEM_PROMPT).toContain('Example3:');
      expect(REFUSAL_SYSTEM_PROMPT).toContain('Example4:');
    });

    it('should contain JSON response format examples', () => {
      expect(REFUSAL_SYSTEM_PROMPT).toContain('"value":');
      expect(REFUSAL_SYSTEM_PROMPT).toContain('"rationale":');
      expect(REFUSAL_SYSTEM_PROMPT).toContain('"metadata":');
    });
  });

  describe('EVAL_SYSTEM_PROMPT', () => {
    it('should contain evaluation criteria', () => {
      expect(EVAL_SYSTEM_PROMPT).toContain('## When to return True');
      expect(EVAL_SYSTEM_PROMPT).toContain('## When to return False');
    });

    it('should contain example evaluations', () => {
      expect(EVAL_SYSTEM_PROMPT).toContain('Example1:');
      expect(EVAL_SYSTEM_PROMPT).toContain('Example2:');
      expect(EVAL_SYSTEM_PROMPT).toContain('Example3:');
    });

    it('should contain JSON response format examples', () => {
      expect(EVAL_SYSTEM_PROMPT).toContain('"value":');
      expect(EVAL_SYSTEM_PROMPT).toContain('"description":');
      expect(EVAL_SYSTEM_PROMPT).toContain('"rationale":');
      expect(EVAL_SYSTEM_PROMPT).toContain('"metadata":');
    });

    it('should contain evaluator role description', () => {
      expect(EVAL_SYSTEM_PROMPT).toContain('You are a proficient red teaming engineer');
      expect(EVAL_SYSTEM_PROMPT).toContain('meticulous editor');
    });
  });
});
