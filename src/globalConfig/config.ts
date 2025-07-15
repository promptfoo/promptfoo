export interface GlobalConfig {
  promptAutoTracking?: {
    enabled: boolean;
    excludePatterns?: string[];
    includeMetadata?: boolean;
  };
}
