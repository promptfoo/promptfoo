/**
 * StrategyStep - Multi-select strategies for red team evaluation.
 *
 * Allows users to select from categorized attack strategies.
 */

import { useEffect, useMemo } from 'react';

import { Box, Text, useInput } from 'ink';
import { getDefaultStrategies, STRATEGY_CATALOG } from '../../../data/strategies';
import { MultiSelect } from '../../shared/MultiSelect';
import { NavigationBar } from '../../shared/NavigationBar';

import type { MultiSelectItem } from '../../shared/MultiSelect';

export interface StrategyStepProps {
  /** Currently selected strategy IDs */
  selected: string[];
  /** Callback when selection changes */
  onSelect: (strategies: string[]) => void;
  /** Callback when confirmed */
  onConfirm: () => void;
  /** Callback when going back */
  onBack: () => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
}

/**
 * StrategyStep component for selecting strategies.
 */
export function StrategyStep({
  selected,
  onSelect,
  onConfirm,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: StrategyStepProps) {
  // Flatten strategy catalog into items for MultiSelect
  const strategyItems: MultiSelectItem<string>[] = useMemo(() => {
    const items: MultiSelectItem<string>[] = [];
    for (const category of STRATEGY_CATALOG) {
      for (const strategy of category.strategies) {
        items.push({
          value: strategy.id,
          label: strategy.name,
          description: strategy.description,
          group: category.name,
        });
      }
    }
    return items;
  }, []);

  // Sync defaults to state on mount if nothing selected
  useEffect(() => {
    if (selected.length === 0) {
      const defaultStrategies = getDefaultStrategies();
      onSelect(defaultStrategies);
    }
  }, [selected.length, onSelect]);

  // Handle escape for back navigation
  useInput(
    (_input, key) => {
      if (!isFocused) {
        return;
      }

      if (key.escape) {
        onBack();
        return;
      }
    },
    { isActive: isFocused },
  );

  // Pre-select defaults if nothing selected
  const effectiveSelected = selected.length === 0 ? getDefaultStrategies() : selected;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select strategies to include in your evaluation</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Strategies transform test cases using various attack techniques.</Text>
      </Box>

      <MultiSelect
        items={strategyItems}
        selected={effectiveSelected}
        onSelect={onSelect}
        onConfirm={onConfirm}
        searchable={true}
        searchPlaceholder="Press / to search strategies..."
        maxVisible={12}
        isFocused={isFocused}
        minSelections={0}
      />

      <Box marginTop={1}>
        <NavigationBar
          canGoBack={true}
          showNext={true}
          nextLabel={`Continue with ${effectiveSelected.length} strateg${effectiveSelected.length !== 1 ? 'ies' : 'y'}`}
          showHelp={false}
        />
      </Box>
    </Box>
  );
}
