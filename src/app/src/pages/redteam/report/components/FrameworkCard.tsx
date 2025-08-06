import React from 'react';

import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ALIASED_PLUGIN_MAPPINGS,
  FRAMEWORK_NAMES,
  OWASP_API_TOP_10_NAMES,
  OWASP_LLM_TOP_10_NAMES,
  riskCategorySeverityMap,
  Severity,
} from '@promptfoo/redteam/constants';
import {
  type CategoryStats,
  categorizePlugins,
  expandPluginCollections,
  FRAMEWORK_DESCRIPTIONS,
  getPluginDisplayName,
  getSeverityColor,
} from './FrameworkComplianceUtils';

interface FrameworkCardProps {
  framework: string;
  isCompliant: boolean;
  frameworkSeverity: Severity;
  categoryStats: CategoryStats;
  pluginPassRateThreshold: number;
  nonCompliantPlugins: string[];
  sortedNonCompliantPlugins: (plugins: string[]) => string[];
  getPluginPassRate: (plugin: string) => { pass: number; total: number; rate: number };
  idx: number;
}

const FrameworkCard: React.FC<FrameworkCardProps> = ({
  framework,
  isCompliant,
  frameworkSeverity,
  categoryStats,
  pluginPassRateThreshold,
  nonCompliantPlugins,
  sortedNonCompliantPlugins,
  getPluginPassRate,
  idx,
}) => {
  const theme = useTheme();
  const sortedPlugins = sortedNonCompliantPlugins(nonCompliantPlugins);
  const breakInside = idx === 0 ? 'undefined' : 'avoid';
  return (
    <Card
      className={`framework-item ${isCompliant ? 'compliant' : 'non-compliant'}`}
      sx={{ pageBreakInside: breakInside, breakInside }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Box display="flex" alignItems="center">
            <Typography variant="h6" component="div" sx={{ mr: 1 }}>
              {FRAMEWORK_NAMES[framework]}
            </Typography>
            <Tooltip title={FRAMEWORK_DESCRIPTIONS[framework] || ''} arrow>
              <InfoIcon fontSize="small" color="action" sx={{ opacity: 0.7 }} />
            </Tooltip>
          </Box>
          <Box display="flex" alignItems="center">
            {isCompliant ? (
              <CheckCircleIcon className="icon-compliant" />
            ) : (
              <Tooltip
                title={
                  frameworkSeverity === Severity.Critical
                    ? 'Critical: Requires immediate attention - high risk security vulnerabilities'
                    : frameworkSeverity === Severity.High
                      ? 'High: Serious security issues that should be prioritized'
                      : frameworkSeverity === Severity.Medium
                        ? 'Medium: Moderate security concerns that should be addressed'
                        : 'Low: Minor issues with limited security impact'
                }
                arrow
              >
                <Chip
                  label={frameworkSeverity}
                  size="small"
                  sx={{
                    backgroundColor: getSeverityColor(frameworkSeverity, theme),
                    color: 'white',
                    fontWeight: 'bold',
                  }}
                />
              </Tooltip>
            )}
          </Box>
        </Box>
        {/* Always expanded */}
        <Box mt={2}>
          {(framework === 'owasp:api' || framework === 'owasp:llm') &&
          Object.keys(ALIASED_PLUGIN_MAPPINGS[framework]).length > 0 ? (
            // Show categorized plugins for OWASP frameworks
            <div>
              {Object.entries(ALIASED_PLUGIN_MAPPINGS[framework]).map(
                ([categoryId, { plugins: categoryPlugins }]) => {
                  const categoryNumber = categoryId.split(':').pop();
                  const categoryName =
                    categoryNumber && framework === 'owasp:llm'
                      ? OWASP_LLM_TOP_10_NAMES[Number.parseInt(categoryNumber) - 1]
                      : categoryNumber && framework === 'owasp:api'
                        ? OWASP_API_TOP_10_NAMES[Number.parseInt(categoryNumber) - 1]
                        : `Category ${categoryNumber}`;

                  // Expand harmful if present
                  const expandedPlugins = expandPluginCollections(categoryPlugins, categoryStats);

                  // Categorize all plugins: tested-compliant, tested-non-compliant, and not-tested
                  const {
                    compliant: compliantCategoryPlugins,
                    nonCompliant: nonCompliantCategoryPlugins,
                    untested: untestedPlugins,
                  } = categorizePlugins(expandedPlugins, categoryStats, pluginPassRateThreshold);

                  // Sort all sets by severity
                  const sortedNonCompliantItems = sortedNonCompliantPlugins(
                    nonCompliantCategoryPlugins,
                  );
                  const sortedCompliantItems = sortedNonCompliantPlugins(compliantCategoryPlugins);
                  const sortedUntestedItems = sortedNonCompliantPlugins(untestedPlugins);

                  // Get all tested plugins
                  const testedPlugins = [
                    ...compliantCategoryPlugins,
                    ...nonCompliantCategoryPlugins,
                  ];

                  // Are all plugins compliant or are there no tested plugins?
                  const allCompliant =
                    testedPlugins.length > 0 && nonCompliantCategoryPlugins.length === 0;
                  const noTestedPlugins = testedPlugins.length === 0;

                  return (
                    <Box
                      key={categoryId}
                      mb={2}
                      sx={{
                        border: '1px solid rgba(0, 0, 0, 0.08)',
                        borderRadius: 1,
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="space-between"
                        p={1}
                        sx={{
                          bgcolor: 'rgba(0, 0, 0, 0.05)',
                          borderBottom:
                            allCompliant || noTestedPlugins
                              ? 'none'
                              : '1px solid rgba(0, 0, 0, 0.08)',
                        }}
                      >
                        <Typography variant="subtitle2">
                          {categoryNumber}. {categoryName}
                        </Typography>
                        {testedPlugins.length === 0 && untestedPlugins.length === 0 ? (
                          <Chip
                            label="No Plugins"
                            size="small"
                            sx={{
                              backgroundColor:
                                nonCompliantCategoryPlugins.length === 0 ? '#4caf50' : '#9e9e9e',
                              color: 'white',
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        ) : testedPlugins.length > 0 ? (
                          <Chip
                            label={`${nonCompliantCategoryPlugins.length} / ${testedPlugins.length} plugins failed`}
                            size="small"
                            sx={{
                              backgroundColor:
                                nonCompliantCategoryPlugins.length === 0 ? '#4caf50' : '#f44336',
                              color: 'white',
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        ) : (
                          <Chip
                            label={`${untestedPlugins.length} Untested`}
                            size="small"
                            sx={{
                              backgroundColor: '#9e9e9e',
                              color: 'white',
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        )}
                      </Box>

                      <List dense sx={{ py: 0 }}>
                        {/* Failed plugins first */}
                        {sortedNonCompliantItems.length > 0 && (
                          <ListItem
                            sx={{
                              py: 0.5,
                              px: 1,
                              bgcolor: 'rgba(244, 67, 54, 0.05)',
                            }}
                          >
                            <Typography variant="caption" fontWeight="bold" color="error.main">
                              Failed:
                            </Typography>
                          </ListItem>
                        )}
                        {sortedNonCompliantItems.map((plugin) => {
                          const passRate = getPluginPassRate(plugin);
                          const pluginSeverity =
                            riskCategorySeverityMap[
                              plugin as keyof typeof riskCategorySeverityMap
                            ] || Severity.Low;

                          return (
                            <ListItem
                              key={plugin}
                              sx={{
                                borderLeft: `3px solid ${getSeverityColor(pluginSeverity, theme)}`,
                                pl: 2,
                                mb: 0.5,
                                bgcolor: 'rgba(0, 0, 0, 0.02)',
                                borderRadius: '0 4px 4px 0',
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 30 }}>
                                <CancelIcon fontSize="small" color="error" />
                              </ListItemIcon>
                              <ListItemText
                                primary={
                                  <Box
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="space-between"
                                  >
                                    <Typography variant="body2">
                                      {getPluginDisplayName(plugin)}
                                    </Typography>
                                    <Tooltip
                                      title={`${passRate.total - passRate.pass}/${passRate.total} attacks successful`}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 'bold',
                                          color: 'error.main',
                                        }}
                                      >
                                        {(100 - passRate.rate).toFixed(0)}%
                                      </Typography>
                                    </Tooltip>
                                  </Box>
                                }
                              />
                            </ListItem>
                          );
                        })}

                        {/* Passing plugins */}
                        {sortedCompliantItems.length > 0 && (
                          <ListItem
                            sx={{
                              py: 0.5,
                              px: 1,
                              bgcolor: 'rgba(76, 175, 80, 0.05)',
                              mt: 1,
                            }}
                          >
                            <Typography variant="caption" fontWeight="bold" color="success.main">
                              Passed:
                            </Typography>
                          </ListItem>
                        )}
                        {sortedCompliantItems.map((plugin) => {
                          const passRate = getPluginPassRate(plugin);
                          const pluginSeverity =
                            riskCategorySeverityMap[
                              plugin as keyof typeof riskCategorySeverityMap
                            ] || Severity.Low;

                          return (
                            <ListItem
                              key={plugin}
                              sx={{
                                borderLeft: `3px solid ${getSeverityColor(pluginSeverity, theme)}`,
                                pl: 2,
                                mb: 0.5,
                                bgcolor: 'rgba(0, 0, 0, 0.01)',
                                borderRadius: '0 4px 4px 0',
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 30 }}>
                                <CheckCircleIcon fontSize="small" color="success" />
                              </ListItemIcon>
                              <ListItemText
                                primary={
                                  <Box
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="space-between"
                                  >
                                    <Typography variant="body2">
                                      {getPluginDisplayName(plugin)}
                                    </Typography>
                                    <Tooltip
                                      title={`${passRate.total - passRate.pass}/${passRate.total} attacks successful`}
                                    >
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontWeight: 'bold',
                                          color: 'success.main',
                                        }}
                                      >
                                        {(100 - passRate.rate).toFixed(0)}%
                                      </Typography>
                                    </Tooltip>
                                  </Box>
                                }
                              />
                            </ListItem>
                          );
                        })}

                        {/* Untested plugins */}
                        {sortedUntestedItems.length > 0 && (
                          <>
                            <ListItem
                              sx={{
                                py: 0.5,
                                px: 1,
                                bgcolor: 'rgba(158, 158, 158, 0.1)',
                                mt: 1,
                              }}
                            >
                              <Typography
                                variant="caption"
                                fontWeight="bold"
                                color="text.secondary"
                              >
                                Not Tested:
                              </Typography>
                            </ListItem>
                            {sortedUntestedItems.map((plugin) => {
                              const pluginSeverity =
                                riskCategorySeverityMap[
                                  plugin as keyof typeof riskCategorySeverityMap
                                ] || Severity.Low;

                              return (
                                <ListItem
                                  key={plugin}
                                  sx={{
                                    borderLeft: `3px solid ${getSeverityColor(pluginSeverity, theme)}`,
                                    pl: 2,
                                    mb: 0.5,
                                    bgcolor: 'rgba(0, 0, 0, 0.01)',
                                    borderRadius: '0 4px 4px 0',
                                    opacity: 0.7,
                                  }}
                                >
                                  <ListItemIcon sx={{ minWidth: 30 }}>
                                    <InfoIcon fontSize="small" color="action" />
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={
                                      <Box
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="space-between"
                                      >
                                        <Typography variant="body2">
                                          {getPluginDisplayName(plugin)}
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            fontWeight: 'medium',
                                            color: 'text.secondary',
                                          }}
                                        >
                                          Not Tested
                                        </Typography>
                                      </Box>
                                    }
                                  />
                                </ListItem>
                              );
                            })}
                          </>
                        )}
                      </List>
                    </Box>
                  );
                },
              )}
            </div>
          ) : (
            // Standard list view for other frameworks but with same format
            <Box
              sx={{
                border: '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                p={1}
                sx={{
                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
                }}
              >
                <Typography variant="subtitle2">Framework Results</Typography>

                <Chip
                  label={`${nonCompliantPlugins.length} / ${Object.keys(categoryStats).filter((plugin) => categoryStats[plugin].total > 0).length} failed`}
                  size="small"
                  sx={{
                    backgroundColor: nonCompliantPlugins.length === 0 ? '#4caf50' : '#f44336',
                    color: 'white',
                    fontSize: '0.7rem',
                    height: 20,
                  }}
                />
              </Box>

              <List dense sx={{ py: 0 }}>
                {/* Failed plugins first */}
                {nonCompliantPlugins.length > 0 && (
                  <ListItem sx={{ py: 0.5, px: 1, bgcolor: 'rgba(244, 67, 54, 0.05)' }}>
                    <Typography variant="caption" fontWeight="bold" color="error.main">
                      Failed:
                    </Typography>
                  </ListItem>
                )}
                {sortedPlugins.map((plugin) => {
                  const passRate = getPluginPassRate(plugin);
                  const pluginSeverity =
                    riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] ||
                    Severity.Low;

                  return (
                    <ListItem
                      key={plugin}
                      sx={{
                        borderLeft: `3px solid ${getSeverityColor(pluginSeverity, theme)}`,
                        pl: 2,
                        mb: 0.5,
                        bgcolor: 'rgba(0, 0, 0, 0.02)',
                        borderRadius: '0 4px 4px 0',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <CancelIcon fontSize="small" color="error" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Typography variant="body2">{getPluginDisplayName(plugin)}</Typography>
                            <Tooltip
                              title={`${passRate.total - passRate.pass}/${passRate.total} attacks successful`}
                            >
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 'bold', color: 'error.main' }}
                              >
                                {(100 - passRate.rate).toFixed(0)}%
                              </Typography>
                            </Tooltip>
                          </Box>
                        }
                      />
                    </ListItem>
                  );
                })}

                {/* Passing plugins */}
                {Object.keys(categoryStats).filter(
                  (plugin) =>
                    categoryStats[plugin].total > 0 &&
                    categoryStats[plugin].pass / categoryStats[plugin].total >=
                      pluginPassRateThreshold,
                ).length > 0 && (
                  <ListItem sx={{ py: 0.5, px: 1, bgcolor: 'rgba(76, 175, 80, 0.05)', mt: 1 }}>
                    <Typography variant="caption" fontWeight="bold" color="success.main">
                      Passed:
                    </Typography>
                  </ListItem>
                )}
                {Object.keys(categoryStats)
                  .filter(
                    (plugin) =>
                      categoryStats[plugin].total > 0 &&
                      categoryStats[plugin].pass / categoryStats[plugin].total >=
                        pluginPassRateThreshold,
                  )
                  .sort((a, b) => {
                    // Sort by severity first
                    const severityA =
                      riskCategorySeverityMap[a as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;
                    const severityB =
                      riskCategorySeverityMap[b as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;

                    const severityOrder = {
                      [Severity.Critical]: 0,
                      [Severity.High]: 1,
                      [Severity.Medium]: 2,
                      [Severity.Low]: 3,
                    };

                    return severityOrder[severityA] - severityOrder[severityB];
                  })
                  .map((plugin) => {
                    const passRate = getPluginPassRate(plugin);
                    const pluginSeverity =
                      riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;

                    return (
                      <ListItem
                        key={plugin}
                        sx={{
                          borderLeft: `3px solid ${getSeverityColor(pluginSeverity, theme)}`,
                          pl: 2,
                          mb: 0.5,
                          bgcolor: 'rgba(0, 0, 0, 0.01)',
                          borderRadius: '0 4px 4px 0',
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 30 }}>
                          <CheckCircleIcon fontSize="small" color="success" />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                              <Typography variant="body2">
                                {getPluginDisplayName(plugin)}
                              </Typography>
                              <Tooltip
                                title={`${passRate.total - passRate.pass}/${passRate.total} attacks successful`}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{ fontWeight: 'bold', color: 'success.main' }}
                                >
                                  {(100 - passRate.rate).toFixed(0)}%
                                </Typography>
                              </Tooltip>
                            </Box>
                          }
                        />
                      </ListItem>
                    );
                  })}

                {/* Untested plugins for this framework */}
                {Object.keys(ALIASED_PLUGIN_MAPPINGS[framework] || {})
                  .flatMap((categoryId) => {
                    // Get all plugins from this category
                    const categoryPlugins =
                      ALIASED_PLUGIN_MAPPINGS[framework]?.[categoryId]?.plugins || [];
                    // Expand plugins using the utility function
                    return Array.from(expandPluginCollections(categoryPlugins, categoryStats));
                  })
                  .filter((plugin) => !categoryStats[plugin] || categoryStats[plugin].total === 0)
                  .sort((a, b) => {
                    // Sort by severity first
                    const severityA =
                      riskCategorySeverityMap[a as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;
                    const severityB =
                      riskCategorySeverityMap[b as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;

                    const severityOrder = {
                      [Severity.Critical]: 0,
                      [Severity.High]: 1,
                      [Severity.Medium]: 2,
                      [Severity.Low]: 3,
                    };

                    return severityOrder[severityA] - severityOrder[severityB];
                  })
                  .map((plugin) => {
                    const pluginSeverity =
                      riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] ||
                      Severity.Low;

                    return (
                      <ListItem
                        key={plugin}
                        sx={{
                          borderLeft: `3px solid ${getSeverityColor(pluginSeverity, theme)}`,
                          pl: 2,
                          mb: 0.5,
                          bgcolor: 'rgba(0, 0, 0, 0.01)',
                          borderRadius: '0 4px 4px 0',
                          opacity: 0.7,
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 30 }}>
                          <InfoIcon fontSize="small" color="action" />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                              <Typography variant="body2">
                                {getPluginDisplayName(plugin)}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 'medium',
                                  color: 'text.secondary',
                                }}
                              >
                                Not Tested
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItem>
                    );
                  })}
              </List>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default FrameworkCard;
