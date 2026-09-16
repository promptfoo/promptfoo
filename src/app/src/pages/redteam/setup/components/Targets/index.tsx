import { useEffect, useMemo, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
import LoadExampleButton from '../LoadExampleButton';
import PageWrapper from '../PageWrapper';
import Prompts from '../Prompts';
import ProviderEditor from './ProviderEditor';

import type { ProviderOptions } from '../../types';

interface TargetsProps {
  onNext?: () => void;
  onBack?: () => void;
}

const requiresPrompt = (target: ProviderOptions) => {
  return target.id !== 'http' && target.id !== 'websocket' && target.id !== 'browser';
};

const getStructuredTarget = (target: ProviderOptions): ProviderOptions => {
  const config = target.config as unknown;
  if (typeof config !== 'object' || config === null) {
    return { ...target, config: {} };
  }
  const prototype = Object.getPrototypeOf(config);
  return prototype === Object.prototype || prototype === null ? target : { ...target, config: {} };
};

export default function Targets({ onNext, onBack }: TargetsProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(
    config.target || DEFAULT_HTTP_TARGET,
  );
  const structuredTarget = useMemo(() => getStructuredTarget(selectedTarget), [selectedTarget]);
  const { targetConfigError } = useRedTeamTargetConfigValidation();
  const targetError =
    targetConfigError ??
    (structuredTarget === selectedTarget ? null : 'Configuration must be a JSON object');

  const [providerError, setProviderError] = useState<string | null>(null);
  const [promptRequired, setPromptRequired] = useState(requiresPrompt(selectedTarget));

  // Track test states for HTTP providers
  const [isTargetTested, setIsTargetTested] = useState(false);
  const [isSessionTested, setIsSessionTested] = useState(false);

  const { recordEvent } = useTelemetry();

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_targets' });
  }, []);

  useEffect(() => {
    updateConfig('target', selectedTarget);
    setPromptRequired(requiresPrompt(selectedTarget));
    // Reset test states when provider changes
    if (selectedTarget.id === 'http') {
      // Don't reset test states for HTTP providers when config changes
    } else {
      // For non-HTTP providers, reset test states
      setIsTargetTested(false);
      setIsSessionTested(false);
    }
  }, [selectedTarget, updateConfig]);

  const handleProviderChange = (provider: ProviderOptions) => {
    setSelectedTarget((prev) => {
      if (prev.id !== provider.id) {
        // Reset test states when provider type changes
        setIsTargetTested(false);
        setIsSessionTested(false);
      }
      // Always update to the new provider (including config changes)
      return provider;
    });
    recordEvent('feature_used', { feature: 'redteam_config_target_changed', target: provider.id });
  };

  const handleTargetTested = (success: boolean) => {
    setIsTargetTested(success);
  };

  const handleSessionTested = (success: boolean) => {
    setIsSessionTested(success);
  };

  const isProviderValid = () => {
    // Check for explicit errors
    if (providerError || targetError) {
      return false;
    }

    // Additional validation for HTTP and WebSocket providers
    if (selectedTarget.id === 'http') {
      // Check if we're in raw mode (using request field) or structured mode (using url field)
      const hasConfig =
        structuredTarget.config.request === undefined
          ? !!structuredTarget.config.url && structuredTarget.config.url.trim() !== ''
          : structuredTarget.config.request?.trim() !== '';

      // For HTTP providers, require both tests to be completed
      return hasConfig && isTargetTested && isSessionTested;
    }

    if (selectedTarget.id === 'websocket') {
      return !!structuredTarget.config.url && structuredTarget.config.url.trim() !== '';
    }

    // For other provider types, rely on providerError
    return true;
  };

  const getNextButtonTooltip = () => {
    if (providerError) {
      return providerError;
    }
    if (targetError) {
      return targetError;
    }

    // Additional validation messages for HTTP and WebSocket providers
    if (selectedTarget.id === 'http') {
      if (structuredTarget.config.request === undefined) {
        if (!structuredTarget.config.url || !structuredTarget.config.url.trim()) {
          return 'Valid URL is required';
        }
      } else {
        if (!structuredTarget.config.request?.trim()) {
          return 'HTTP request content is required';
        }
      }

      // Check test requirements for HTTP providers
      if (!isTargetTested && !isSessionTested) {
        return 'Please test both your target configuration and session settings before proceeding';
      } else if (!isTargetTested) {
        return 'Please test your target configuration before proceeding';
      } else if (!isSessionTested) {
        return 'Please test your session settings before proceeding';
      }
    }

    if (selectedTarget.id === 'websocket') {
      if (!structuredTarget.config.url || !structuredTarget.config.url.trim()) {
        return 'Valid WebSocket URL is required';
      }
    }

    return undefined;
  };

  return (
    <PageWrapper
      title="Target Configuration"
      description={
        <>
          <p className="mb-4">
            A target is the specific LLM or endpoint you want to evaluate in your red teaming
            process. You can configure additional targets later.
          </p>
          <p>
            For connection details and supported integrations, see the{' '}
            <a
              href="https://www.promptfoo.dev/docs/providers/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              provider documentation
            </a>
            .
          </p>
        </>
      }
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isProviderValid()}
      warningMessage={getNextButtonTooltip()}
    >
      <div className="flex flex-col gap-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Select Red Team Target</h2>
          <LoadExampleButton />
        </div>

        <ProviderEditor
          provider={structuredTarget}
          setProvider={handleProviderChange}
          extensions={config.extensions}
          onExtensionsChange={(extensions) => updateConfig('extensions', extensions)}
          onBack={onBack}
          onActionButtonClick={isProviderValid() ? onNext : undefined}
          opts={{
            disableTitle: true,
            actionButtonText: 'Next',
          }}
          setError={setProviderError}
          onTargetTested={handleTargetTested}
          onSessionTested={handleSessionTested}
        />

        {promptRequired && <Prompts />}
      </div>
    </PageWrapper>
  );
}
