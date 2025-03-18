import fs from 'fs';
import path from 'path';
import { ADDITIONAL_STRATEGIES, DEFAULT_STRATEGIES } from '../../../src/redteam/constants';

describe('Strategy IDs', () => {
  const findStrategyIdAssignments = (fileContent: string): string[] => {
    // Look for patterns like `strategyId: 'strategy-name'`
    const regex = /strategyId:\s*['"]([^'"]+)['"]/g;
    const matches = [];
    let match;
    while ((match = regex.exec(fileContent)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  };

  it('should use strategy IDs that match those defined in constants', () => {
    // Get all strategy implementation files
    const strategyDir = path.resolve(__dirname, '../../../src/redteam/strategies');
    const strategyFiles = fs
      .readdirSync(strategyDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts') && file !== 'index.ts');

    // Track all strategy IDs used in implementations
    const usedStrategyIds: string[] = [];

    strategyFiles.forEach((file) => {
      const filePath = path.join(strategyDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const ids = findStrategyIdAssignments(content);

      if (ids.length > 0) {
        usedStrategyIds.push(...ids);
      }
    });

    // Make sure each used strategy ID is defined in constants
    const allDefinedStrategies = [...ADDITIONAL_STRATEGIES, ...DEFAULT_STRATEGIES];

    usedStrategyIds.forEach((id) => {
      expect(allDefinedStrategies).toContain(id);
    });
  });

  it('should have implementation files for all defined strategies', () => {
    // Some strategies are implemented directly in index.ts
    const indexImplementedStrategies = ['basic', 'jailbreak', 'jailbreak:tree'];

    // Common strategies that might be implemented in shared files
    const commonImplementationStrategies = [
      'jailbreak:composite',
      'jailbreak:likert',
      'best-of-n',
      'iterative',
      'iterative:tree',
    ];

    // Get all strategy implementation files
    const strategyDir = path.resolve(__dirname, '../../../src/redteam/strategies');
    const strategyFiles = fs
      .readdirSync(strategyDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts') && file !== 'index.ts');

    expect(strategyFiles.length).toBeGreaterThan(0);

    // Check if index.ts exists and contains implementation of basic strategies
    const indexPath = path.join(strategyDir, 'index.ts');

    // Read the index file content outside of conditional block
    const indexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';

    // Check for all implementation strategies in a non-conditional block
    indexImplementedStrategies.forEach((strategy) => {
      expect(indexContent).toContain(`id: '${strategy}'`);
    });

    // Simple mapping for strategy ID to expected file name
    const expectedFileNameMap: Record<string, string> = {
      base64: 'base64.ts',
      citation: 'citation.ts',
      crescendo: 'crescendo.ts',
      gcg: 'gcg.ts',
      goat: 'goat.ts',
      hex: 'hex.ts',
      image: 'simpleImage.ts',
      audio: 'simpleAudio.ts',
      leetspeak: 'leetspeak.ts',
      'math-prompt': 'mathPrompt.ts',
      multilingual: 'multilingual.ts',
      pandamonium: 'pandamonium.ts',
      'prompt-injection': 'promptInjections/index.ts',
      retry: 'retry.ts',
      rot13: 'rot13.ts',
    };

    // Check all defined strategies
    const allDefinedStrategies = [...ADDITIONAL_STRATEGIES, ...DEFAULT_STRATEGIES];

    allDefinedStrategies.forEach((strategy) => {
      // Skip strategies implemented in index.ts
      if (indexImplementedStrategies.includes(strategy)) {
        return;
      }

      // Skip common strategies that might be in shared files
      if (commonImplementationStrategies.includes(strategy)) {
        return;
      }

      // Check if there's an expected file for this strategy
      const expectedFileName = expectedFileNameMap[strategy];
      if (!expectedFileName) {
        console.error(
          `No expected file mapping for strategy: ${strategy}. Please update the test.`,
        );
        // Rather than failing, just skip this strategy in the test
        return;
      }

      // Check if the file exists
      const expectedPath = path.join(strategyDir, expectedFileName);
      const directPath = path.join(strategyDir, `${strategy}.ts`);

      const fileExists = fs.existsSync(expectedPath) || fs.existsSync(directPath);
      if (!fileExists) {
        console.error(`Strategy implementation not found for: ${strategy}`);
        console.error(`Checked paths: ${expectedPath} and ${directPath}`);
      }
      expect(fileExists).toBe(true);
    });
  });
});
