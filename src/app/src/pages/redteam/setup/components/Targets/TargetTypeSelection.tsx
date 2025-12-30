import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { Info } from 'lucide-react';
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
      description={
        <span className="text-base">
          A target is the AI system you want to red team. It could be an API endpoint, a language
          model, a custom script, or any other{' '}
          <a
            href="https://www.promptfoo.dev/docs/providers/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            supported provider
          </a>
          . Choose a descriptive name to identify your target throughout the testing process.
        </span>
      }
      onNext={shouldShowFooterButton() ? handleNext : undefined}
      onBack={onBack}
      nextLabel={shouldShowFooterButton() ? getNextButtonText() : undefined}
      nextDisabled={shouldShowFooterButton() ? isNextButtonDisabled() : true}
      warningMessage={
        shouldShowFooterButton() && isNextButtonDisabled() ? getNextButtonTooltip() : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {/* Quick Start Section */}
        <Alert variant="info" className="[&>svg]:hidden">
          <AlertDescription className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-3">
              <Info className="h-4 w-4 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-4">
                <span className="min-w-[300px] flex-1 text-sm">
                  <strong>New to Promptfoo</strong> and want to see it in action? Load an example
                  configuration to get started immediately.
                </span>
                <LoadExampleButton />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>Have an existing YAML config?</strong> Use the <strong>"Load Config"</strong>{' '}
              button in the sidebar to import it and pre-fill the form.
            </p>
          </AlertDescription>
        </Alert>

        {/* Provider Name Field */}
        <div className="w-[360px] space-y-2">
          <Label htmlFor="target-name">
            Target Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="target-name"
            value={selectedTarget?.label ?? ''}
            placeholder="e.g. 'customer-service-agent'"
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
        </div>

        {/* Inline Next Button for first step */}
        {hasTargetName && !showTargetTypeSection && (
          <div className="flex justify-start">
            <Button
              onClick={() => {
                setShowTargetTypeSection(true);
                recordEvent('feature_used', {
                  feature: 'redteam_config_target_type_section_revealed',
                });
              }}
              className="min-w-[200px]"
            >
              Next: Select Target Type
            </Button>
          </div>
        )}

        {/* Only show target type selection after user clicks to reveal it */}
        {showTargetTypeSection && (
          <div className="mt-6 space-y-4">
            <h2 className="mt-6 text-xl font-bold">Select Target Type</h2>
            <p className="text-base">
              Select the type that best matches your target. Don't see what you need? Try 'Custom
              Target' to access{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                more providers
              </a>
              . You can also create your own using{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/python/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Python
              </a>
              ,{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/custom-api/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                JavaScript
              </a>
              , or{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/custom-script/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                shell scripts
              </a>
              .
            </p>
            {/* Provider Type Selection */}
            <ProviderTypeSelector
              provider={selectedTarget}
              setProvider={handleProviderChange}
              providerType={providerType}
            />
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
