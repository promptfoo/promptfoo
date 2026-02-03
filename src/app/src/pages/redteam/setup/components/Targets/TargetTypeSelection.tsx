import { useEffect, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { isInputComposing } from '@app/utils/keyboard';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import LoadExampleButton from '../LoadExampleButton';
import PageWrapper from '../PageWrapper';
import { getProviderType } from './helpers';
import ProviderTypeSelector from './ProviderTypeSelector';

import type { ProviderOptions } from '../../types';

interface TargetTypeSelectionProps {
  onNext: () => void;
  onBack?: () => void;
}

/**
 * TargetTypeSelection component for the red team setup wizard.
 * This component allows the user to select the type of target they want to test.
 * @param {TargetTypeSelectionProps} props - The component props.
 * @param {() => void} props.onNext - Callback function to proceed to the next step.
 * @param {() => void} [props.onBack] - Optional callback function to go back to the previous step.
 */
export default function TargetTypeSelection({ onNext, onBack }: TargetTypeSelectionProps) {
  const { config, updateConfig, providerType, setProviderType } = useRedTeamConfig();

  // Check if we have a complete saved configuration
  // For custom providers, id is intentionally empty but providerType is set to 'custom'
  const hasCompleteSavedConfig = Boolean(
    config.target?.label?.trim() && (config.target?.id || providerType === 'custom'),
  );

  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(() => {
    // If we have a complete saved config, use it. Otherwise start fresh with empty selection
    if (hasCompleteSavedConfig) {
      return config.target!;
    }
    // Start with empty target - no default provider selected
    return { id: '', label: '', config: {} };
  });

  // Only show target type section if we have a complete saved configuration
  const [showTargetTypeSection, setShowTargetTypeSection] = useState(hasCompleteSavedConfig);

  const { recordEvent } = useTelemetry();

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_target_type_selection' });
    // Initialize providerType if not already set
    if (!providerType && config.target?.id) {
      setProviderType(getProviderType(config.target.id));
    }
  }, []);

  /**
   * Handles the change of the provider.
   * @param {ProviderOptions} provider - The selected provider.
   * @param {string} providerType - The type of the selected provider.
   * @param {'quick-select'} [source] - The source of the change.
   */
  const handleProviderChange = (
    provider: ProviderOptions,
    providerType: string,
    source?: 'quick-select',
  ) => {
    // Preserve the user's entered label when switching providers
    const updatedProvider = {
      ...provider,
      label: provider.label || selectedTarget.label,
    };
    setSelectedTarget(updatedProvider);
    setProviderType(providerType);
    updateConfig('target', updatedProvider);
    recordEvent('feature_used', {
      feature: 'redteam_config_target_type_changed',
      target: provider.id,
      source,
    });
  };

  /**
   * Quick-select handler for inline description buttons.
   * Provider IDs must match those in ProviderTypeSelector.handleProviderTypeSelect
   * @param {'custom' | 'python' | 'javascript' | 'exec'} type - The type of the provider to quick-select.
   */
  const handleQuickSelect = (type: 'custom' | 'python' | 'javascript' | 'exec') => {
    const providerConfigs: Record<typeof type, { id: string; providerType: string }> = {
      custom: { id: '', providerType: 'custom' },
      python: { id: 'file:///path/to/custom_provider.py', providerType: 'python' },
      javascript: { id: 'file:///path/to/custom_provider.js', providerType: 'javascript' },
      exec: { id: 'exec:/path/to/script.sh', providerType: 'exec' },
    };

    const config = providerConfigs[type];
    handleProviderChange(
      { id: config.id, label: selectedTarget.label, config: {} },
      config.providerType,
      'quick-select',
    );
  };

  /**
   * Handles the next button click.
   */
  const handleNext = () => {
    // If target type section is not shown yet, show it first
    if (hasTargetName && !showTargetTypeSection) {
      setShowTargetTypeSection(true);
      recordEvent('feature_used', {
        feature: 'redteam_config_target_type_section_revealed',
      });
      return;
    }

    // If target type section is shown and selection is valid, proceed to next step
    if (showTargetTypeSection && isValidSelection()) {
      // Track provider type selection when moving to next step
      recordEvent('feature_used', {
        feature: 'redteam_config_provider_selected',
        provider_type: providerType,
        provider_id: selectedTarget.id,
        provider_label: selectedTarget.label,
      });
      onNext();
    }
  };

  /**
   * Checks if the current selection is valid.
   * @returns {boolean} - True if the selection is valid, false otherwise.
   */
  const isValidSelection = () => {
    // For custom providers, we allow empty id since it will be configured in the next step
    // But only if providerType is explicitly set to 'custom'
    if (providerType === 'custom' && selectedTarget.label?.trim()) {
      return true; // Custom provider with a label is valid
    }
    return selectedTarget.id && selectedTarget.id.trim() !== '';
  };

  // Check if user has entered a target name - must have actual content
  const hasTargetName = Boolean(selectedTarget?.label?.trim());

  /**
   * Gets the text for the next button.
   * @returns {string} - The text for the next button.
   */
  const getNextButtonText = () => {
    return 'Next';
  };

  /**
   * Checks if the next button should be disabled.
   * @returns {boolean} - True if the next button should be disabled, false otherwise.
   */
  const isNextButtonDisabled = () => {
    return !hasTargetName || !isValidSelection();
  };

  /**
   * Checks if the footer button should be shown.
   * @returns {boolean} - True if the footer button should be shown, false otherwise.
   */
  const shouldShowFooterButton = () => {
    return showTargetTypeSection;
  };

  /**
   * Gets the tooltip for the next button.
   * @returns {string | undefined} - The tooltip text, or undefined if no tooltip should be shown.
   */
  const getNextButtonTooltip = () => {
    if (!showTargetTypeSection) {
      return 'Please select a target type first';
    }
    if (!hasTargetName) {
      return 'Please enter a target name';
    }
    if (!isValidSelection()) {
      if (!selectedTarget.id && !selectedTarget.label?.trim()) {
        return 'Please select a target provider';
      }
      if (selectedTarget.id === '' && !selectedTarget.label?.trim()) {
        return 'Please enter a label for your custom provider';
      }
      return 'Please complete the target selection';
    }
    return undefined;
  };

  return (
    <PageWrapper
      title="Target Setup"
      description="Configure the AI system you want to test"
      onNext={shouldShowFooterButton() ? handleNext : undefined}
      onBack={onBack}
      nextLabel={shouldShowFooterButton() ? getNextButtonText() : undefined}
      nextDisabled={shouldShowFooterButton() ? isNextButtonDisabled() : true}
      warningMessage={
        shouldShowFooterButton() && isNextButtonDisabled() ? getNextButtonTooltip() : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {/* Quick Start */}
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted px-4 py-3">
          <p className="text-sm text-foreground">
            New to red teaming? Load an example to explore the setup.
          </p>
          <LoadExampleButton />
        </div>

        {/* Target Name */}
        <div className="space-y-2">
          <Label htmlFor="target-name" className="text-sm font-semibold">
            Target Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="target-name"
            className="max-w-md"
            value={selectedTarget?.label ?? ''}
            placeholder="e.g. support-agent or booking-assistant"
            onChange={(e) => {
              const newTarget = { ...selectedTarget, label: e.target.value };
              setSelectedTarget(newTarget);
              updateConfig('target', newTarget);
            }}
            onKeyDown={(e) => {
              if (isInputComposing(e)) {
                return;
              }
              if (e.key === 'Enter' && hasTargetName && !showTargetTypeSection) {
                setShowTargetTypeSection(true);
                recordEvent('feature_used', {
                  feature: 'redteam_config_target_type_section_revealed',
                });
              }
            }}
            autoFocus
          />
        </div>

        {/* Continue button - shown before target type is revealed */}
        {hasTargetName && !showTargetTypeSection && (
          <div>
            <Button
              onClick={() => {
                setShowTargetTypeSection(true);
                recordEvent('feature_used', {
                  feature: 'redteam_config_target_type_section_revealed',
                });
              }}
            >
              Continue
            </Button>
          </div>
        )}

        {/* Target Type Selection */}
        {showTargetTypeSection && (
          <section className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Select Target Type</Label>
              <p className="text-sm text-muted-foreground">
                Select the type that best matches your target. Don't see what you need? Try{' '}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm font-normal"
                  aria-label="Select Custom Provider type"
                  onClick={() => handleQuickSelect('custom')}
                >
                  Custom Provider
                </Button>{' '}
                to access{' '}
                <a
                  href="https://www.promptfoo.dev/docs/providers/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  more providers
                </a>
                . You can also create your own using{' '}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm font-normal"
                  aria-label="Select Python provider type"
                  onClick={() => handleQuickSelect('python')}
                >
                  Python
                </Button>
                ,{' '}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm font-normal"
                  aria-label="Select JavaScript provider type"
                  onClick={() => handleQuickSelect('javascript')}
                >
                  JavaScript
                </Button>
                , or{' '}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm font-normal"
                  aria-label="Select Shell Script provider type"
                  onClick={() => handleQuickSelect('exec')}
                >
                  Shell Scripts
                </Button>
                .
              </p>
            </div>

            <ProviderTypeSelector
              provider={selectedTarget}
              setProvider={handleProviderChange}
              providerType={providerType}
            />
          </section>
        )}
      </div>
    </PageWrapper>
  );
}
