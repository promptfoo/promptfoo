import { useEffect, useState } from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
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
  const { setTargetConfigError, setTargetConfigDraft, targetConfigRevision } =
    useRedTeamTargetConfigValidation();

  // Keep configured imports even when their optional label is missing. The default HTTP
  // placeholder has no URL and should still require an explicit target-type selection.
  const hasCompleteSavedConfig = Boolean(
    (typeof config.target?.label === 'string' &&
      config.target.label.trim() &&
      (config.target?.id || providerType === 'custom')) ||
      (config.target?.id &&
        (config.target.id !== 'http' ||
          (typeof config.target.config?.url === 'string' && config.target.config.url.trim()) ||
          (typeof config.target.config?.request === 'string' &&
            config.target.config.request.trim()))),
  );

  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(() => {
    // If we have a complete saved config, use it. Otherwise start fresh with empty selection
    if (hasCompleteSavedConfig) {
      return config.target!;
    }
    // Start with empty target - no default provider selected
    return { id: '', label: '', config: {} };
  });

  const { recordEvent } = useTelemetry();

  // A full config load can replace the target while this step remains mounted.
  // Only replacements increment the revision, so incomplete in-progress edits stay local.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync only on full config replacement
  useEffect(() => {
    if (targetConfigRevision) {
      setSelectedTarget(config.target ?? { id: '', label: '', config: {} });
    }
  }, [targetConfigRevision]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_target_type_selection' });
    // Keep persisted providerType aligned with the local selection state on mount.
    if (hasCompleteSavedConfig && !providerType && config.target?.id) {
      setProviderType(getProviderType(config.target.id));
    } else if (!hasCompleteSavedConfig && providerType) {
      setProviderType(undefined);
    }
  }, []);

  const handleProviderChange = (provider: ProviderOptions, providerType: string) => {
    // Preserve the user's entered label when switching providers
    const updatedProvider = {
      ...provider,
      label: provider.label || selectedTarget.label,
    };
    setSelectedTarget(updatedProvider);
    setProviderType(providerType);
    updateConfig('target', updatedProvider);
    setTargetConfigDraft?.(null);
    setTargetConfigError?.(null);
    recordEvent('feature_used', {
      feature: 'redteam_config_target_type_changed',
      target: provider.id,
    });
  };

  const handleNext = () => {
    if (hasTargetName && isValidSelection()) {
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
    // But only if providerType is explicitly set to 'custom'
    if (providerType === 'custom' && selectedTarget.label?.trim()) {
      return true; // Custom provider with a label is valid
    }
    return selectedTarget.id && selectedTarget.id.trim() !== '';
  };

  // Check if user has entered a target name - must have actual content
  const hasTargetName = Boolean(selectedTarget?.label?.trim());

  const getNextButtonText = () => {
    return 'Next';
  };

  const isNextButtonDisabled = () => {
    return !hasTargetName || !isValidSelection();
  };

  const getNextButtonTooltip = () => {
    if (!hasTargetName) {
      return 'Please enter a target name';
    }
    if (!isValidSelection()) {
      return 'Please select a target type';
    }
    return undefined;
  };

  return (
    <PageWrapper
      title="Target Setup"
      description="Configure the AI system you want to test"
      onNext={handleNext}
      onBack={onBack}
      nextLabel={getNextButtonText()}
      nextDisabled={isNextButtonDisabled()}
      warningMessage={isNextButtonDisabled() ? getNextButtonTooltip() : undefined}
    >
      <div className="flex flex-col gap-6">
        {/* Quick Start */}
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
            autoFocus
          />
        </div>

        {/* Target Type Selection */}
        <section className="space-y-4">
          <Label className="text-sm font-semibold">Select Target Type</Label>

          <ProviderTypeSelector
            provider={selectedTarget}
            setProvider={handleProviderChange}
            providerType={providerType}
          />
        </section>
      </div>
    </PageWrapper>
  );
}
