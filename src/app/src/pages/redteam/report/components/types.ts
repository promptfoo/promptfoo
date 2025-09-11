export type PluginCategoryStats = {
  stats: {
    pass: number;
    total: number;
    passWithFilter: number;
  };
  metadata: {
    type: string;
    description: string;
  };
};

export type PluginCategoryStatsByPluginId = Record<string, PluginCategoryStats>;
