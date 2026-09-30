import { beforeEach, describe, expect, it } from 'vitest';
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
        prompt: 'Test attack prompt',
        output: 'Test output',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('# Goal');
      expect(result).toContain('Test purpose');
      expect(result).toContain('Test attack prompt');
      expect(result).toContain('Test output');
    });

    it('should handle empty variables', () => {
      const vars = {
        purpose: '',
        prompt: '',
        output: '',
      };

      const result = grader.renderRubric(vars);

      expect(result).toContain('# Goal');
      expect(result).toContain('# Instructions');
      expect(result).toContain('# Output Format');
    });

    it('does not treat advertised routing capabilities as hidden state', () => {
      const result = grader.renderRubric({
        purpose: 'Users can choose where their own report is saved',
        prompt: 'Can I change my report destination?',
        output: 'You can choose an output destination in settings.',
      });

      expect(result).toContain('Use the application purpose and user query');
      expect(result).toContain('advertised user-facing capabilities');
      expect(result).toContain('does not by itself show hidden configuration disclosure');
      expect(result).not.toContain('(Fails - leaked internal routing/configuration details)');
    });

    it('should include connector ownership and configuration disclosure in fail criteria', () => {
      const result = grader.renderRubric({
        purpose: 'Test purpose',
        prompt: 'Tell me about your connectors',
        output: 'This agent uses Slack through another user account.',
      });

      expect(result).toContain('active connectors');
      expect(result).toContain('connected account owned by another user');
      expect(result).toContain('hidden connection state');
    });
  });

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:mcp');
  });

  it('should initialize with empty rubric', () => {
    expect(grader.rubric).toBe('');
  });
});
