import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Stack,
  Divider,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import type { TestCase, ProviderOptions } from '@promptfoo/types';

interface EvaluationPreviewProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  prompts: string[];
  providers: ProviderOptions[];
  testCases: TestCase[];
}

const EvaluationPreview: React.FC<EvaluationPreviewProps> = ({
  open,
  onClose,
  onConfirm,
  prompts,
  providers,
  testCases,
}) => {
  // Calculate total evaluations with defensive checks
  const totalEvaluations =
    (prompts?.length || 0) * (providers?.length || 0) * (testCases?.length || 0);

  // Get unique variables from test cases
  const uniqueVars = React.useMemo(() => {
    const varsSet = new Set<string>();
    if (testCases && Array.isArray(testCases)) {
      testCases.forEach((tc) => {
        if (tc?.vars) {
          Object.keys(tc.vars).forEach((v) => varsSet.add(v));
        }
      });
    }
    return Array.from(varsSet);
  }, [testCases]);

  // Count assertions
  const totalAssertions = React.useMemo(() => {
    if (!testCases || !Array.isArray(testCases)) {
      return 0;
    }
    return testCases.reduce((sum, tc) => {
      if (!tc || typeof tc !== 'object') {
        return sum;
      }
      return sum + (Array.isArray(tc.assert) ? tc.assert.length : 0);
    }, 0);
  }, [testCases]);

  // Estimate time (rough estimate: 2 seconds per evaluation)
  const estimatedTimeSeconds = totalEvaluations * 2;
  const estimatedTimeDisplay =
    estimatedTimeSeconds < 60
      ? `~${estimatedTimeSeconds} seconds`
      : `~${Math.ceil(estimatedTimeSeconds / 60)} minutes`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="eval-preview-title"
    >
      <DialogTitle id="eval-preview-title">
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Eval Preview</Typography>
          <IconButton aria-label="close" onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {/* Summary Statistics */}
          <Box>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Summary
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Chip
                icon={<CheckCircleOutlineIcon />}
                label={`${totalEvaluations} total evaluations`}
                color="primary"
                variant="outlined"
              />
              <Chip label={`${prompts?.length || 0} prompts`} variant="outlined" />
              <Chip label={`${providers?.length || 0} providers`} variant="outlined" />
              <Chip label={`${testCases?.length || 0} test cases`} variant="outlined" />
              <Chip label={`${totalAssertions} assertions`} variant="outlined" />
              <Chip label={`Est. time: ${estimatedTimeDisplay}`} variant="outlined" color="info" />
            </Stack>
          </Box>

          {/* What will happen */}
          <Box>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              What will happen
            </Typography>
            <Alert severity="info" icon={<InfoOutlinedIcon />}>
              <Typography variant="body2">
                Each prompt will be tested with all {providers?.length || 0} provider
                {(providers?.length || 0) > 1 ? 's' : ''} across all {testCases?.length || 0} test
                case{(testCases?.length || 0) > 1 ? 's' : ''}.
                {uniqueVars.length > 0 && (
                  <>
                    {' '}
                    Variables like <code>{uniqueVars.map((v) => `{{${v}}}`).join(', ')}</code> will
                    be replaced with test case values.
                  </>
                )}
              </Typography>
            </Alert>
          </Box>

          {/* Prompts Preview */}
          <Box>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Prompts ({prompts?.length || 0})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width={60}>#</TableCell>
                    <TableCell>Prompt Preview</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(prompts || []).map((prompt, idx) => {
                    const promptStr = String(prompt || '');
                    return (
                      <TableRow key={idx}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 500 }}>
                            {promptStr.substring(0, 100)}
                            {promptStr.length > 100 ? '...' : ''}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Providers Preview */}
          <Box>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Providers ({providers?.length || 0})
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {(providers || []).map((provider, idx) => (
                <Chip
                  key={idx}
                  label={provider.label || provider.id}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Stack>
          </Box>

          {/* Test Cases Preview */}
          <Box>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Test Cases ({testCases?.length || 0})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell width={60}>#</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Variables</TableCell>
                    <TableCell width={100}>Assertions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(testCases || []).map((tc, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>
                          {tc.description || `Test Case #${idx + 1}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {tc.vars ? (
                          <Stack direction="row" spacing={0.5}>
                            {Object.entries(tc.vars)
                              .slice(0, 2)
                              .map(([k, v]) => (
                                <Chip
                                  key={k}
                                  label={`${k}: ${String(v).substring(0, 20)}${String(v).length > 20 ? '...' : ''}`}
                                  size="small"
                                  variant="outlined"
                                />
                              ))}
                            {tc.vars &&
                              typeof tc.vars === 'object' &&
                              Object.keys(tc.vars).length > 2 && (
                                <Typography variant="caption" color="text.secondary">
                                  +{Object.keys(tc.vars).length - 2} more
                                </Typography>
                              )}
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No variables
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">{tc.assert?.length || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Cost Warning */}
          {totalEvaluations > 100 && (
            <Alert severity="warning">
              <Typography variant="body2">
                <strong>Note:</strong> This evaluation will run {totalEvaluations} API calls. Make
                sure you understand the costs associated with your selected providers.
              </Typography>
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" startIcon={<PlayArrowIcon />} autoFocus>
          Run eval ({totalEvaluations} tests)
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(EvaluationPreview);
