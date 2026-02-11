import React from 'react';

import { type Plugin as PluginType, Severity } from '@promptfoo/redteam/constants';
import { isValidPolicyObject, makeInlinePolicyId } from '@promptfoo/redteam/plugins/policy/utils';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import { type TestResultStats } from './FrameworkComplianceUtils';
import SeverityCard from './SeverityCard';
import { useReportStore } from './store';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';

interface OverviewProps {
  categoryStats: Record<PluginType, TestResultStats>;
  plugins: RedteamPluginObject[];
  vulnerabilitiesDataGridRef: React.RefObject<HTMLDivElement | null>;
}

const Overview = ({ categoryStats, plugins, vulnerabilitiesDataGridRef }: OverviewProps) => {
  const { pluginPassRateThreshold, severityFilter, setSeverityFilter } = useReportStore();

  const severityMap = React.useMemo(() => getRiskCategorySeverityMap(plugins), [plugins]);

  // Build a map from resolved plugin ID (including specific policy IDs) to plugin object,
  // matching the keys used in categoryStats.
  const [pluginsById, setPluginsById] = React.useState<Record<string, RedteamPluginObject>>({});
  React.useEffect(() => {
    async function build() {
      const result: Record<string, RedteamPluginObject> = {};
      for (const plugin of plugins) {
        let pluginId: string;
        if (plugin.id === 'policy' && plugin.config?.policy) {
          pluginId = isValidPolicyObject(plugin.config.policy)
            ? plugin.config.policy.id
            : await makeInlinePolicyId(plugin.config.policy as string);
        } else {
          pluginId = plugin.id;
        }
        result[pluginId] = plugin;
      }
      setPluginsById(result);
    }
    build();
  }, [plugins]);

  // Iterate over categoryStats entries (keyed by resolved plugin IDs) rather than
  // the raw plugins array, so custom policies with specific IDs are counted correctly.
  const severityCounts = Object.values(Severity).reduce(
    (acc, severity) => {
      acc[severity] = Object.entries(categoryStats).reduce((count, [pluginId, stats]) => {
        if (stats.total <= 0) {
          return count;
        }

        const plugin = pluginsById[pluginId];
        const pluginSeverity = plugin?.severity ?? severityMap[pluginId as PluginType];

        if (pluginSeverity !== severity) {
          return count;
        }

        const passRate = stats.total > 0 ? stats.pass / stats.total : 1;
        return passRate < pluginPassRateThreshold ? count + 1 : count;
      }, 0);
      return acc;
    },
    {} as Record<Severity, number>,
  );

  const handleNavigateToVulnerabilities = (severity: Severity) => {
    // Toggle filter: if clicking the same severity, clear the filter
    if (severityFilter === severity) {
      setSeverityFilter(null);
    } else {
      setSeverityFilter(severity);
      // Only scroll when applying a filter, not when clearing
      vulnerabilitiesDataGridRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      {Object.values(Severity).map((severity) => (
        <div key={severity} className="flex-1">
          <SeverityCard
            severity={severity}
            issueCount={severityCounts[severity]}
            navigateOnClick
            navigateToIssues={() => handleNavigateToVulnerabilities(severity)}
            isActive={severityFilter === severity}
            hasActiveFilter={severityFilter !== null}
          />
        </div>
      ))}
    </div>
  );
};

export default Overview;
