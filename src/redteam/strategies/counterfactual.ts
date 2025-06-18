import type { TestCase, TestCaseWithPlugin } from '../../types';

export interface CounterfactualConfig {
  protectedAttribute: string;
  values: string[];
  targetVariables?: string[]; // Which variables to substitute, defaults to all that contain the protected attribute
  [key: string]: any; // Index signature for compatibility
}

/**
 * Extract the original prompt text for metadata
 */
function getOriginalPromptText(testCase: TestCase, injectVar: string): string {
  if (testCase.vars && testCase.vars[injectVar]) {
    return String(testCase.vars[injectVar]);
  }
  return 'Original test case';
}

/**
 * Check if text contains references to the protected attribute
 */
function containsAttributeReference(text: string, attribute: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerAttribute = attribute.toLowerCase();

  // Direct match
  if (lowerText.includes(lowerAttribute)) {
    return true;
  }

  // Common attribute-related terms
  const attributeTerms: Record<string, string[]> = {
    gender: ['male', 'female', 'woman', 'man', 'boy', 'girl', 'he', 'she', 'his', 'her', 'him'],
    race: ['white', 'black', 'asian', 'hispanic', 'latino', 'african', 'caucasian'],
    age: ['young', 'old', 'elderly', 'senior', 'teenager', 'adult', 'child'],
    religion: ['christian', 'muslim', 'jewish', 'hindu', 'buddhist', 'atheist'],
  };

  const terms = attributeTerms[lowerAttribute] || [];
  return terms.some((term) => lowerText.includes(term));
}

/**
 * Handle gender-specific term replacements
 */
function replaceGenderTerms(text: string, targetGender: string): string {
  const genderMappings: Record<string, Record<string, string>> = {
    male: {
      female: 'male',
      woman: 'man',
      women: 'men',
      girl: 'boy',
      girls: 'boys',
      she: 'he',
      her: 'his',
      hers: 'his',
      herself: 'himself',
    },
    female: {
      male: 'female',
      man: 'woman',
      men: 'women',
      boy: 'girl',
      boys: 'girls',
      he: 'she',
      his: 'her',
      him: 'her',
      himself: 'herself',
    },
  };

  const mappings = genderMappings[targetGender.toLowerCase()];
  if (!mappings) {
    return text;
  }

  let result = text;
  for (const [from, to] of Object.entries(mappings)) {
    // Handle capitalization
    const regex = new RegExp(`\\b${from}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      if (match[0] === match[0].toUpperCase()) {
        return to.charAt(0).toUpperCase() + to.slice(1);
      }
      return to;
    });
  }

  return result;
}

/**
 * Replace template variables like {{gender}} with actual values
 */
function replaceTemplateVariable(text: string, attribute: string, newValue: string): string {
  // Replace template variables like {{gender}} with actual values
  const templatePattern = new RegExp(`\\{\\{\\s*${attribute}\\s*\\}\\}`, 'gi');
  return text.replace(templatePattern, newValue);
}

/**
 * Replace attribute references in text with new value
 */
function replaceAttributeInText(text: string, attribute: string, newValue: string): string {
  // First try template variable replacement
  const result = replaceTemplateVariable(text, attribute, newValue);
  if (result !== text) {
    return result; // Template replacement was successful
  }

  // If the text is exactly the attribute value, replace it entirely
  if (text.toLowerCase().trim() === attribute.toLowerCase()) {
    return newValue;
  }

  // For gender specifically, handle common replacements
  if (attribute.toLowerCase() === 'gender') {
    return replaceGenderTerms(text, newValue);
  }

  // For other attributes, do simple word replacement
  const words = text.split(/\b/);
  return words
    .map((word) => {
      if (word.toLowerCase() === attribute.toLowerCase()) {
        return newValue;
      }
      return word;
    })
    .join('');
}

/**
 * Find variables that likely contain the protected attribute
 * Only returns variables that are actually used in template substitution
 */
function findVariablesContainingAttribute(
  vars: Record<string, any>,
  attribute: string,
  promptTemplate?: string,
): string[] {
  const relevantVars: string[] = [];

  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === 'string') {
      // Check if the value contains template variables like {{gender}}
      const templatePattern = new RegExp(`\\{\\{\\s*${attribute}\\s*\\}\\}`, 'gi');
      if (templatePattern.test(value)) {
        relevantVars.push(key);
      }
      // Check if the variable name matches the attribute
      else if (key.toLowerCase() === attribute.toLowerCase()) {
        relevantVars.push(key);
      }
      // Check if the value contains words related to the attribute
      else if (containsAttributeReference(value, attribute)) {
        relevantVars.push(key);
      }
    }
  }

  return relevantVars;
}

/**
 * Counterfactual strategy: Runs a base prompt n times with one protected attribute flipped each run.
 * Passes only if the model gives identical categorical outcomes.
 *
 * @param testCases - The original test cases from plugins
 * @param injectVar - The variable being injected (usually 'prompt' or similar)
 * @param config - Configuration containing protectedAttribute and values to flip
 * @returns Array of new test cases with flipped attributes
 */
export function addCounterfactualTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: CounterfactualConfig,
): TestCase[] {
  const { protectedAttribute, values, targetVariables } = config;

  if (!protectedAttribute || !values || values.length < 2) {
    throw new Error('Counterfactual strategy requires protectedAttribute and at least 2 values');
  }

  const newTestCases: TestCase[] = [];

  for (const originalTestCase of testCases) {
    // Find variables that contain references to the protected attribute
    // Don't require a prompt template - work directly with the variables
    const variablesToFlip =
      targetVariables ||
      findVariablesContainingAttribute(
        originalTestCase.vars || {},
        protectedAttribute,
        undefined, // Don't require prompt template check
      );

    if (variablesToFlip.length === 0) {
      // Skip this test case - no variables contain the protected attribute
      continue;
    } else {
      // Create counterfactual versions by flipping the protected attribute in relevant variables
      for (const value of values) {
        const newVars = { ...originalTestCase.vars };

        // Replace the protected attribute value in all relevant variables
        for (const varName of variablesToFlip) {
          if (newVars[varName]) {
            newVars[varName] = replaceAttributeInText(
              String(newVars[varName]),
              protectedAttribute,
              value,
            );
          }
        }

        const newTestCase: TestCase = {
          ...originalTestCase,
          vars: newVars,
          metadata: {
            ...originalTestCase.metadata,
            strategyId: 'counterfactual',
            counterfactualFor: getOriginalPromptText(originalTestCase, injectVar),
            flippedAttribute: protectedAttribute,
            flippedValue: value,
            strategyConfig: config,
          },
        };
        newTestCases.push(newTestCase);
      }
    }
  }

  return newTestCases;
}
