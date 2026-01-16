/**
 * ProviderStep - Select model provider with API key status.
 */

import { useMemo } from 'react';

import { Box, Text } from 'ink';

import type { ProviderOptions } from '../../../../types/providers';
import type { ProviderChoice, SelectItem, UseCase } from '../../types';
import { getProviderChoices } from '../../utils/providers';
import { SelectInput } from '../shared/SelectInput';

export interface ProviderStepProps {
  /** Current use case */
  useCase: UseCase;
  /** Current selection */
  value: (string | ProviderOptions)[];
  /** Called when selection changes */
  onChange: (value: (string | ProviderOptions)[]) => void;
  /** Called when user confirms selection */
  onSubmit: (value: (string | ProviderOptions)[]) => void;
  /** Whether the component is focused */
  isFocused?: boolean;
  /** Called when search mode state changes */
  onSearchStateChange?: (isSearching: boolean) => void;
}

type ProviderValue = (string | ProviderOptions)[];

export function ProviderStep({
  useCase,
  value,
  onChange,
  onSubmit,
  isFocused = true,
  onSearchStateChange,
}: ProviderStepProps) {
  // Get provider choices based on use case
  const providerChoices = useMemo(() => getProviderChoices(useCase), [useCase]);

  // Convert to SelectItem format with groups
  const items: SelectItem<ProviderValue>[] = useMemo(() => {
    const result: SelectItem<ProviderValue>[] = [];

    // Group by category
    const recommended = providerChoices.filter((p) => p.category === 'recommended');
    const cloud = providerChoices.filter((p) => p.category === 'cloud');
    const local = providerChoices.filter((p) => p.category === 'local');
    const custom = providerChoices.filter((p) => p.category === 'custom');

    const addItems = (choices: ProviderChoice[], group: string) => {
      choices.forEach((choice) => {
        result.push({
          value: Array.isArray(choice.value) ? choice.value : [choice.value],
          label: choice.label,
          description: choice.description,
          status: choice.status,
          group,
        });
      });
    };

    if (recommended.length > 0) {
      addItems(recommended, 'Recommended');
    }
    if (cloud.length > 0) {
      addItems(cloud, 'Cloud Providers');
    }
    if (local.length > 0) {
      addItems(local, 'Local / Self-Hosted');
    }
    if (custom.length > 0) {
      addItems(custom, 'Custom');
    }

    return result;
  }, [providerChoices]);

  // Find current value in items
  const currentValue = useMemo(() => {
    if (value.length === 0) {
      return items[0]?.value ?? null;
    }
    // Try to find matching item
    const match = items.find((item) => {
      if (item.value.length !== value.length) {
        return false;
      }
      return item.value.every((v, i) => {
        const other = value[i];
        if (typeof v === 'string' && typeof other === 'string') {
          return v === other;
        }
        // For objects, compare by id
        if (typeof v === 'object' && typeof other === 'object') {
          return (v as ProviderOptions).id === (other as ProviderOptions).id;
        }
        return false;
      });
    });
    return match?.value ?? value;
  }, [items, value]);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>Which model provider would you like to use?</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          <Text color="green">✓</Text> = API key set {'  '}
          <Text color="red">✗</Text> = API key missing {'  '}
          <Text color="blue">●</Text> = Local (no key needed)
        </Text>
      </Box>

      <SelectInput<ProviderValue>
        items={items}
        value={currentValue}
        onChange={onChange}
        onSubmit={onSubmit}
        isFocused={isFocused}
        maxVisible={12}
        searchable
        onSearchStateChange={onSearchStateChange}
      />
    </Box>
  );
}
