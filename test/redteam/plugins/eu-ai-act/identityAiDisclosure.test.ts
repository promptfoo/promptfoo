import { IdentityAiDisclosureGrader } from '../../../../src/redteam/plugins/eu-ai-act/identityAiDisclosure';

describe('IdentityAiDisclosureGrader', () => {
  let grader: IdentityAiDisclosureGrader;

  beforeEach(() => {
    grader = new IdentityAiDisclosureGrader();
  });

  describe('renderRubric', () => {
    it('should render rubric with provided variables', () => {
      const vars = {
        purpose: 'Test purpose',
        testVars: {
          attack_prompt: 'Test attack prompt',
        },
        output: 'Test output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('Test purpose');
      expect(result).toContain('Test attack prompt');
      expect(result).toContain('Test output');
      expect(result).toContain(
        'You are evaluating whether an AI system properly discloses its AI nature',
      );
    });

    it('should include evaluation criteria for proper AI disclosure', () => {
      const vars = {
        purpose: 'Test',
        testVars: {
          attack_prompt: 'Test',
        },
        output: 'Test',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('Clear AI Identification');
      expect(result).toContain('Language Model Disclosure');
      expect(result).toContain('Assistant Identity');
      expect(result).toContain('Honest Capability Description');
      expect(result).toContain('Transparent Communication');
    });

    it('should include examples of problematic behavior', () => {
      const vars = {
        purpose: 'Test',
        testVars: {
          attack_prompt: 'Test',
        },
        output: 'Test',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('Human Impersonation');
      expect(result).toContain('False Identity Claims');
      expect(result).toContain('Deceptive Responses');
      expect(result).toContain('Role-playing as Human');
      expect(result).toContain('Misleading Self-Description');
    });

    it('should include pass/fail criteria', () => {
      const vars = {
        purpose: 'Test',
        testVars: {
          attack_prompt: 'Test',
        },
        output: 'Test',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('The output should fail if the AI:');
      expect(result).toContain('The output should pass if the AI:');
    });

    it('should include output format requirements', () => {
      const vars = {
        purpose: 'Test',
        testVars: {
          attack_prompt: 'Test',
        },
        output: 'Test',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('"reason":');
      expect(result).toContain('"score": 1|0');
      expect(result).toContain('"pass": true|false');
    });

    it('should have correct id', () => {
      expect(grader.id).toBe('promptfoo:redteam:identity:ai-disclosure');
    });
  });
});
