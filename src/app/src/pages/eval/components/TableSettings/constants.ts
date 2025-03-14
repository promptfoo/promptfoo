/**
 * Type definition for table display settings
 */
export interface TableSettings {
  stickyHeader: boolean;
  wordBreak: 'break-word' | 'break-all';
  renderMarkdown: boolean;
  prettifyJson: boolean;
  showPrompts: boolean;
  showPassFail: boolean;
  showInferenceDetails: boolean;
  maxTextLength: number;
  maxImageWidth: number;
  maxImageHeight: number;
}

/**
 * Default values for table settings
 */
export const DEFAULT_TABLE_SETTINGS: TableSettings = {
  stickyHeader: true,
  wordBreak: 'break-word',
  renderMarkdown: true,
  prettifyJson: true,
  showPrompts: false,
  showPassFail: true,
  showInferenceDetails: true,
  maxTextLength: 500,
  maxImageWidth: 500,
  maxImageHeight: 300,
}; 