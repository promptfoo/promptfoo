import { useEffect, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
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

export default function Targets({ onNext, onBack }: TargetsProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const [selectedTarget, setSelectedTarget] = useState<ProviderOptions>(
    config.target || DEFAULT_HTTP_TARGET,
  );

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
    if (providerError) {
      return false;
    }

    // Additional validation for HTTP and WebSocket providers
    if (selectedTarget.id === 'http') {
      // Check if we're in raw mode (using request field) or structured mode (using url field)
      const hasConfig =
        selectedTarget.config.request !== undefined
          ? selectedTarget.config.request?.trim() !== ''
          : !!selectedTarget.config.url && selectedTarget.config.url.trim() !== '';

      // For HTTP providers, require both tests to be completed
      return hasConfig && isTargetTested && isSessionTested;
    }

    if (selectedTarget.id === 'websocket') {
      return !!selectedTarget.config.url && selectedTarget.config.url.trim() !== '';
    }

    // For other provider types, rely on providerError
    return true;
  };

  const getNextButtonTooltip = () => {
    if (providerError) {
      return providerError;
    }

    // Additional validation messages for HTTP and WebSocket providers
    if (selectedTarget.id === 'http') {
      if (selectedTarget.config.request !== undefined) {
        if (!selectedTarget.config.request?.trim()) {
          return 'HTTP request content is required';
        }
      } else {
        if (!selectedTarget.config.url || !selectedTarget.config.url.trim()) {
          return 'Valid URL is required';
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
      if (!selectedTarget.config.url || !selectedTarget.config.url.trim()) {
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
            process. In Promptfoo targets are also known as providers. You can configure additional
            targets later.
          </p>
          <p>
            For more information on available providers and how to configure them, please visit our{' '}
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
          provider={selectedTarget}
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
