import React, { createContext, useContext, type ReactNode } from 'react';
import { useResultsViewSettingsStore } from '../components/store';
import type { FormattingSettings } from '../utils/formatting';

interface FormattingContextValue extends FormattingSettings {
  // Additional context-specific methods can be added here
}

const FormattingContext = createContext<FormattingContextValue | undefined>(undefined);

interface FormattingProviderProps {
  children: ReactNode;
  // Allow overriding specific settings for testing or special cases
  overrides?: Partial<FormattingSettings>;
}

export function FormattingProvider({ children, overrides }: FormattingProviderProps) {
  const {
    renderMarkdown,
    prettifyJson,
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    maxImageWidth,
    maxImageHeight,
  } = useResultsViewSettingsStore();

  const contextValue: FormattingContextValue = {
    renderMarkdown: overrides?.renderMarkdown ?? renderMarkdown,
    prettifyJson: overrides?.prettifyJson ?? prettifyJson,
    maxTextLength: overrides?.maxTextLength ?? maxTextLength,
    wordBreak: overrides?.wordBreak ?? wordBreak,
    showInferenceDetails: overrides?.showInferenceDetails ?? showInferenceDetails,
    maxImageWidth: overrides?.maxImageWidth ?? maxImageWidth,
    maxImageHeight: overrides?.maxImageHeight ?? maxImageHeight,
  };

  return (
    <FormattingContext.Provider value={contextValue}>
      {children}
    </FormattingContext.Provider>
  );
}

export function useFormatting(): FormattingContextValue {
  const context = useContext(FormattingContext);
  if (context === undefined) {
    throw new Error('useFormatting must be used within a FormattingProvider');
  }
  return context;
}

// Convenience hook for components that might not be within a provider
export function useFormattingOptional(): FormattingContextValue | null {
  const context = useContext(FormattingContext);
  return context ?? null;
}