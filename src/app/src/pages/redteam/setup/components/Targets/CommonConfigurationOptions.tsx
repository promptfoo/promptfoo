import React from 'react';

import ExtensionEditor from './ExtensionEditor';

interface CommonConfigurationOptionsProps {
  onValidationChange?: (hasErrors: boolean) => void;
  extensions?: string[];
  onExtensionsChange?: (extensions: string[]) => void;
}

const CommonConfigurationOptions = ({
  onValidationChange,
  extensions = [],
  onExtensionsChange,
}: CommonConfigurationOptionsProps) => {
  const handleExtensionsChange = React.useCallback(
    (newExtensions: string[]) => {
      onExtensionsChange?.(newExtensions);
    },
    [onExtensionsChange],
  );

  return (
    <ExtensionEditor
      extensions={extensions}
      onExtensionsChange={handleExtensionsChange}
      onValidationChange={onValidationChange}
    />
  );
};

export default CommonConfigurationOptions;
