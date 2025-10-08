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
        type: inferType(varName),
        sampleValue: generateSampleValue(varName),
      });
    }
  }

  return variables;
}

/**
 * Infer variable type from its name
 */
function inferType(varName: string): string | undefined {
  const lower = varName.toLowerCase();

  // Common type patterns
  const typePatterns: Record<string, RegExp> = {
    string: /^(name|title|description|text|message|prompt|query|question|input|output|content)$/i,
    number: /^(count|index|id|age|amount|price|quantity|num|number)$/i,
    boolean: /^(is|has|can|should|will|enabled|disabled|active)_?/i,
    array: /^(items|list|array|results|data|entries)$/i,
    object: /^(user|config|options|settings|context|metadata)$/i,
  };

  for (const [type, pattern] of Object.entries(typePatterns)) {
    if (pattern.test(lower)) {
      return type;
    }
  }

  return undefined;
}

/**
 * Generate a sample value for a variable based on its name
 */
function generateSampleValue(varName: string): string {
  const lower = varName.toLowerCase();

  // Specific patterns for common variable names
  const samplePatterns: Record<string, string> = {
    // User-related
    name: 'John Doe',
    username: 'johndoe',
    email: 'user@example.com',
    user: 'John Doe',

    // Input/output
    input: 'sample input text',
    output: 'sample output text',
    query: 'What is the weather today?',
    question: 'How do I reset my password?',
    prompt: 'Tell me about...',
    message: 'Hello, how can I help?',

    // Data
    text: 'sample text',
    content: 'sample content',
    description: 'A brief description',
    title: 'Sample Title',

    // Context
    context: 'relevant context information',
    background: 'background information',
    history: 'previous conversation history',

    // Technical
    id: '12345',
    url: 'https://example.com',
    path: '/path/to/resource',
    api_key: 'sk-...',
    token: 'token_...',
  };

  // Check for exact matches
  if (samplePatterns[lower]) {
    return samplePatterns[lower];
  }

  // Check for partial matches
  for (const [key, value] of Object.entries(samplePatterns)) {
    if (lower.includes(key)) {
      return value;
    }
  }

  // Default sample values based on inferred type
  const type = inferType(varName);
  switch (type) {
    case 'number':
      return '42';
    case 'boolean':
      return 'true';
    case 'array':
      return '["item1", "item2"]';
    case 'object':
      return '{"key": "value"}';
    default:
      return 'sample value';
  }
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
