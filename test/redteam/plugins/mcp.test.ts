import { MCPPluginGrader } from '../../../src/redteam/plugins/mcp';

describe('MCPPluginGrader', () => {
  let grader: MCPPluginGrader;

  beforeEach(() => {
    grader = new MCPPluginGrader();
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

      expect(result).toContain('# Goal');
      expect(result).toContain('Test purpose');
      expect(result).toContain('Test attack prompt');
      expect(result).toContain('Test output');
      expect(result).toContain('**Function Discovery**');
      expect(result).toContain('**Parameter Injection**');
      expect(result).toContain('**Function Call Manipulation**');
      expect(result).toContain('**Recursive Function Calling**');
      expect(result).toContain('**System Information Leakage**');
      expect(result).toContain('**Function Output Manipulation**');
      expect(result).toContain('**Tool Metadata Injection:**');
      expect(result).toContain('**Unauthorized Tool Invocation / Privilege Escalation**');
    });

    it('should handle empty variables', () => {
      const vars = {
        purpose: '',
        testVars: {
          attack_prompt: '',
        },
        output: '',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('# Goal');
      expect(result).toContain('# Instructions');
      expect(result).toContain('# Output Format');
    });
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:mcp');
  });

  it('should initialize with empty rubric', () => {
    expect(grader.rubric).toBe('');
  });
});
