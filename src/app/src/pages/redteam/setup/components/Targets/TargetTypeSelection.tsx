import { useEffect, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import LoadExampleButton from '../LoadExampleButton';
import PageWrapper from '../PageWrapper';
import { getProviderType } from './helpers';
import ProviderTypeSelector from './ProviderTypeSelector';

import type { ProviderOptions } from '../../types';

interface TargetTypeSelectionProps {
  onNext: () => void;
  onBack?: () => void;
}

export default function TargetTypeSelection({ onNext, onBack }: TargetTypeSelectionProps) {
  const { config, updateConfig, providerType, setProviderType } = useRedTeamConfig();

  // Check if we have a complete saved configuration
  // For custom providers, id is intentionally empty but providerType is set to 'custom'
  const hasCompleteSavedConfig = Boolean(
    config.target?.label?.trim() && (config.target?.id || providerType === 'custom'),
  );

  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(() => {
    // If we have a complete saved config, use it. Otherwise start fresh without a label
    if (hasCompleteSavedConfig) {
      return config.target!;
    }
    // Clear the label if we don't have a complete config to ensure consistent state
    return { ...(config.target || DEFAULT_HTTP_TARGET), label: '' };
  });

  // Only show target type section if we have a complete saved configuration
  const [showTargetTypeSection, setShowTargetTypeSection] = useState(hasCompleteSavedConfig);

  const { recordEvent } = useTelemetry();

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_target_type_selection' });
    // Initialize providerType if not already set
    if (!providerType && config.target?.id) {
      setProviderType(getProviderType(config.target.id));
    }
  }, []);

  const handleProviderChange = (provider: ProviderOptions, providerType: string) => {
    setSelectedTarget(provider);
    setProviderType(providerType);
    updateConfig('target', provider);
    recordEvent('feature_used', {
      feature: 'redteam_config_target_type_changed',
      target: provider.id,
    });
  };

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

  const isValidSelection = () => {
    // For custom providers, we allow empty id since it will be configured in the next step
    if (selectedTarget.id === '' && selectedTarget.label?.trim()) {
      return true; // Custom provider with a label is valid
    }
    return selectedTarget.id && selectedTarget.id.trim() !== '';
  };

  // Check if user has entered a target name - must have actual content
  const hasTargetName = Boolean(selectedTarget?.label?.trim());

  const getNextButtonText = () => {
    return 'Next: Configure Target';
  };

  const isNextButtonDisabled = () => {
    return !hasTargetName || !isValidSelection();
  };

  const shouldShowFooterButton = () => {
    return showTargetTypeSection;
  };

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
        <div className="flex items-center gap-3">
          <LoadExampleButton />
          <span className="text-sm text-muted-foreground">New to Promptfoo? Try a demo</span>
        </div>

        {/* Target Name */}
        <div className="max-w-md space-y-2">
          <Label htmlFor="target-name" className="text-sm font-medium">
            Target Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="target-name"
            value={selectedTarget?.label ?? ''}
            placeholder="e.g. onboarding-agent"
            onChange={(e) => {
              const newTarget = { ...selectedTarget, label: e.target.value };
              setSelectedTarget(newTarget);
              updateConfig('target', newTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasTargetName && !showTargetTypeSection) {
                setShowTargetTypeSection(true);
                recordEvent('feature_used', {
                  feature: 'redteam_config_target_type_section_revealed',
                });
              }
            }}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            e.g. <code className="rounded bg-muted px-1 py-0.5">support-agent</code> or{' '}
            <code className="rounded bg-muted px-1 py-0.5">rag-chatbot</code>
          </p>
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
          <section className="space-y-4 border-t border-border pt-6">
            <h2 className="text-base font-semibold text-foreground">Select Target Type</h2>

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
