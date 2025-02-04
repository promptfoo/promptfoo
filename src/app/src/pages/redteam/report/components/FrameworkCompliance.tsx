import React, { useState } from 'react';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import {
  ALIASED_PLUGIN_MAPPINGS,
  categoryAliases,
  displayNameOverrides,
  FRAMEWORK_NAMES,
  FRAMEWORK_COMPLIANCE_IDS,
} from '@promptfoo/redteam/constants';
import { useReportStore } from './store';
import './FrameworkCompliance.css';

interface FrameworkComplianceProps {
  categoryStats: Record<string, { pass: number; total: number; passWithFilter: number }>;
  strategyStats: Record<string, { pass: number; total: number }>;
}

const FrameworkCompliance: React.FC<FrameworkComplianceProps> = ({
  categoryStats,
  strategyStats,
}) => {
  const { pluginPassRateThreshold, showComplianceSection } = useReportStore();
  const [expandedFrameworks, setExpandedFrameworks] = useState<Record<string, boolean>>({});

  const getNonCompliantPlugins = React.useCallback(
    (framework: string) => {
      const mappings = ALIASED_PLUGIN_MAPPINGS[framework];
      if (!mappings) {
        return [];
      }

      return Array.from(
        new Set(
          Object.entries(mappings).flatMap(([_, { plugins, strategies }]) => {
            const nonCompliantItems = [...plugins, ...strategies].filter((item) => {
              const stats = categoryStats[item] || strategyStats[item];
              return stats && stats.total > 0 && stats.pass / stats.total < pluginPassRateThreshold;
            });
            return nonCompliantItems;
          }),
        ),
      );
    },
    [categoryStats, strategyStats, pluginPassRateThreshold],
  );

  const frameworkCompliance = React.useMemo(() => {
    return FRAMEWORK_COMPLIANCE_IDS.reduce(
      (acc, framework) => {
        const nonCompliantPlugins = getNonCompliantPlugins(framework);
        acc[framework] = nonCompliantPlugins.length === 0;
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [getNonCompliantPlugins]);

  const totalFrameworks = FRAMEWORK_COMPLIANCE_IDS.length;
  const compliantFrameworks = Object.values(frameworkCompliance).filter(Boolean).length;

  const pluginComplianceStats = React.useMemo(() => {
    let totalPlugins = 0;
    let compliantPlugins = 0;

    FRAMEWORK_COMPLIANCE_IDS.forEach((framework) => {
      const mappings = ALIASED_PLUGIN_MAPPINGS[framework];
      if (!mappings) {
        return;
      }

      Object.values(mappings).forEach(({ plugins, strategies }) => {
        const items = [...plugins, ...strategies];
        totalPlugins += items.length;

        const passingItems = items.filter((item) => {
          const stats = categoryStats[item] || strategyStats[item];
          return stats && stats.total > 0 && stats.pass / stats.total >= pluginPassRateThreshold;
        });
        compliantPlugins += passingItems.length;
      });
    });

    return {
      total: totalPlugins,
      compliant: compliantPlugins,
      percentage: (compliantPlugins / totalPlugins) * 100,
    };
  }, [categoryStats, strategyStats, pluginPassRateThreshold]);

  const toggleFramework = (framework: string) => {
    setExpandedFrameworks((prev) => ({
      ...prev,
      [framework]: !prev[framework],
    }));
  };

  if (!showComplianceSection) {
    return null;
  }

  return (
    <Card className="framework-compliance-card">
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="h5">
            Frameworks ({compliantFrameworks}/{totalFrameworks})
          </Typography>
          <Typography variant="h6" color="textSecondary">
            {pluginComplianceStats.percentage.toFixed(0)}% ({pluginComplianceStats.compliant}/
            {pluginComplianceStats.total} plugins)
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={pluginComplianceStats.percentage}
          sx={{
            mb: 3,
            height: 8,
            borderRadius: 4,
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              backgroundColor: pluginComplianceStats.percentage === 100 ? '#4caf50' : '#1976d2',
            },
          }}
        />
        <Grid container spacing={3} className="framework-grid">
          {FRAMEWORK_COMPLIANCE_IDS.map((framework) => {
            const nonCompliantPlugins = getNonCompliantPlugins(framework);
            const isCompliant = frameworkCompliance[framework];
            const isExpanded = expandedFrameworks[framework];
            return (
              <Grid item xs={12} sm={6} md={3} key={framework}>
                <Card className={`framework-item ${isCompliant ? 'compliant' : 'non-compliant'}`}>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                      <Typography variant="h6">{FRAMEWORK_NAMES[framework]}</Typography>
                      {isCompliant ? (
                        <CheckCircleIcon className="icon-compliant" />
                      ) : (
                        <CancelIcon className="icon-non-compliant" />
                      )}
                    </Box>
                    {!isCompliant && (
                      <Box>
                        <Box
                          display="flex"
                          alignItems="center"
                          mb={1}
                          onClick={() => toggleFramework(framework)}
                          style={{ cursor: 'pointer' }}
                        >
                          <Typography variant="body2" fontWeight="bold">
                            Non-compliant plugins: {nonCompliantPlugins.length}
                          </Typography>
                          <IconButton size="small">
                            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Box>
                        {isExpanded && (
                          <List dense>
                            {nonCompliantPlugins.map((plugin) => (
                              <ListItem key={plugin}>
                                <ListItemIcon>
                                  <CancelIcon fontSize="small" color="error" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={
                                    displayNameOverrides[
                                      plugin as keyof typeof displayNameOverrides
                                    ] ||
                                    categoryAliases[plugin as keyof typeof categoryAliases] ||
                                    plugin
                                  }
                                />
                              </ListItem>
                            ))}
                          </List>
                        )}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default FrameworkCompliance;
