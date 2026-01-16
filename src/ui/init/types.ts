/**
 * Types for the Ink-based Init Wizard.
 */

import type { ProviderOptions } from '../../types/providers';

/**
 * Use case options for the init wizard.
 */
export type UseCase = 'compare' | 'rag' | 'agent' | 'redteam';

/**
 * Programming language options.
 */
export type Language = 'python' | 'javascript' | 'not_sure';

/**
 * Provider API key status.
 */
export type ProviderStatus = 'ready' | 'missing-key' | 'local';

/**
 * Provider selection item with metadata.
 */
export interface ProviderChoice {
  /** Provider IDs or configs (array of providers to configure) */
  value: (string | ProviderOptions)[];
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Category for grouping */
  category: 'recommended' | 'cloud' | 'local' | 'custom';
  /** Sub-category within cloud providers */
  vendor?: string;
  /** API key status */
  status: ProviderStatus;
  /** Environment variable name for API key (if applicable) */
  envVar?: string;
}

/**
 * Wizard step definition.
 */
export interface WizardStep {
  /** Unique step ID */
  id: string;
  /** Step title */
  title: string;
  /** Step description */
  description: string;
  /** Whether this step is applicable given current state */
  isApplicable?: (state: WizardState) => boolean;
}

/**
 * Wizard state managed by InitWizard.
 */
export interface WizardState {
  /** Current step index */
  currentStep: number;
  /** Selected use case */
  useCase: UseCase | null;
  /** Selected language (for rag/agent) */
  language: Language | null;
  /** Selected providers */
  providers: (string | ProviderOptions)[];
  /** Target directory */
  directory: string;
  /** Generated config YAML */
  generatedConfig: string | null;
  /** Files to be created */
  filesToCreate: FileToCreate[];
  /** Whether wizard is exiting */
  isExiting: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * File to be created by the wizard.
 */
export interface FileToCreate {
  /** Relative file path */
  path: string;
  /** File contents */
  contents: string;
  /** Whether the file is required */
  required: boolean;
}

/**
 * Result returned by the init wizard.
 */
export interface InitResult {
  /** Number of prompts configured */
  numPrompts: number;
  /** Provider prefixes (e.g., 'openai', 'anthropic') */
  providerPrefixes: string[];
  /** Selected action/use case */
  action: string;
  /** Selected language */
  language: string;
  /** Whether user cancelled */
  cancelled: boolean;
}

/**
 * Props for InitWizard component.
 */
export interface InitWizardProps {
  /** Target directory (null = current directory) */
  directory: string | null;
  /** Called when wizard completes successfully */
  onComplete: (result: InitResult) => void;
  /** Called when user exits/cancels */
  onExit: () => void;
}

/**
 * Options for running the init wizard.
 */
export interface InitRunnerOptions {
  /** Target directory */
  directory: string | null;
}

/**
 * Generic select input item.
 */
export interface SelectItem<T = string> {
  /** Item value */
  value: T;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Whether item is disabled */
  disabled?: boolean;
  /** Optional status indicator */
  status?: ProviderStatus;
  /** Optional group/category */
  group?: string;
}
