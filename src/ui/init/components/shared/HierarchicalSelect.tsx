/**
 * HierarchicalSelect - Two-level selection for providers.
 *
 * First level: Select provider families (OpenAI, Anthropic, etc.)
 * Second level: Select specific models within each family
 */

import { useMemo, useState } from 'react';

import { Box, Text, useInput } from 'ink';
import { isApiKeySet } from '../../data/providers';

import type { ProviderFamily, SelectedProvider } from '../../machines/initMachine.types';

export interface HierarchicalSelectProps {
  /** Available provider families */
  families: ProviderFamily[];
  /** Currently selected providers */
  selected: SelectedProvider[];
  /** Callback when selection changes */
  onSelect: (selected: SelectedProvider[]) => void;
  /** Callback when confirmed */
  onConfirm?: () => void;
  /** Whether the component is focused */
  isFocused?: boolean;
  /** Maximum visible items */
  maxVisible?: number;
}

interface FamilyState {
  familyId: string;
  expanded: boolean;
  selectedModels: string[];
}

/**
 * HierarchicalSelect component for provider/model selection.
 */
export function HierarchicalSelect({
  families,
  selected,
  onSelect,
  onConfirm,
  isFocused = true,
  maxVisible = 12,
}: HierarchicalSelectProps) {
  // Convert selected providers to family state
  const [familyStates, setFamilyStates] = useState<Map<string, FamilyState>>(() => {
    const states = new Map<string, FamilyState>();
    for (const provider of selected) {
      states.set(provider.family, {
        familyId: provider.family,
        expanded: false,
        selectedModels: provider.models,
      });
    }
    return states;
  });

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Build flat list of items for navigation
  interface FlatItem {
    type: 'family' | 'model';
    familyId: string;
    modelId?: string;
    label: string;
    description?: string;
    hasApiKey?: boolean;
  }

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    const query = searchQuery.toLowerCase();

    for (const family of families) {
      // Filter by search
      if (query) {
        const familyMatches =
          family.name.toLowerCase().includes(query) ||
          family.description.toLowerCase().includes(query);
        const modelMatches = family.models.some(
          (m) =>
            m.name.toLowerCase().includes(query) || m.description.toLowerCase().includes(query),
        );
        if (!familyMatches && !modelMatches) {
          continue;
        }
      }

      const state = familyStates.get(family.id);
      const isExpanded = state?.expanded || false;
      const hasApiKey = isApiKeySet(family);

      items.push({
        type: 'family',
        familyId: family.id,
        label: `${family.icon} ${family.name}`,
        description: family.description,
        hasApiKey,
      });

      // Add models if expanded
      if (isExpanded) {
        for (const model of family.models) {
          // Filter models by search too
          if (query) {
            const modelMatches =
              model.name.toLowerCase().includes(query) ||
              model.description.toLowerCase().includes(query);
            if (!modelMatches) {
              continue;
            }
          }

          items.push({
            type: 'model',
            familyId: family.id,
            modelId: model.id,
            label: model.name,
            description: model.description,
          });
        }
      }
    }

    return items;
  }, [families, familyStates, searchQuery]);

  // Calculate visible window
  const startIndex = Math.max(
    0,
    Math.min(highlightedIndex - Math.floor(maxVisible / 2), flatItems.length - maxVisible),
  );
  const visibleItems = flatItems.slice(startIndex, startIndex + maxVisible);

  // Check if family is selected (has at least one model selected)
  const isFamilySelected = (familyId: string) => {
    const state = familyStates.get(familyId);
    return state && state.selectedModels.length > 0;
  };

  // Check if model is selected
  const isModelSelected = (familyId: string, modelId: string) => {
    const state = familyStates.get(familyId);
    return state?.selectedModels.includes(modelId) || false;
  };

  // Toggle family expansion
  const toggleFamily = (familyId: string) => {
    setFamilyStates((prev) => {
      const newStates = new Map(prev);
      const current = newStates.get(familyId);
      if (current) {
        newStates.set(familyId, { ...current, expanded: !current.expanded });
      } else {
        // Initialize with default models selected
        const family = families.find((f) => f.id === familyId);
        const defaultModels =
          family?.models.filter((m) => m.defaultSelected).map((m) => m.id) || [];
        newStates.set(familyId, {
          familyId,
          expanded: true,
          selectedModels: defaultModels,
        });
      }
      return newStates;
    });
  };

  // Toggle model selection
  const toggleModel = (familyId: string, modelId: string) => {
    setFamilyStates((prev) => {
      const newStates = new Map(prev);
      const current = newStates.get(familyId);
      if (current) {
        const isSelected = current.selectedModels.includes(modelId);
        const newModels = isSelected
          ? current.selectedModels.filter((m) => m !== modelId)
          : [...current.selectedModels, modelId];
        newStates.set(familyId, { ...current, selectedModels: newModels });
      }
      return newStates;
    });

    // Update selected providers
    updateSelectedProviders();
  };

  // Sync family states to selected providers
  const updateSelectedProviders = () => {
    const newSelected: SelectedProvider[] = [];
    for (const [familyId, state] of familyStates) {
      if (state.selectedModels.length > 0) {
        newSelected.push({
          family: familyId,
          models: state.selectedModels,
        });
      }
    }
    onSelect(newSelected);
  };

  // Get total selected count
  const totalSelected = useMemo(() => {
    let count = 0;
    for (const state of familyStates.values()) {
      count += state.selectedModels.length;
    }
    return count;
  }, [familyStates]);

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isFocused) {
        return;
      }

      // Search mode
      if (input === '/' && !isSearching) {
        setIsSearching(true);
        return;
      }

      if (isSearching) {
        if (key.escape) {
          setIsSearching(false);
          setSearchQuery('');
          return;
        }
        if (key.backspace || key.delete) {
          setSearchQuery((q) => q.slice(0, -1));
          setHighlightedIndex(0);
          return;
        }
        if (key.return) {
          setIsSearching(false);
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setSearchQuery((q) => q + input);
          setHighlightedIndex(0);
          return;
        }
        return;
      }

      // Navigation
      if (key.upArrow || input === 'k') {
        setHighlightedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setHighlightedIndex((i) => Math.min(flatItems.length - 1, i + 1));
        return;
      }

      // Toggle expansion (for families) or selection (for models)
      if (input === ' ' || key.return) {
        const item = flatItems[highlightedIndex];
        if (!item) {
          return;
        }

        if (item.type === 'family') {
          toggleFamily(item.familyId);
        } else if (item.type === 'model' && item.modelId) {
          toggleModel(item.familyId, item.modelId);
        }
        return;
      }

      // Right arrow to expand family
      if (key.rightArrow) {
        const item = flatItems[highlightedIndex];
        if (item?.type === 'family') {
          const state = familyStates.get(item.familyId);
          if (!state?.expanded) {
            toggleFamily(item.familyId);
          }
        }
        return;
      }

      // Left arrow to collapse family
      if (key.leftArrow) {
        const item = flatItems[highlightedIndex];
        if (item?.type === 'family') {
          const state = familyStates.get(item.familyId);
          if (state?.expanded) {
            toggleFamily(item.familyId);
          }
        } else if (item?.type === 'model') {
          // Collapse parent and move to it
          const familyIndex = flatItems.findIndex(
            (i) => i.type === 'family' && i.familyId === item.familyId,
          );
          if (familyIndex >= 0) {
            toggleFamily(item.familyId);
            setHighlightedIndex(familyIndex);
          }
        }
        return;
      }

      // Confirm with Enter when something is selected
      if (key.return && totalSelected > 0 && onConfirm) {
        // Sync before confirming
        const newSelected: SelectedProvider[] = [];
        for (const [familyId, state] of familyStates) {
          if (state.selectedModels.length > 0) {
            newSelected.push({
              family: familyId,
              models: state.selectedModels,
            });
          }
        }
        onSelect(newSelected);
        onConfirm();
        return;
      }

      // Clear search
      if (key.escape && searchQuery) {
        setSearchQuery('');
        setHighlightedIndex(0);
        return;
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column">
      {/* Search */}
      <Box marginBottom={1}>
        {isSearching ? (
          <Box>
            <Text color="yellow">/</Text>
            <Text>{searchQuery}</Text>
            <Text color="gray">█</Text>
          </Box>
        ) : searchQuery ? (
          <Box>
            <Text dimColor>Filter: </Text>
            <Text color="cyan">{searchQuery}</Text>
            <Text dimColor> ({flatItems.length} matches)</Text>
          </Box>
        ) : (
          <Text dimColor>Select providers and models [/] to search</Text>
        )}
      </Box>

      {/* Items */}
      <Box flexDirection="column">
        {startIndex > 0 && <Text dimColor> ↑ {startIndex} more above</Text>}

        {visibleItems.map((item, visibleIndex) => {
          const actualIndex = startIndex + visibleIndex;
          const isHighlighted = actualIndex === highlightedIndex;

          if (item.type === 'family') {
            const state = familyStates.get(item.familyId);
            const isExpanded = state?.expanded || false;
            const familySelected = isFamilySelected(item.familyId);
            const modelCount = state?.selectedModels.length || 0;

            return (
              <Box key={item.familyId} flexDirection="row">
                <Text color={isHighlighted ? 'cyan' : undefined}>
                  {isHighlighted ? '▸ ' : '  '}
                </Text>
                <Text>{isExpanded ? '▼ ' : '▶ '}</Text>
                <Text color={familySelected ? 'green' : undefined} bold={isHighlighted}>
                  {item.label}
                </Text>
                {modelCount > 0 && <Text color="green"> ({modelCount})</Text>}
                {!item.hasApiKey && <Text color="yellow"> ⚠ API key not set</Text>}
              </Box>
            );
          } else {
            // Model item
            const modelSelected = isModelSelected(item.familyId, item.modelId!);

            return (
              <Box key={item.modelId} flexDirection="row">
                <Text color={isHighlighted ? 'cyan' : undefined}>
                  {isHighlighted ? '▸ ' : '  '}
                </Text>
                <Text> </Text>
                <Text color={modelSelected ? 'green' : undefined}>
                  {modelSelected ? '[x] ' : '[ ] '}
                </Text>
                <Text color={isHighlighted ? 'cyan' : undefined} bold={isHighlighted}>
                  {item.label}
                </Text>
                {item.description && <Text dimColor> - {item.description}</Text>}
              </Box>
            );
          }
        })}

        {startIndex + maxVisible < flatItems.length && (
          <Text dimColor> ↓ {flatItems.length - startIndex - maxVisible} more below</Text>
        )}

        {flatItems.length === 0 && <Text dimColor>No providers found</Text>}
      </Box>

      {/* Status and hints */}
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text color={totalSelected > 0 ? 'green' : 'yellow'}>
          {totalSelected} model{totalSelected !== 1 ? 's' : ''} selected
        </Text>
        <Text dimColor>[Space/Enter] toggle [←/→] expand/collapse [/] search</Text>
      </Box>
    </Box>
  );
}
