import { useCallback, useMemo } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import { alpha, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ALIASED_PLUGIN_MAPPINGS,
  FRAMEWORK_NAMES,
  OWASP_API_TOP_10_NAMES,
  OWASP_LLM_TOP_10_NAMES,
  riskCategorySeverityMap,
  Severity,
  severityDisplayNames,
} from '@promptfoo/redteam/constants';
import { calculateAttackSuccessRate } from '@promptfoo/redteam/metrics';
import { getSeverityColor, getSeverityContrastText } from '../utils/color';
import { compareByASRDescending } from '../utils/utils';
import {
  type CategoryStats,
  categorizePlugins,
  expandPluginCollections,
  FRAMEWORK_DESCRIPTIONS,
} from './FrameworkComplianceUtils';
import FrameworkPluginResult from './FrameworkPluginResult';

interface FrameworkCardProps {
  evalId: string;
  framework: string;
  isCompliant: boolean;
  frameworkSeverity: Severity;
  categoryStats: CategoryStats;
  pluginPassRateThreshold: number;
  nonCompliantPlugins: string[];
  idx: number;
}

const FrameworkCard = ({
  evalId,
  framework,
  isCompliant,
  frameworkSeverity,
  categoryStats,
  pluginPassRateThreshold,
  nonCompliantPlugins,
  idx,
}: FrameworkCardProps) => {
  const theme = useTheme();

  /**
   * Gets the Attack Success Rate (ASR) for a given plugin.
   * @param plugin - The plugin to get the ASR for.
   * @returns The ASR for the given plugin.
   */
  const getPluginASR = useCallback(
    (plugin: string): { asr: number; total: number; failCount: number } => {
      const stats = categoryStats[plugin];
      return {
        asr: stats ? calculateAttackSuccessRate(stats.total, stats.failCount) : 0,
        total: stats ? stats.total : 0,
        failCount: stats ? stats.failCount : 0,
      };
    },
    [categoryStats],
  );

  /**
   * Given a list of plugins, returns the plugins sorted by ASR (highest first).
   * @param plugins - The list of plugins to sort.
   * @returns The sorted list of plugins.
   */
  const sortPluginsByASR = useCallback(
    (plugins: string[]): string[] => {
      return [...plugins].sort((a, b) => {
        return compareByASRDescending(getPluginASR(a), getPluginASR(b));
      });
    },
    [getPluginASR],
  );

  const sortedPlugins = useMemo(
    () => sortPluginsByASR(nonCompliantPlugins),
    [nonCompliantPlugins, sortPluginsByASR],
  );

  const breakInside = idx === 0 ? 'undefined' : 'avoid';

  return (
    <Card
      className={`framework-item ${isCompliant ? 'compliant' : 'non-compliant'}`}
      sx={{
        pageBreakInside: breakInside,
        breakInside,
        backgroundColor: alpha(
          isCompliant ? theme.palette.success.main : theme.palette.error.main,
          0.05,
        ),
      }}
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
              <CheckCircleIcon className="icon-compliant" color="success" />
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
                  label={severityDisplayNames[frameworkSeverity]}
                  size="small"
                  sx={{
                    backgroundColor: getSeverityColor(frameworkSeverity, theme),
                    color: getSeverityContrastText(frameworkSeverity, theme),
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

                  // Sort all sets appropriately
                  const sortedNonCompliantItems = sortPluginsByASR(nonCompliantCategoryPlugins);
                  const sortedCompliantItems = sortPluginsByASR(compliantCategoryPlugins);
                  const sortedUntestedItems = [...untestedPlugins].sort((a, b) => {
                    // Sort untested plugins by severity since they have no pass rates
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
                  });

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
                            color={nonCompliantCategoryPlugins.length === 0 ? 'success' : 'default'}
                            sx={{
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        ) : testedPlugins.length > 0 ? (
                          <Chip
                            label={`${nonCompliantCategoryPlugins.length} / ${testedPlugins.length} plugins failed`}
                            size="small"
                            color={nonCompliantCategoryPlugins.length === 0 ? 'success' : 'error'}
                            sx={{
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        ) : (
                          <Chip
                            label={`${untestedPlugins.length} Untested`}
                            size="small"
                            sx={{
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
                              bgcolor: (theme) => alpha(theme.palette.error.main, 0.05),
                            }}
                          >
                            <Typography variant="caption" fontWeight="bold" color="error.main">
                              Failed:
                            </Typography>
                          </ListItem>
                        )}
                        {sortedNonCompliantItems.map((plugin, index) => (
                          <FrameworkPluginResult
                            key={`${plugin}-${framework}-${categoryId}-${index}`}
                            evalId={evalId}
                            plugin={plugin}
                            getPluginASR={getPluginASR}
                            type="failed"
                          />
                        ))}

                        {/* Passing plugins */}
                        {sortedCompliantItems.length > 0 && (
                          <ListItem
                            sx={{
                              py: 0.5,
                              px: 1,
                              bgcolor: alpha(theme.palette.success.main, 0.05),
                              mt: 1,
                            }}
                          >
                            <Typography variant="caption" fontWeight="bold" color="success.main">
                              Passed:
                            </Typography>
                          </ListItem>
                        )}
                        {sortedCompliantItems.map((plugin, index) => (
                          <FrameworkPluginResult
                            key={`${plugin}-${framework}-${categoryId}-${index}`}
                            evalId={evalId}
                            plugin={plugin}
                            getPluginASR={getPluginASR}
                            type="passed"
                          />
                        ))}

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
                            {sortedUntestedItems.map((plugin, index) => (
                              <FrameworkPluginResult
                                key={`${plugin}-${framework}-${categoryId}-${index}`}
                                evalId={evalId}
                                plugin={plugin}
                                getPluginASR={getPluginASR}
                                type="untested"
                              />
                            ))}
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
                  color={nonCompliantPlugins.length === 0 ? 'success' : 'error'}
                  sx={{
                    fontSize: '0.7rem',
                    height: 20,
                  }}
                />
              </Box>
              <List dense sx={{ py: 0 }}>
                {/* Failed plugins first */}
                {nonCompliantPlugins.length > 0 && (
                  <ListItem
                    sx={{
                      py: 0.5,
                      px: 1,
                      bgcolor: (theme) => alpha(theme.palette.error.main, 0.05),
                    }}
                  >
                    <Typography variant="caption" fontWeight="bold" color="error.main">
                      Failed:
                    </Typography>
                  </ListItem>
                )}
                {sortedPlugins.map((plugin, index) => (
                  <FrameworkPluginResult
                    key={`${plugin}-${framework}-${index}`}
                    evalId={evalId}
                    plugin={plugin}
                    getPluginASR={getPluginASR}
                    type="failed"
                  />
                ))}

                {/* Passing plugins */}
                {(() => {
                  const compliantPlugins = Object.keys(categoryStats).filter(
                    (plugin) =>
                      categoryStats[plugin].total > 0 &&
                      categoryStats[plugin].pass / categoryStats[plugin].total >=
                        pluginPassRateThreshold,
                  );
                  return compliantPlugins.length > 0 ? (
                    <ListItem
                      sx={{
                        py: 0.5,
                        px: 1,
                        bgcolor: alpha(theme.palette.success.main, 0.05),
                        mt: 1,
                      }}
                    >
                      <Typography variant="caption" fontWeight="bold" color="success.main">
                        Passed:
                      </Typography>
                    </ListItem>
                  ) : null;
                })()}
                {(() => {
                  const compliantPlugins = Object.keys(categoryStats).filter(
                    (plugin) =>
                      categoryStats[plugin].total > 0 &&
                      categoryStats[plugin].pass / categoryStats[plugin].total >=
                        pluginPassRateThreshold,
                  );
                  return sortPluginsByASR(compliantPlugins);
                })().map((plugin, index) => (
                  <FrameworkPluginResult
                    key={`${plugin}-${framework}-${index}`}
                    evalId={evalId}
                    plugin={plugin}
                    getPluginASR={getPluginASR}
                    type="passed"
                  />
                ))}

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
                  .map((plugin, index) => (
                    <FrameworkPluginResult
                      key={`${plugin}-${framework}-${index}`}
                      evalId={evalId}
                      plugin={plugin}
                      getPluginASR={getPluginASR}
                      type="untested"
                    />
                  ))}
              </List>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default FrameworkCard;
