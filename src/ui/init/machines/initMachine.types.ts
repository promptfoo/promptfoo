/**
 * Type definitions for the init wizard state machine.
 */

export interface ProviderFamily {
  id: string;
  name: string;
  description: string;
  icon: string;
  apiKeyEnv?: string;
  website?: string;
  models: ProviderModel[];
  isCustom?: boolean;
}

export interface ProviderModel {
  id: string;
  name: string;
  description: string;
  tags?: ('fast' | 'cheap' | 'reasoning' | 'vision' | 'latest' | 'deprecated')[];
  defaultSelected?: boolean;
  config?: Record<string, unknown>;
}

export interface SelectedProvider {
  /** Provider family ID */
  family: string;
  /** Selected model IDs */
  models: string[];
  /** Optional provider configuration */
  config?: Record<string, unknown>;
}

export interface FileToWrite {
  path: string;
  relativePath: string;
  content: string;
  exists: boolean;
  overwrite: boolean;
}

export type UseCase = 'compare' | 'rag' | 'agent' | 'redteam';
export type Language = 'python' | 'javascript' | 'not_sure';
export type InitPath = 'example' | 'new';

/**
 * Redteam target types matching the existing redteam init flow.
 */
export type RedteamTargetType =
  | 'not_sure'
  | 'http_endpoint'
  | 'prompt_model_chatbot'
  | 'rag'
  | 'agent';

/**
 * Plugin selection with optional configuration.
 */
export interface PluginSelection {
  id: string;
  config?: Record<string, unknown>;
}

/**
 * Redteam-specific context.
 */
export interface RedteamContext {
  /** Name/label for the target being tested */
  targetLabel: string;
  /** Type of target being tested */
  targetType: RedteamTargetType | null;
  /** System prompt for the target */
  systemPrompt: string;
  /** Purpose/description of the application */
  purpose: string;
  /** Selected plugins with optional config */
  plugins: PluginSelection[];
  /** Selected strategies */
  strategies: string[];
  /** Number of tests per plugin */
  numTests: number;
  /** Whether to generate tests immediately after config creation */
  generateImmediately: boolean;
  /** Whether user chose default plugins or manual selection */
  pluginConfigMode: 'default' | 'manual';
  /** Whether user chose default strategies or manual selection */
  strategyConfigMode: 'default' | 'manual';
}

/**
 * Initial redteam context values.
 */
export const initialRedteamContext: RedteamContext = {
  targetLabel: '',
  targetType: null,
  systemPrompt: '',
  purpose: '',
  plugins: [],
  strategies: [],
  numTests: 5,
  generateImmediately: false,
  pluginConfigMode: 'default',
  strategyConfigMode: 'default',
};

export interface InitContext {
  // Path selection
  path: InitPath | null;

  // Example flow
  exampleName: string | null;
  exampleList: string[];
  downloadProgress: number;
  downloadedFiles: string[];

  // Project flow - common
  useCase: UseCase | null;
  language: Language | null;
  providers: SelectedProvider[];

  // Prompts generated based on use case
  prompts: string[];

  // Redteam-specific context
  redteam: RedteamContext;

  // Output
  outputDirectory: string;
  filesToWrite: FileToWrite[];
  filesWritten: string[];

  // UI state
  currentStep: number;
  totalSteps: number;

  // Errors
  error: string | null;
}

export type InitEvent =
  | { type: 'START' }
  | { type: 'SELECT_PATH'; path: InitPath }
  | { type: 'SELECT_EXAMPLE'; example: string }
  | { type: 'DOWNLOAD_PROGRESS'; progress: number; file?: string }
  | { type: 'DOWNLOAD_COMPLETE'; files: string[] }
  | { type: 'DOWNLOAD_ERROR'; error: string }
  | { type: 'SELECT_USECASE'; useCase: UseCase }
  | { type: 'SELECT_LANGUAGE'; language: Language }
  | { type: 'SELECT_PROVIDERS'; providers: SelectedProvider[] }
  | { type: 'PREVIEW_READY'; files: FileToWrite[] }
  | { type: 'TOGGLE_FILE_OVERWRITE'; path: string }
  | { type: 'CONFIRM' }
  | { type: 'WRITE_PROGRESS'; file: string }
  | { type: 'WRITE_COMPLETE'; files: string[] }
  | { type: 'WRITE_ERROR'; error: string }
  | { type: 'BACK' }
  | { type: 'CANCEL' }
  | { type: 'RETRY' }
  // Redteam-specific events
  | { type: 'SET_TARGET_LABEL'; label: string }
  | { type: 'SELECT_TARGET_TYPE'; targetType: RedteamTargetType }
  | { type: 'SET_PURPOSE'; purpose: string }
  | { type: 'SET_SYSTEM_PROMPT'; prompt: string }
  | { type: 'SELECT_PLUGIN_CONFIG_MODE'; mode: 'default' | 'manual' }
  | { type: 'SELECT_PLUGINS'; plugins: PluginSelection[] }
  | { type: 'SELECT_STRATEGY_CONFIG_MODE'; mode: 'default' | 'manual' }
  | { type: 'SELECT_STRATEGIES'; strategies: string[] }
  | { type: 'SET_NUM_TESTS'; numTests: number }
  | { type: 'SET_GENERATE_IMMEDIATELY'; generateImmediately: boolean };

export type InitState =
  | 'idle'
  | 'selectingPath'
  | 'example.selecting'
  | 'example.downloading'
  | 'example.complete'
  | 'example.error'
  | 'project.selectingUseCase'
  | 'project.selectingLanguage'
  | 'project.selectingProviders'
  | 'project.previewing'
  | 'project.writing'
  | 'project.complete'
  | 'project.error'
  // Redteam flow states
  | 'redteam.enteringLabel'
  | 'redteam.selectingTargetType'
  | 'redteam.enteringPurpose'
  | 'redteam.selectingPluginMode'
  | 'redteam.selectingPlugins'
  | 'redteam.selectingStrategyMode'
  | 'redteam.selectingStrategies'
  | 'redteam.previewing'
  | 'redteam.writing'
  | 'redteam.complete'
  | 'redteam.error'
  | 'cancelled';

export interface StepInfo {
  id: string;
  label: string;
  shortLabel?: string;
}

export const REGULAR_INIT_STEPS: StepInfo[] = [
  { id: 'path', label: 'Choose Path', shortLabel: 'Path' },
  { id: 'useCase', label: 'Use Case', shortLabel: 'Use Case' },
  { id: 'language', label: 'Language', shortLabel: 'Language' },
  { id: 'providers', label: 'Providers', shortLabel: 'Providers' },
  { id: 'preview', label: 'Preview', shortLabel: 'Preview' },
];

export const EXAMPLE_INIT_STEPS: StepInfo[] = [
  { id: 'path', label: 'Choose Path', shortLabel: 'Path' },
  { id: 'example', label: 'Select Example', shortLabel: 'Example' },
  { id: 'download', label: 'Download', shortLabel: 'Download' },
];

export const REDTEAM_INIT_STEPS: StepInfo[] = [
  { id: 'path', label: 'Choose Path', shortLabel: 'Path' },
  { id: 'useCase', label: 'Use Case', shortLabel: 'Use Case' },
  { id: 'label', label: 'Target Name', shortLabel: 'Target' },
  { id: 'targetType', label: 'Target Type', shortLabel: 'Type' },
  { id: 'purpose', label: 'Purpose', shortLabel: 'Purpose' },
  { id: 'plugins', label: 'Plugins', shortLabel: 'Plugins' },
  { id: 'strategies', label: 'Strategies', shortLabel: 'Strategies' },
  { id: 'preview', label: 'Preview', shortLabel: 'Preview' },
];
