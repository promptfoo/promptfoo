import React from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { GridFilterModel, GridLogicOperator } from '@mui/x-data-grid';
import { type Plugin as PluginType, Severity } from '@promptfoo/redteam/constants';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import { type TestResultStats } from './FrameworkComplianceUtils';
import SeverityCard from './SeverityCard';
import { useReportStore } from './store';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';

interface OverviewProps {
  categoryStats: Record<PluginType, TestResultStats>;
  plugins: RedteamPluginObject[];
  vulnerabilitiesDataGridRef: React.RefObject<HTMLDivElement | null>;
  setVulnerabilitiesDataGridFilterModel: (filterModel: GridFilterModel) => void;
}

const Overview = ({
  categoryStats,
  plugins,
  vulnerabilitiesDataGridRef,
  setVulnerabilitiesDataGridFilterModel,
}: OverviewProps) => {
  const { pluginPassRateThreshold } = useReportStore();

  const severityCounts = Object.values(Severity).reduce(
    (acc, severity) => {
      acc[severity] = plugins.reduce((count, plugin) => {
        const stats = categoryStats[plugin.id as PluginType];
        if (!stats || stats.total <= 0) {
          return count;
        }

        // Get the severity from the plugin definition or, if it's undefined (most cases; no override is set),
        // the risk category severity map.
        const pluginSeverity =
          plugin?.severity ?? getRiskCategorySeverityMap(plugins)[plugin.id as PluginType];

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

  const handleNavigateToVulnerabilities = ({ severity }: { severity: Severity }) => {
    setVulnerabilitiesDataGridFilterModel({
      items: [
        {
          field: 'severity',
          operator: 'is',
          value: severity,
        },
      ],
      logicOperator: GridLogicOperator.Or,
    });
    vulnerabilitiesDataGridRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }}>
      {Object.values(Severity).map((severity) => (
        <Box key={severity} flex={1}>
          <SeverityCard
            severity={severity}
            issueCount={severityCounts[severity]}
            navigateOnClick
            navigateToIssues={handleNavigateToVulnerabilities}
          />
        </Box>
      ))}
    </Stack>
  );
};

export default Overview;
