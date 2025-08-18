import { useState } from 'react';

import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

import ErrorBoundary from '../../../components/ErrorBoundary';
import type { ScanCheck, ScanResult } from '../ModelAudit.types';

interface SecurityChecksProps {
  scanResults: ScanResult;
}

const getSeverityIcon = (check: ScanCheck) => {
  if (check.status === 'passed') {
    return <CheckIcon fontSize="small" color="success" />;
  }
  switch (check.severity) {
    case 'critical':
    case 'error':
      return <ErrorIcon fontSize="small" color="error" />;
    case 'warning':
      return <WarningIcon fontSize="small" color="warning" />;
    case 'info':
      return <InfoIcon fontSize="small" color="info" />;
    default:
      return <ErrorIcon fontSize="small" color="error" />;
  }
};

const getSeverityColor = (check: ScanCheck): 'success' | 'error' | 'warning' | 'info' => {
  if (check.status === 'passed') {
    return 'success';
  }
  switch (check.severity) {
    case 'critical':
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    default:
      return 'error';
  }
};

function SecurityChecksContent({ scanResults }: SecurityChecksProps) {
  const [expandedCheck, setExpandedCheck] = useState<string | false>(false);

  if (!scanResults.checks || scanResults.checks.length === 0) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No security checks available
        </Typography>
      </Paper>
    );
  }

  const passedChecks = scanResults.checks.filter((c) => c.status === 'passed');
  const failedChecks = scanResults.checks.filter((c) => c.status === 'failed');

  const handleAccordionChange =
    (checkName: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedCheck(isExpanded ? checkName : false);
    };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Security Checks</Typography>
        <Stack direction="row" spacing={1}>
          <Chip
            size="small"
            label={`${passedChecks.length} passed`}
            color="success"
            variant="outlined"
          />
          {failedChecks.length > 0 && (
            <Chip
              size="small"
              label={`${failedChecks.length} failed`}
              color="error"
              variant="outlined"
            />
          )}
        </Stack>
      </Stack>
      <Divider sx={{ mb: 2 }} />

      {/* Failed checks first */}
      {failedChecks.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
            Failed Checks
          </Typography>
          {failedChecks.map((check, index) => (
            <Accordion
              key={`failed-${index}`}
              expanded={expandedCheck === `failed-${index}`}
              onChange={handleAccordionChange(`failed-${index}`)}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                  {getSeverityIcon(check)}
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {check.name}
                  </Typography>
                  <Chip
                    size="small"
                    label={check.severity || 'failed'}
                    color={getSeverityColor(check)}
                    sx={{ height: 20 }}
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Typography variant="body2">{check.message}</Typography>
                  {check.why && (
                    <Alert severity="info" sx={{ py: 1 }}>
                      <Typography variant="body2">{check.why}</Typography>
                    </Alert>
                  )}
                  {check.location && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Location:
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {check.location}
                      </Typography>
                    </Box>
                  )}
                  {check.details && Object.keys(check.details).length > 0 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Details:
                      </Typography>
                      <Box sx={{ mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <pre style={{ margin: 0, fontSize: '0.85rem', overflow: 'auto' }}>
                          {JSON.stringify(check.details, null, 2)}
                        </pre>
                      </Box>
                    </Box>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {/* Passed checks */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
          Passed Checks
        </Typography>
        {passedChecks.map((check, index) => (
          <Accordion
            key={`passed-${index}`}
            expanded={expandedCheck === `passed-${index}`}
            onChange={handleAccordionChange(`passed-${index}`)}
            sx={{ mb: 1, bgcolor: 'success.50' }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                {getSeverityIcon(check)}
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {check.name}
                </Typography>
                <Chip
                  size="small"
                  label="passed"
                  color="success"
                  variant="outlined"
                  sx={{ height: 20 }}
                />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Typography variant="body2">{check.message}</Typography>
                {check.location && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Location:
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {check.location}
                    </Typography>
                  </Box>
                )}
                {check.details && Object.keys(check.details).length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Details:
                    </Typography>
                    <Box sx={{ mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <pre style={{ margin: 0, fontSize: '0.85rem', overflow: 'auto' }}>
                        {JSON.stringify(check.details, null, 2)}
                      </pre>
                    </Box>
                  </Box>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Paper>
  );
}

export default function SecurityChecks(props: SecurityChecksProps) {
  return (
    <ErrorBoundary name="Security Checks">
      <SecurityChecksContent {...props} />
    </ErrorBoundary>
  );
}
