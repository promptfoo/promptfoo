import logger from '../../logger';
import { getNunjucksEngine } from '../../util/templates';

import type { TestCase, TestSuite } from '../../types/index';

/**
 * Expands scenarios into individual test cases with templated descriptions.
 * This function merges scenario config vars with test vars and templates the test descriptions.
 * 
 * @param testSuite - The test suite containing scenarios
 * @returns The expanded test cases
 */
export function expandScenarios(testSuite: TestSuite): TestCase[] {
  const tests: TestCase[] = [];
  
  if (!testSuite.scenarios || testSuite.scenarios.length === 0) {
    logger.debug('[expandScenarios] No scenarios to expand');
    return tests;
  }

  logger.debug(`[expandScenarios] Expanding ${testSuite.scenarios.length} scenarios`);
  let scenarioIndex = 0;
  for (const scenario of testSuite.scenarios) {
    logger.debug(`[expandScenarios] Processing scenario ${scenarioIndex}, config length: ${scenario.config?.length}, tests length: ${scenario.tests?.length}`);
    for (const data of scenario.config) {
      // Merge defaultTest with scenario config
      const scenarioTests = (
        scenario.tests || [
          {
            // Dummy test for cases when we're only comparing raw prompts.
          },
        ]
      ).map((test) => {
        // Merge metadata from all sources
        const mergedMetadata = {
          ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.metadata : {}),
          ...data.metadata,
          ...test.metadata,
        };

        // Auto-generate scenarioConversationId if no conversationId is set
        // This ensures each scenario has isolated conversation history by default
        // Users can still override by setting their own conversationId
        if (!mergedMetadata.conversationId) {
          mergedMetadata.conversationId = `__scenario_${scenarioIndex}__`;
        }

        // Merge vars from all sources
        const mergedVars = {
          ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest?.vars : {}),
          ...data.vars,
          ...test.vars,
        };

        // Template the test description with merged vars if description exists
        let templatedDescription = test.description;
        if (test.description && typeof test.description === 'string') {
          logger.debug(`Templating description: "${test.description}" with vars: ${JSON.stringify(mergedVars)}`);
          try {
            templatedDescription = getNunjucksEngine().renderString(test.description, mergedVars);
            logger.debug(`Templated description: "${templatedDescription}"`);
          } catch (error) {
            logger.debug(`Failed to template test description: ${error}`);
            // Keep original description if templating fails
          }
        }

        return {
          ...(typeof testSuite.defaultTest === 'object' ? testSuite.defaultTest : {}),
          ...data,
          ...test,
          description: templatedDescription,
          vars: mergedVars,
          options: {
            ...(typeof testSuite.defaultTest === 'object'
              ? testSuite.defaultTest?.options
              : {}),
            ...test.options,
          },
          assert: [
            // defaultTest.assert is omitted because it will be added to each test case later
            ...(data.assert || []),
            ...(test.assert || []),
          ],
          metadata: mergedMetadata,
        };
      });
      // Add scenario tests to tests
      tests.push(...scenarioTests);
      scenarioIndex++;
    }
  }

  return tests;
}
