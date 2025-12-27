import React, { useCallback, useMemo, useState } from 'react';

import { useApiHealth } from '@app/hooks/useApiHealth';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LockIcon from '@mui/icons-material/Lock';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  displayNameOverrides,
  riskCategorySeverityMap,
  Severity,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import {
  getPluginDocumentationUrl,
  hasSpecificPluginDocumentation,
} from './pluginDocumentationMap';
import { TestCaseGenerateButton } from './TestCaseDialog';
import { useTestCaseGeneration } from './TestCaseGenerationProvider';
import type { Plugin } from '@promptfoo/redteam/constants';

interface PluginGroup {
  name: string;
  plugins: Plugin[];
}

export interface VerticalSuite {
  id: string;
  name: string;
  icon: React.ReactElement;
  description: string;
  longDescription: string;
  plugins: Plugin[];
  pluginGroups: PluginGroup[];
  complianceFrameworks?: string[];
  color: string;
  requiresEnterprise?: boolean;
}

interface VerticalSuiteCardProps {
  suite: VerticalSuite;
  selectedPlugins: Set<Plugin>;
  onPluginToggle: (plugin: Plugin) => void;
  onConfigClick: (plugin: Plugin) => void;
  onGenerateTestCase: (plugin: Plugin) => void;
  isPluginConfigured: (plugin: Plugin) => boolean;
  isPluginDisabled: (plugin: Plugin) => boolean;
  hasEnterpriseAccess: boolean;
  onUpgradeClick?: () => void;
}

const PLUGINS_REQUIRING_CONFIG = ['indirect-prompt-injection', 'prompt-extraction'];

export default function VerticalSuiteCard({
  suite,
  selectedPlugins,
  onPluginToggle,
  onConfigClick,
  onGenerateTestCase,
  isPluginConfigured,
  isPluginDisabled,
  hasEnterpriseAccess,
  onUpgradeClick,
}: VerticalSuiteCardProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();
  const { isGenerating: generatingTestCase, plugin: generatingPlugin } = useTestCaseGeneration();

  // Check if this suite is locked (requires enterprise but user doesn't have access)
  const isLocked = suite.requiresEnterprise && !hasEnterpriseAccess;

  // Calculate stats
  const selectedCount = useMemo(
    () => suite.plugins.filter((p) => selectedPlugins.has(p)).length,
    [suite.plugins, selectedPlugins],
  );

  const allSelected = selectedCount === suite.plugins.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const severityCounts = useMemo(() => {
    const counts = {
      [Severity.Critical]: 0,
      [Severity.High]: 0,
      [Severity.Medium]: 0,
      [Severity.Low]: 0,
    };
    suite.plugins.forEach((plugin) => {
      const severity = riskCategorySeverityMap[plugin];
      if (severity) {
        counts[severity]++;
      }
    });
    return counts;
  }, [suite.plugins]);

  const handleToggleAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isLocked) {
        return;
      }
      suite.plugins.forEach((plugin) => {
        if (allSelected) {
          if (selectedPlugins.has(plugin)) {
            onPluginToggle(plugin);
          }
        } else {
          if (!selectedPlugins.has(plugin)) {
            onPluginToggle(plugin);
          }
        }
      });
    },
    [suite.plugins, allSelected, selectedPlugins, onPluginToggle, isLocked],
  );

  const handleExpandClick = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleUpgradeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onUpgradeClick) {
        onUpgradeClick();
      } else {
        window.open('https://www.promptfoo.dev/pricing/', '_blank');
      }
    },
    [onUpgradeClick],
  );

  return (
    <Paper
      elevation={0}
      sx={{
        border: '2px solid',
        borderColor: isLocked
          ? alpha(theme.palette.warning.main, 0.3)
          : allSelected
            ? 'primary.main'
            : someSelected
              ? alpha(theme.palette.primary.main, 0.3)
              : theme.palette.divider,
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'all 0.2s ease-in-out',
        backgroundColor: isLocked
          ? `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.03)} 0%, ${alpha(theme.palette.background.paper, 1)} 100%)`
          : 'background.paper',
        backgroundImage: isLocked
          ? `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.03)} 0%, transparent 50%)`
          : 'none',
        position: 'relative',
        '&:hover': {
          borderColor: isLocked
            ? alpha(theme.palette.warning.main, 0.5)
            : allSelected
              ? 'primary.main'
              : someSelected
                ? alpha(theme.palette.primary.main, 0.5)
                : alpha(theme.palette.primary.main, 0.2),
          boxShadow: isLocked
            ? `0 4px 16px ${alpha(theme.palette.warning.main, 0.15)}`
            : allSelected
              ? `0 4px 20px ${alpha(theme.palette.primary.main, 0.15)}`
              : `0 2px 8px ${alpha(theme.palette.action.hover, 0.1)}`,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 3,
          backgroundColor: isLocked
            ? alpha(theme.palette.warning.main, 0.04)
            : alpha(theme.palette.primary.main, 0.02),
          borderBottom: expanded ? `1px solid ${theme.palette.divider}` : 'none',
        }}
      >
        <Stack direction="row" alignItems="flex-start" spacing={2}>
          {/* Icon */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
              opacity: 0.85,
              mt: 0.25,
              fontSize: '2rem',
            }}
          >
            {suite.icon}
          </Box>

          {/* Content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.125rem' }}>
                {suite.name}
              </Typography>
              {isLocked && (
                <Tooltip title="This feature is only available in Promptfoo Enterprise">
                  <Chip
                    icon={<LockIcon sx={{ fontSize: '0.875rem !important' }} />}
                    label="ENTERPRISE"
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      bgcolor: 'linear-gradient(135deg, #FFA726 0%, #FB8C00 100%)',
                      background: 'linear-gradient(135deg, #FFA726 0%, #FB8C00 100%)',
                      color: '#fff',
                      border: 'none',
                      boxShadow: `0 2px 8px ${alpha(theme.palette.warning.main, 0.3)}`,
                      '& .MuiChip-icon': {
                        color: '#fff',
                      },
                      '& .MuiChip-label': {
                        px: 1,
                      },
                    }}
                  />
                </Tooltip>
              )}
              <Chip
                label={`${suite.plugins.length} tests`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: 'text.secondary',
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                }}
              />
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
              {suite.description}
            </Typography>

            {/* Compliance frameworks */}
            {suite.complianceFrameworks && suite.complianceFrameworks.length > 0 && (
              <Stack direction="row" spacing={0.75} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
                {suite.complianceFrameworks.map((framework) => (
                  <Chip
                    key={framework}
                    label={framework}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      bgcolor: 'background.default',
                      color: 'text.secondary',
                      border: `1px solid ${theme.palette.divider}`,
                      '& .MuiChip-label': {
                        px: 1,
                      },
                    }}
                  />
                ))}
              </Stack>
            )}

            {/* Severity distribution */}
            <Stack direction="row" spacing={2.5} sx={{ mb: 2.5 }}>
              {severityCounts[Severity.Critical] > 0 && (
                <Tooltip title="Critical severity">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: theme.palette.error.main,
                      }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                      {severityCounts[Severity.Critical]} Critical
                    </Typography>
                  </Stack>
                </Tooltip>
              )}
              {severityCounts[Severity.High] > 0 && (
                <Tooltip title="High severity">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: theme.palette.warning.main,
                      }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                      {severityCounts[Severity.High]} High
                    </Typography>
                  </Stack>
                </Tooltip>
              )}
              {severityCounts[Severity.Medium] > 0 && (
                <Tooltip title="Medium severity">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: theme.palette.info.main,
                      }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                      {severityCounts[Severity.Medium]} Medium
                    </Typography>
                  </Stack>
                </Tooltip>
              )}
              {severityCounts[Severity.Low] > 0 && (
                <Tooltip title="Low severity">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: theme.palette.success.main,
                      }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                      {severityCounts[Severity.Low]} Low
                    </Typography>
                  </Stack>
                </Tooltip>
              )}
            </Stack>

            {/* Actions */}
            <Stack direction="row" spacing={1.5}>
              {isLocked ? (
                <>
                  <Tooltip title="View pricing and features">
                    <Button
                      variant="contained"
                      size="medium"
                      onClick={handleUpgradeClick}
                      startIcon={<LockIcon sx={{ fontSize: '1.1rem' }} />}
                      sx={{
                        fontWeight: 600,
                        textTransform: 'none',
                        px: 3,
                        py: 1,
                        fontSize: '0.875rem',
                        background: 'linear-gradient(135deg, #FFA726 0%, #FB8C00 100%)',
                        color: '#fff',
                        boxShadow: `0 4px 12px ${alpha(theme.palette.warning.main, 0.4)}`,
                        border: 'none',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #FB8C00 0%, #F57C00 100%)',
                          boxShadow: `0 6px 16px ${alpha(theme.palette.warning.main, 0.5)}`,
                          transform: 'translateY(-1px)',
                        },
                        transition: 'all 0.2s ease-in-out',
                      }}
                    >
                      Upgrade to Enterprise
                    </Button>
                  </Tooltip>
                  <Button
                    variant="text"
                    size="small"
                    endIcon={
                      <ExpandMoreIcon
                        sx={{
                          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          fontSize: '1.25rem',
                        }}
                      />
                    }
                    onClick={handleExpandClick}
                    sx={{
                      color: 'text.secondary',
                      fontWeight: 500,
                      textTransform: 'none',
                      px: 1.5,
                    }}
                  >
                    {expanded ? 'Collapse' : 'View Details'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={allSelected ? 'outlined' : 'contained'}
                    size="small"
                    onClick={handleToggleAll}
                    sx={{
                      fontWeight: 500,
                      textTransform: 'none',
                      px: 2,
                    }}
                  >
                    {allSelected ? 'Deselect All' : `Select All ${suite.plugins.length} Tests`}
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    endIcon={
                      <ExpandMoreIcon
                        sx={{
                          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          fontSize: '1.25rem',
                        }}
                      />
                    }
                    onClick={handleExpandClick}
                    sx={{
                      color: 'text.secondary',
                      fontWeight: 500,
                      textTransform: 'none',
                      px: 1.5,
                    }}
                  >
                    {expanded ? 'Collapse' : 'Expand'}
                  </Button>
                </>
              )}
            </Stack>
          </Box>
        </Stack>
      </Box>

      {/* Expanded content */}
      <Collapse in={expanded}>
        <Box sx={{ p: 3, bgcolor: 'background.paper' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
            {suite.longDescription}
          </Typography>

          <Stack spacing={3}>
            {suite.pluginGroups.map((group) => (
              <Box key={group.name}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    mb: 1.5,
                    fontWeight: 600,
                    color: 'text.primary',
                    fontSize: '0.8125rem',
                    letterSpacing: '0.01em',
                  }}
                >
                  {group.name}
                </Typography>
                <Stack spacing={1}>
                  {group.plugins.map((plugin) => {
                    const isSelected = selectedPlugins.has(plugin);
                    const pluginDisabled = isPluginDisabled(plugin);
                    const requiresConfig = PLUGINS_REQUIRING_CONFIG.includes(plugin);
                    const hasError = requiresConfig && !isPluginConfigured(plugin);
                    const severity = riskCategorySeverityMap[plugin];

                    return (
                      <Paper
                        key={plugin}
                        variant="outlined"
                        onClick={() => {
                          if (!pluginDisabled && !isLocked) {
                            onPluginToggle(plugin);
                          }
                        }}
                        sx={{
                          p: 1.5,
                          cursor: pluginDisabled || isLocked ? 'not-allowed' : 'pointer',
                          opacity: pluginDisabled ? 0.5 : isLocked ? 0.85 : 1,
                          borderColor: isSelected
                            ? hasError
                              ? 'error.main'
                              : 'primary.main'
                            : 'divider',
                          bgcolor: isSelected
                            ? hasError
                              ? alpha(theme.palette.error.main, 0.04)
                              : alpha(theme.palette.primary.main, 0.04)
                            : 'transparent',
                          transition: 'all 0.15s ease-in-out',
                          '&:hover': {
                            borderColor:
                              pluginDisabled || isLocked
                                ? isLocked
                                  ? alpha(theme.palette.warning.main, 0.2)
                                  : 'divider'
                                : isSelected
                                  ? hasError
                                    ? 'error.main'
                                    : 'primary.main'
                                  : alpha(theme.palette.primary.main, 0.3),
                            bgcolor:
                              pluginDisabled || isLocked
                                ? isLocked
                                  ? alpha(theme.palette.warning.main, 0.04)
                                  : 'transparent'
                                : isSelected
                                  ? hasError
                                    ? alpha(theme.palette.error.main, 0.06)
                                    : alpha(theme.palette.primary.main, 0.06)
                                  : alpha(theme.palette.action.hover, 0.03),
                          },
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Checkbox
                            checked={isSelected}
                            disabled={pluginDisabled || isLocked}
                            size="small"
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => onPluginToggle(plugin)}
                            color={hasError ? 'error' : 'primary'}
                          />

                          <TestCaseGenerateButton
                            onClick={() => onGenerateTestCase(plugin)}
                            disabled={
                              pluginDisabled ||
                              isLocked ||
                              apiHealthStatus !== 'connected' ||
                              (generatingTestCase && generatingPlugin === plugin)
                            }
                            isGenerating={generatingTestCase && generatingPlugin === plugin}
                            tooltipTitle={
                              isLocked
                                ? 'This feature requires Promptfoo Enterprise'
                                : pluginDisabled
                                  ? 'This plugin requires remote generation'
                                  : apiHealthStatus === 'connected'
                                    ? `Generate a test case for ${displayNameOverrides[plugin] || plugin}`
                                    : 'Promptfoo Cloud connection is required for test generation'
                            }
                          />

                          {isSelected && !isLocked && (
                            <Tooltip title={`Configure ${displayNameOverrides[plugin] || plugin}`}>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onConfigClick(plugin);
                                }}
                                sx={{
                                  color:
                                    requiresConfig && !isPluginConfigured(plugin)
                                      ? 'error.main'
                                      : 'text.secondary',
                                }}
                              >
                                <SettingsOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}

                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 500,
                                  color: hasError ? 'error.main' : 'text.primary',
                                }}
                              >
                                {displayNameOverrides[plugin] || plugin}
                              </Typography>
                              {severity && (
                                <Chip
                                  label={severity}
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    textTransform: 'capitalize',
                                    bgcolor:
                                      severity === Severity.Critical
                                        ? alpha(theme.palette.error.main, 0.1)
                                        : severity === Severity.High
                                          ? alpha(theme.palette.warning.main, 0.1)
                                          : severity === Severity.Medium
                                            ? alpha(theme.palette.info.main, 0.1)
                                            : alpha(theme.palette.success.main, 0.1),
                                    color:
                                      severity === Severity.Critical
                                        ? theme.palette.error.main
                                        : severity === Severity.High
                                          ? theme.palette.warning.main
                                          : severity === Severity.Medium
                                            ? theme.palette.info.main
                                            : theme.palette.success.main,
                                  }}
                                />
                              )}
                            </Stack>
                            {subCategoryDescriptions[plugin] && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: 'block',
                                  mt: 0.5,
                                  lineHeight: 1.4,
                                }}
                              >
                                {subCategoryDescriptions[plugin]}
                              </Typography>
                            )}
                          </Box>

                          {hasSpecificPluginDocumentation(plugin) && (
                            <Tooltip title="View documentation">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(getPluginDocumentationUrl(plugin), '_blank');
                                }}
                              >
                                <HelpOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Paper>
  );
}
