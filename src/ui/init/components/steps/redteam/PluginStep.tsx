/**
 * PluginStep - Multi-select plugins for red team evaluation.
 *
 * Allows users to select from categorized plugins with descriptions.
 */

import { useEffect, useMemo } from 'react';

import { Box, Text, useInput } from 'ink';
import { getDefaultPlugins, PLUGIN_CATALOG } from '../../../data/plugins';
import { MultiSelect } from '../../shared/MultiSelect';
import { NavigationBar } from '../../shared/NavigationBar';

import type { PluginSelection } from '../../../machines/initMachine.types';
import type { MultiSelectItem } from '../../shared/MultiSelect';

export interface PluginStepProps {
  /** Currently selected plugins */
  selected: PluginSelection[];
  /** Callback when selection changes */
  onSelect: (plugins: PluginSelection[]) => void;
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
 * PluginStep component for selecting plugins.
 */
export function PluginStep({
  selected,
  onSelect,
  onConfirm,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: PluginStepProps) {
  // Flatten plugin catalog into items for MultiSelect
  const pluginItems: MultiSelectItem<string>[] = useMemo(() => {
    const items: MultiSelectItem<string>[] = [];
    for (const category of PLUGIN_CATALOG) {
      for (const plugin of category.plugins) {
        items.push({
          value: plugin.id,
          label: plugin.name,
          description: plugin.description,
          group: category.name,
        });
      }
    }
    return items;
  }, []);

  // Get selected plugin IDs
  const selectedIds = useMemo(() => selected.map((p) => p.id), [selected]);

  // Sync defaults to state on mount if nothing selected
  useEffect(() => {
    if (selected.length === 0) {
      const defaultPlugins = getDefaultPlugins().map((id) => ({ id }));
      onSelect(defaultPlugins);
    }
  }, [selected.length, onSelect]);

  // Handle selection change
  const handleSelect = (ids: string[]) => {
    const newSelection: PluginSelection[] = ids.map((id) => {
      // Preserve existing config if any
      const existing = selected.find((p) => p.id === id);
      return existing || { id };
    });
    onSelect(newSelection);
  };

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
  const effectiveSelected = selectedIds.length === 0 ? getDefaultPlugins() : selectedIds;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select plugins to include in your evaluation</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Each plugin tests for a specific vulnerability category.</Text>
      </Box>

      <MultiSelect
        items={pluginItems}
        selected={effectiveSelected}
        onSelect={handleSelect}
        onConfirm={onConfirm}
        searchable={true}
        searchPlaceholder="Press / to search plugins..."
        maxVisible={12}
        isFocused={isFocused}
        minSelections={1}
      />

      <Box marginTop={1}>
        <NavigationBar
          canGoBack={true}
          showNext={true}
          nextLabel={`Continue with ${effectiveSelected.length} plugin${effectiveSelected.length !== 1 ? 's' : ''}`}
          nextDisabled={effectiveSelected.length === 0}
          showHelp={false}
        />
      </Box>
    </Box>
  );
}
