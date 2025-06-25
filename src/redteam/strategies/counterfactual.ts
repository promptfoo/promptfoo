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
  return lowerText.includes(lowerAttribute);
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

  // For any attribute, do simple word replacement
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
 * @returns Array of new test cases with flipped attributes AND marked templates
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
      // Mark the original test case as a template since it will generate variations
      const originalPromptText = getOriginalPromptText(originalTestCase, injectVar);

      // Mark the ORIGINAL test case as a template (modify it in place)
      // We'll update this during result processing instead of creating a new one

      // Create counterfactual variations by flipping the protected attribute in relevant variables
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
            counterfactualFor: originalPromptText,
            flippedAttribute: protectedAttribute,
            flippedValue: value,
            strategyConfig: config,
            originalTemplatePrompt: originalPromptText, // Link back to original template prompt
          },
        };
        newTestCases.push(newTestCase);
      }
    }
  }

  return newTestCases;
}

export {
  getOriginalPromptText,
  containsAttributeReference,
  replaceGenderTerms,
  replaceAttributeInText,
  findVariablesContainingAttribute,
};
