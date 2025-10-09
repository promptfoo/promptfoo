import type { Variable } from './types';

interface VariablePattern {
  regex: RegExp;
  syntaxType: Variable['syntaxType'];
  priority: number; // Higher priority patterns are checked first
}

const VARIABLE_PATTERNS: VariablePattern[] = [
  // Mustache/Handlebars: {{variable}}, {{variable.property}}
  {
    regex: /\{\{([^}]+)\}\}/g,
    syntaxType: 'mustache',
    priority: 10,
  },
  // Nunjucks (with spaces): {{ variable }}, {{ variable.property }}
  {
    regex: /\{\{\s*([^}]+?)\s*\}\}/g,
    syntaxType: 'nunjucks',
    priority: 9,
  },
  // JavaScript template literals: ${variable}, ${variable.method()}
  {
    regex: /\$\{([^}]+)\}/g,
    syntaxType: 'js-template',
    priority: 8,
  },
  // Python f-strings: {variable}, {variable.method()}
  {
    regex: /\{([a-zA-Z_][a-zA-Z0-9_\.]*)\}/g,
    syntaxType: 'python',
    priority: 7,
  },
  // Shell variables: $variable, $VARIABLE
  {
    regex: /\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
    syntaxType: 'shell',
    priority: 6,
  },
];

/**
 * Detect template variables in a prompt string
 */
export function detectVariables(prompt: string): Variable[] {
  const variables: Variable[] = [];
  const seen = new Set<string>();

  // Sort patterns by priority
  const sortedPatterns = [...VARIABLE_PATTERNS].sort((a, b) => b.priority - a.priority);

  for (const pattern of sortedPatterns) {
    const matches = prompt.matchAll(pattern.regex);

    for (const match of matches) {
      const varName = match[1].trim();
      const syntax = match[0];

      // Skip if we've already seen this variable name
      if (seen.has(varName)) {
        continue;
      }

      seen.add(varName);

      variables.push({
        name: varName,
        syntax,
        syntaxType: pattern.syntaxType,
      });
    }
  }

  return variables;
}

/**
 * Normalize variable syntax to Promptfoo's mustache format
 */
export function normalizeVariableSyntax(prompt: string, variables: Variable[]): string {
  let normalized = prompt;

  // Sort by syntax length (longest first) to avoid replacing substrings
  const sortedVars = [...variables].sort((a, b) => b.syntax.length - a.syntax.length);

  for (const variable of sortedVars) {
    // Replace all occurrences of the original syntax with mustache syntax
    const mustacheSyntax = `{{${variable.name}}}`;

    // Escape special regex characters in the syntax
    const escapedSyntax = variable.syntax.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    normalized = normalized.replace(new RegExp(escapedSyntax, 'g'), mustacheSyntax);
  }

  return normalized;
}

/**
 * Check if a string contains template variables
 */
export function hasTemplateVariables(text: string): boolean {
  return VARIABLE_PATTERNS.some((pattern) => pattern.regex.test(text));
}
