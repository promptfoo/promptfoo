import React, { useState } from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import { SetupSection } from '../SetupSection';
import ExtensionEditor from './ExtensionEditor';
import type { ProviderOptions } from '@promptfoo/types';
import 'prismjs/themes/prism.css';

interface CommonConfigurationOptionsProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  onValidationChange?: (hasErrors: boolean) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
}

const CommonConfigurationOptions = ({
  selectedTarget,
  updateCustomTarget,
  onValidationChange,
  extensions = [],
  onExtensionsChange,
}: CommonConfigurationOptionsProps) => {
  const [isDelayExpanded, setIsDelayExpanded] = useState(!!selectedTarget.delay);

  const handleExtensionsChange = React.useCallback(
    (newExtensions: string[]) => {
      onExtensionsChange?.(newExtensions);
    },
    [onExtensionsChange],
  );

  return (
    <div>
      <SetupSection
        title="Delay"
        description="Configure the delay between requests"
        isExpanded={isDelayExpanded}
        onExpandedChange={setIsDelayExpanded}
      >
        <p className="mb-4">
          Add a delay (ms) between requests to simulate a real user. See{' '}
          <a
            href="https://www.promptfoo.dev/docs/providers/http/#delay"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            docs
          </a>{' '}
          for more details.
        </p>
        <BaseNumberInput
          min={0}
          value={selectedTarget.delay ?? ''}
          onChange={(v) => updateCustomTarget('delay', v)}
          helperText="Delay in milliseconds (default: 0)"
        />
      </SetupSection>

      <ExtensionEditor
        extensions={extensions}
        onExtensionsChange={handleExtensionsChange}
        onValidationChange={onValidationChange}
      />
    </div>
  );
};

export default CommonConfigurationOptions;
