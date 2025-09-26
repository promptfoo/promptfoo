import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  calculateTokensPerSecond,
  formatCost,
  formatLatency,
  getCostBorderColor,
  getCostColor,
  validateInferenceData,
  type InferenceData,
} from '../utils/formatting';
import { useFormatting } from '../contexts/FormattingContext';

interface PerformanceMetricsProps {
  data: Partial<InferenceData>;
  title?: string;
}

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  color?: string;
  borderColor?: string;
  ariaLabel?: string;
  tooltip?: string;
}

function MetricCard({
  label,
  value,
  color = 'primary.main',
  borderColor = 'divider',
  ariaLabel,
  tooltip,
}: MetricCardProps) {
  const cardContent = (
    <Paper
      variant="outlined"
      role="status"
      aria-label={ariaLabel || `${label}: ${value}`}
      sx={{
        px: 2,
        py: 1.5,
        borderRadius: 1,
        bgcolor: 'background.paper',
        minWidth: '80px',
        textAlign: 'center',
        borderColor,
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: borderColor === 'divider' ? 'primary.main' : borderColor,
          bgcolor: 'action.hover',
          transform: 'translateY(-1px)',
          boxShadow: 1,
        },
      }}
    >
      <Typography
        variant="body2"
        fontWeight="600"
        color={color}
        sx={{ lineHeight: 1.2 }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
        {label}
      </Typography>
    </Paper>
  );

  return tooltip ? (
    <Tooltip title={tooltip} arrow>
      <div style={{ cursor: 'help' }}>{cardContent}</div>
    </Tooltip>
  ) : (
    cardContent
  );
}

export function PerformanceMetrics({ data, title = 'Performance Metrics' }: PerformanceMetricsProps) {
  const { showInferenceDetails } = useFormatting();
  const validatedData = validateInferenceData(data);

  // Don't render if showInferenceDetails is false or no data
  if (!showInferenceDetails || (!validatedData.tokenUsage && !validatedData.latencyMs && validatedData.cost === undefined)) {
    return null;
  }

  const { tokenUsage, latencyMs, cost } = validatedData;
  const tokensPerSec = calculateTokensPerSecond(tokenUsage?.completion, latencyMs);

  return (
    <Box mb={2}>
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 'medium',
          color: 'text.primary',
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        {/* Probes */}
        {tokenUsage?.numRequests !== undefined && (
          <MetricCard
            label="probes"
            value={tokenUsage.numRequests}
            ariaLabel={`${tokenUsage.numRequests} probes used`}
          />
        )}

        {/* Tokens */}
        {tokenUsage && (tokenUsage.cached || tokenUsage.total) && (
          <MetricCard
            label={tokenUsage.cached ? 'tokens (cached)' : 'tokens'}
            value={
              tokenUsage.cached ? (
                Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokenUsage.cached)
              ) : tokenUsage.total ? (
                <>
                  {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokenUsage.total)}
                  {tokenUsage.completionDetails?.reasoning && (
                    <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 0.5 }}>
                      +R{Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
                        tokenUsage.completionDetails.reasoning
                      )}
                    </Typography>
                  )}
                </>
              ) : null
            }
            color={tokenUsage.cached ? 'success.main' : 'primary.main'}
            borderColor={tokenUsage.cached ? 'success.main' : 'divider'}
            tooltip={
              !tokenUsage.cached && tokenUsage.total
                ? `${Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
                    tokenUsage.prompt ?? 0
                  )} prompt + ${Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
                    tokenUsage.completion ?? 0
                  )} completion${
                    tokenUsage.completionDetails?.reasoning
                      ? ` + ${Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
                          tokenUsage.completionDetails.reasoning
                        )} reasoning`
                      : ''
                  } = ${Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
                    tokenUsage.total
                  )} total`
                : undefined
            }
            ariaLabel={
              tokenUsage.cached
                ? `${tokenUsage.cached} cached tokens`
                : `${tokenUsage.total} total tokens (${tokenUsage.prompt} prompt + ${tokenUsage.completion} completion)`
            }
          />
        )}

        {/* Latency */}
        {latencyMs && (
          <MetricCard
            label="latency"
            value={formatLatency(latencyMs)}
            ariaLabel={`${latencyMs} milliseconds latency`}
          />
        )}

        {/* Tokens per second */}
        {tokensPerSec !== null && (
          <MetricCard
            label="tok/sec"
            value={Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(tokensPerSec)}
            ariaLabel={`${tokensPerSec.toFixed(1)} tokens per second`}
          />
        )}

        {/* Cache Status */}
        {tokenUsage && (
          <MetricCard
            label="cached"
            value={tokenUsage.cached ? '✓' : '✗'}
            color={tokenUsage.cached ? 'success.main' : 'text.secondary'}
            borderColor={tokenUsage.cached ? 'success.main' : 'divider'}
            ariaLabel={tokenUsage.cached ? 'Response was cached' : 'Response was not cached'}
          />
        )}

        {/* Cost */}
        {cost !== undefined && (
          <MetricCard
            label="cost"
            value={formatCost(cost)}
            color={getCostColor(cost)}
            borderColor={getCostBorderColor(cost)}
            ariaLabel={cost > 0 ? `Cost: ${formatCost(cost)}` : 'Cost information not available'}
          />
        )}
      </Box>
    </Box>
  );
}