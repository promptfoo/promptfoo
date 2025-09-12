import { type Severity } from '@promptfoo/redteam/constants';

export type PluginCategoryStats = {
  stats: {
    pass: number;
    total: number;
    passWithFilter: number;
  };
  metadata: {
    type: string;
    description: string;
    severity: Severity;
  };
};

export type PluginCategoryStatsByPluginId = Record<string, PluginCategoryStats>;
