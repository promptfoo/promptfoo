import { describe, it, expect } from '@jest/globals';
import {
  detectVariables,
  normalizeVariableSyntax,
  hasTemplateVariables,
} from '../../src/extraction/variableDetector';

describe('variableDetector', () => {
  describe('detectVariables', () => {
    it('should detect mustache variables', () => {
      const prompt = 'Hello {{name}}, your order {{orderId}} is ready.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe('name');
      expect(variables[0].syntax).toBe('{{name}}');
      expect(variables[0].syntaxType).toBe('mustache');
      expect(variables[1].name).toBe('orderId');
      expect(variables[1].syntax).toBe('{{orderId}}');
    });

    it('should detect nunjucks variables with spaces', () => {
      const prompt = 'Hello {{ name }}, welcome to {{ location }}.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe('name');
      expect(variables[0].syntaxType).toBe('nunjucks');
      expect(variables[1].name).toBe('location');
    });

    it('should detect JavaScript template literals', () => {
      const prompt = 'Your balance is ${balance} and limit is ${limit}.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe('balance');
      expect(variables[0].syntaxType).toBe('js-template');
      expect(variables[1].name).toBe('limit');
    });

    it('should detect Python f-string variables', () => {
      const prompt = 'User {username} has {count} messages.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe('username');
      expect(variables[0].syntaxType).toBe('python');
      expect(variables[1].name).toBe('count');
    });

    it('should detect shell variables', () => {
      const prompt = 'Welcome $USER, your home is $HOME.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe('USER');
      expect(variables[0].syntaxType).toBe('shell');
      expect(variables[1].name).toBe('HOME');
    });

    it('should handle mixed variable syntaxes', () => {
      const prompt = 'Hello {{name}}, your balance is ${balance}.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe('name');
      expect(variables[0].syntaxType).toBe('mustache');
      expect(variables[1].name).toBe('balance');
      expect(variables[1].syntaxType).toBe('js-template');
    });

    it('should deduplicate variables', () => {
      const prompt = '{{name}} is {{name}} and {{name}}.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(1);
      expect(variables[0].name).toBe('name');
    });

    it('should infer variable types', () => {
      const prompt = '{{name}} has {{count}} items and {{isActive}} status.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(3);
      expect(variables[0].type).toBe('string'); // name
      expect(variables[1].type).toBe('number'); // count
      expect(variables[2].type).toBe('boolean'); // isActive
    });

    it('should generate sample values', () => {
      const prompt = '{{email}} and {{query}} and {{age}}.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(3);
      expect(variables[0].sampleValue).toBe('user@example.com'); // email
      expect(variables[1].sampleValue).toBe('What is the weather today?'); // query
      expect(variables[2].sampleValue).toBe('42'); // age (number type)
    });

    it('should handle variables with dots', () => {
      const prompt = 'User {{user.name}} from {{user.location}}.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe('user.name');
      expect(variables[1].name).toBe('user.location');
    });

    it('should return empty array when no variables found', () => {
      const prompt = 'This is a plain text prompt with no variables.';
      const variables = detectVariables(prompt);

      expect(variables).toHaveLength(0);
    });
  });

  describe('normalizeVariableSyntax', () => {
    it('should normalize mustache variables', () => {
      const prompt = 'Hello {{name}}, welcome!';
      const variables = detectVariables(prompt);
      const normalized = normalizeVariableSyntax(prompt, variables);

      expect(normalized).toBe('Hello {{name}}, welcome!');
    });

    it('should normalize JavaScript template literals to mustache', () => {
      const prompt = 'Balance: ${balance}, Limit: ${limit}';
      const variables = detectVariables(prompt);
      const normalized = normalizeVariableSyntax(prompt, variables);

      expect(normalized).toBe('Balance: {{balance}}, Limit: {{limit}}');
    });

    it('should normalize Python f-strings to mustache', () => {
      const prompt = 'User {username} has {count} items';
      const variables = detectVariables(prompt);
      const normalized = normalizeVariableSyntax(prompt, variables);

      expect(normalized).toBe('User {{username}} has {{count}} items');
    });

    it('should normalize shell variables to mustache', () => {
      const prompt = 'Welcome $USER to $HOME';
      const variables = detectVariables(prompt);
      const normalized = normalizeVariableSyntax(prompt, variables);

      expect(normalized).toBe('Welcome {{USER}} to {{HOME}}');
    });

    it('should handle mixed syntaxes', () => {
      const prompt = 'Hi {{name}}, your balance is ${balance} at $location';
      const variables = detectVariables(prompt);
      const normalized = normalizeVariableSyntax(prompt, variables);

      expect(normalized).toBe('Hi {{name}}, your balance is {{balance}} at {{location}}');
    });

    it('should handle multiple occurrences', () => {
      const prompt = 'Hello ${name}, goodbye ${name}';
      const variables = detectVariables(prompt);
      const normalized = normalizeVariableSyntax(prompt, variables);

      expect(normalized).toBe('Hello {{name}}, goodbye {{name}}');
    });

    it('should not modify prompt without variables', () => {
      const prompt = 'This is a plain prompt';
      const variables = detectVariables(prompt);
      const normalized = normalizeVariableSyntax(prompt, variables);

      expect(normalized).toBe(prompt);
    });
  });

  describe('hasTemplateVariables', () => {
    it('should return true for mustache variables', () => {
      expect(hasTemplateVariables('Hello {{name}}')).toBe(true);
    });

    it('should return true for JavaScript template literals', () => {
      expect(hasTemplateVariables('Balance: ${balance}')).toBe(true);
    });

    it('should return true for Python f-strings', () => {
      expect(hasTemplateVariables('User {username}')).toBe(true);
    });

    it('should return true for shell variables', () => {
      expect(hasTemplateVariables('Welcome $USER')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(hasTemplateVariables('This is plain text')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(hasTemplateVariables('')).toBe(false);
    });
  });
});
