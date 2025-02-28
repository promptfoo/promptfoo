import React, { useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { PromptWithMetadata } from '@promptfoo/types';

interface PromptDialogProps {
  openDialog: boolean;
  handleClose: () => void;
  selectedPrompt: PromptWithMetadata & { recentEvalDate: string };
  showDatasetColumn?: boolean;
}

const PromptDialog: React.FC<PromptDialogProps> = ({
  openDialog,
  handleClose,
  selectedPrompt,
  showDatasetColumn = true,
}) => {
  const [copySnackbar, setCopySnackbar] = React.useState(false);

  const sortedEvals = useMemo(
    () =>
      [...(selectedPrompt?.evals || [])]
        .sort((a, b) => b.id.localeCompare(a.id))
        .map((evalData) => {
          const passCount = evalData.metrics?.testPassCount ?? 0;
          const failCount = evalData.metrics?.testFailCount ?? 0;
          const errorCount = evalData.metrics?.testErrorCount ?? 0;
          const total = passCount + failCount + errorCount;

          return {
            ...evalData,
            metrics: {
              passCount,
              failCount,
              errorCount,
              passRate: total > 0 ? ((passCount / total) * 100.0).toFixed(1) + '%' : '-',
              score: evalData.metrics?.score,
            },
          };
        }),
    [selectedPrompt?.evals],
  );

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(selectedPrompt?.prompt?.raw || '');
      setCopySnackbar(true);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  }, [selectedPrompt?.prompt?.raw]);

  const handleCloseSnackbar = useCallback(() => setCopySnackbar(false), []);

  const commonCellStyles = {
    width: '12%',
    pr: 2,
  };

  const commonTypographyStyles = {
    variant: 'body2' as const,
    sx: { display: 'block', textAlign: 'right' },
  };

  // Adjust the widths based on whether dataset column is shown
  const evalIdWidth = showDatasetColumn ? '25%' : '35%';

  return (
    <>
      <Dialog
        open={openDialog}
        onClose={handleClose}
        fullWidth
        maxWidth="lg"
        PaperProps={{
          elevation: 2,
          sx: {
            minHeight: '60vh',
            maxHeight: '90vh',
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            width: '95%',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            py: 2.5,
            px: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Prompt Details
            </Typography>
            <Box
              sx={(theme) => ({
                px: 1.5,
                py: 0.75,
                borderRadius: 1.5,
                bgcolor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === 'dark' ? 0.15 : 0.08,
                ),
                border: 1,
                borderColor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === 'dark' ? 0.3 : 0.15,
                ),
              })}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  color: 'primary.main',
                  fontFamily: 'monospace',
                  fontWeight: 500,
                }}
              >
                {selectedPrompt.id.slice(0, 6)}
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={handleClose}
            size="small"
            aria-label="close dialog"
            sx={(theme) => ({
              color: 'text.secondary',
              transition: theme.transitions.create(['background-color', 'color']),
              '&:hover': {
                color: 'error.main',
                bgcolor: alpha(
                  theme.palette.error.main,
                  theme.palette.mode === 'dark' ? 0.15 : 0.08,
                ),
              },
            })}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ px: 3, pt: 2, pb: 2 }}>
            <TextField
              multiline
              fullWidth
              variant="outlined"
              value={selectedPrompt?.prompt?.raw}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <Tooltip title="Copy prompt">
                    <IconButton
                      onClick={handleCopyPrompt}
                      size="small"
                      aria-label="copy prompt"
                      sx={(theme) => ({
                        mr: 1,
                        color: 'text.secondary',
                        transition: theme.transitions.create(['background-color', 'color']),
                        '&:hover': {
                          color: 'primary.main',
                          bgcolor: alpha(
                            theme.palette.primary.main,
                            theme.palette.mode === 'dark' ? 0.15 : 0.08,
                          ),
                        },
                      })}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ),
                sx: (theme) => ({
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  bgcolor: alpha(
                    theme.palette.common.black,
                    theme.palette.mode === 'dark' ? 0.15 : 0.03,
                  ),
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: alpha(
                      theme.palette.mode === 'dark'
                        ? theme.palette.common.white
                        : theme.palette.common.black,
                      theme.palette.mode === 'dark' ? 0.15 : 0.1,
                    ),
                  },
                }),
              }}
              minRows={2}
              maxRows={5}
            />
          </Box>

          <Box sx={{ px: 3, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
              Eval History
            </Typography>
            <Typography
              variant="body2"
              sx={(theme) => ({
                color: 'text.secondary',
                bgcolor: alpha(
                  theme.palette.mode === 'dark'
                    ? theme.palette.common.white
                    : theme.palette.common.black,
                  theme.palette.mode === 'dark' ? 0.05 : 0.05,
                ),
                px: 1,
                py: 0.5,
                borderRadius: 1,
              })}
            >
              {sortedEvals.length} evals
            </Typography>
          </Box>

          <div style={{ overflowX: 'auto', margin: '0 24px' }}>
            <TableContainer
              sx={{
                flexGrow: 1,
                mb: 2,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflowX: 'auto',
              }}
            >
              <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: evalIdWidth }}>Eval ID</TableCell>
                    {showDatasetColumn && <TableCell sx={{ width: '15%' }}>Dataset ID</TableCell>}
                    <TableCell align="right" sx={commonCellStyles}>
                      Raw Score
                    </TableCell>
                    <TableCell align="right" sx={commonCellStyles}>
                      Pass Rate
                    </TableCell>
                    <TableCell align="right" sx={commonCellStyles}>
                      Pass Count
                    </TableCell>
                    <TableCell align="right" sx={commonCellStyles}>
                      Fail Count
                    </TableCell>
                    <TableCell align="right" sx={commonCellStyles}>
                      Error Count
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedEvals.map((evalData) => (
                    <TableRow key={`eval-${evalData.id}`} hover>
                      <TableCell
                        sx={{
                          width: evalIdWidth,
                          fontFamily: 'monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Link
                          to={`/eval/?evalId=${evalData.id}`}
                          style={{
                            textDecoration: 'none',
                            color: 'inherit',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Typography
                            variant="body2"
                            color="primary"
                            sx={{
                              '&:hover': { textDecoration: 'underline' },
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {evalData.id}
                          </Typography>
                        </Link>
                      </TableCell>
                      {showDatasetColumn && (
                        <TableCell
                          sx={{
                            width: '15%',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Link
                            to={`/datasets/?id=${evalData.datasetId}`}
                            style={{
                              textDecoration: 'none',
                              color: 'inherit',
                            }}
                          >
                            <Typography
                              variant="body2"
                              color="primary"
                              sx={{ '&:hover': { textDecoration: 'underline' } }}
                            >
                              {evalData.datasetId.slice(0, 6)}
                            </Typography>
                          </Link>
                        </TableCell>
                      )}
                      <TableCell align="right" sx={commonCellStyles}>
                        <Typography {...commonTypographyStyles}>
                          {evalData.metrics.score?.toFixed(2) ?? '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={commonCellStyles}>
                        <Typography {...commonTypographyStyles}>
                          {evalData.metrics.passRate}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={commonCellStyles}>
                        <Typography
                          {...commonTypographyStyles}
                          color="success.main"
                          fontWeight={500}
                        >
                          {evalData.metrics.passCount}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={commonCellStyles}>
                        <Typography
                          {...commonTypographyStyles}
                          color="warning.main"
                          fontWeight={500}
                        >
                          {evalData.metrics.failCount}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={commonCellStyles}>
                        {evalData.metrics.errorCount > 0 ? (
                          <Typography
                            {...commonTypographyStyles}
                            color="error.main"
                            fontWeight={500}
                          >
                            {evalData.metrics.errorCount}
                          </Typography>
                        ) : (
                          <Typography {...commonTypographyStyles} color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        </DialogContent>

        <DialogActions
          sx={(theme) => ({
            px: 3,
            py: 2.5,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: alpha(
              theme.palette.mode === 'dark'
                ? theme.palette.common.black
                : theme.palette.background.paper,
              theme.palette.mode === 'dark' ? 0.15 : 0.8,
            ),
          })}
        >
          <Button
            onClick={handleClose}
            variant="outlined"
            size="medium"
            sx={{ minWidth: 120, textTransform: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={copySnackbar}
        autoHideDuration={2000}
        onClose={handleCloseSnackbar}
        message="Prompt copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
};

export default PromptDialog;
