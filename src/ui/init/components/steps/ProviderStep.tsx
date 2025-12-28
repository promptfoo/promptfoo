/**
 * ProviderStep - Select providers and models.
 *
 * Uses HierarchicalSelect for two-level selection:
 * 1. Select provider families
 * 2. Select specific models within each family
 */

import { Box, Text, useInput } from 'ink';
import { getMissingApiKeys, PROVIDER_CATALOG } from '../../data/providers';
import { HierarchicalSelect } from '../shared/HierarchicalSelect';
import { NavigationBar } from '../shared/NavigationBar';

import type { SelectedProvider } from '../../machines/initMachine.types';

export interface ProviderStepProps {
  /** Currently selected providers */
  selected: SelectedProvider[];
  /** Callback when selection changes */
  onSelect: (providers: SelectedProvider[]) => void;
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
 * ProviderStep component for provider/model selection.
 */
export function ProviderStep({
  selected,
  onSelect,
  onConfirm,
  onBack,
  onCancel: _onCancel,
  isFocused = true,
}: ProviderStepProps) {
  // Check for missing API keys
  const selectedFamilies = selected.map((p) => p.family);
  const missingKeys = getMissingApiKeys(selectedFamilies);

  // Handle escape key for back navigation
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

  const totalModels = selected.reduce((sum, p) => sum + p.models.length, 0);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select model providers</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          Expand a provider to select specific models. Select multiple providers to compare them.
        </Text>
      </Box>

      <HierarchicalSelect
        families={PROVIDER_CATALOG}
        selected={selected}
        onSelect={onSelect}
        onConfirm={onConfirm}
        isFocused={isFocused}
      />

      {/* API key warnings */}
      {missingKeys.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {missingKeys.map((missing) => (
            <Box key={missing.envVar}>
              <Text color="yellow">
                ⚠ {missing.family}: Set {missing.envVar} environment variable
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <NavigationBar
        canGoBack={true}
        showNext={true}
        nextLabel={`Continue with ${totalModels} model${totalModels !== 1 ? 's' : ''}`}
        nextDisabled={totalModels === 0}
        showHelp={false}
      />
    </Box>
  );
}
