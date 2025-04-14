import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Pagination from '@mui/material/Pagination';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { TestCasesWithMetadata } from '@promptfoo/types';
import yaml from 'js-yaml';

interface DatasetDialogProps {
  openDialog: boolean;
  handleClose: () => void;
  testCase: TestCasesWithMetadata & { recentEvalDate: string };
}

const ROWS_PER_PAGE = 10;

export default function DatasetDialog({ openDialog, handleClose, testCase }: DatasetDialogProps) {
  const [page, setPage] = useState(1);

  const sortedPrompts = useMemo(() => {
    return [...(testCase?.prompts || [])]
      .sort((a, b) => b.evalId.localeCompare(a.evalId))
      .map((promptData) => {
        const testPassCount = promptData.prompt.metrics?.testPassCount ?? 0;
        const testFailCount = promptData.prompt.metrics?.testFailCount ?? 0;
        const testErrorCount = promptData.prompt.metrics?.testErrorCount ?? 0;
        const total = testPassCount + testFailCount + testErrorCount;

        return {
          ...promptData,
          metrics: {
            passCount: testPassCount,
            failCount: testFailCount,
            errorCount: testErrorCount,
            passRate: total > 0 ? ((testPassCount / total) * 100.0).toFixed(1) + '%' : '-',
            score: promptData.prompt.metrics?.score,
          },
        };
      });
  }, [testCase?.prompts]);

  const paginatedPrompts = useMemo(() => {
    const startIndex = (page - 1) * ROWS_PER_PAGE;
    return sortedPrompts.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedPrompts, page]);

  const commonCellStyles = {
    width: '12%',
    pr: 2,
  };

  const commonTypographyStyles = {
    variant: 'body2' as const,
    sx: { display: 'block', textAlign: 'right' },
  };

  return (
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
            Dataset Details
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
              {testCase.id.slice(0, 6)}
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
              bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.15 : 0.08),
            },
          })}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ px: 3, pt: 2, pb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Test Cases
          </Typography>
          <TextField
            multiline
            fullWidth
            variant="outlined"
            value={yaml.dump(testCase.testCases)}
            InputProps={{
              readOnly: true,
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
            minRows={3}
            maxRows={8}
          />
        </Box>

        <Box sx={{ px: 3, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            Prompts
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
            {sortedPrompts.length} prompts
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
                  <TableCell sx={{ width: '15%' }}>Prompt ID</TableCell>
                  <TableCell sx={{ width: '25%' }}>Prompt Content</TableCell>
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
                  <TableCell sx={{ width: '20%' }}>Latest Eval</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedPrompts.map((promptData) => (
                  <TableRow key={`prompt-${promptData.id}`} hover>
                    <TableCell
                      sx={{
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Link to={`/prompts/?id=${promptData.id}`} style={{ textDecoration: 'none' }}>
                        <Typography
                          variant="body2"
                          color="primary"
                          sx={{ '&:hover': { textDecoration: 'underline' } }}
                        >
                          {promptData.id.slice(0, 6)}
                        </Typography>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          color: 'text.secondary',
                        }}
                      >
                        {promptData.prompt.raw.length > 250
                          ? promptData.prompt.raw.slice(0, 250) + '...'
                          : promptData.prompt.raw}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={commonCellStyles}>
                      <Typography {...commonTypographyStyles}>
                        {promptData.metrics.score?.toFixed(2) ?? '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={commonCellStyles}>
                      <Typography {...commonTypographyStyles}>
                        {promptData.metrics.passRate}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={commonCellStyles}>
                      <Typography {...commonTypographyStyles} color="success.main" fontWeight={500}>
                        {promptData.metrics.passCount}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={commonCellStyles}>
                      <Typography {...commonTypographyStyles} color="warning.main" fontWeight={500}>
                        {promptData.metrics.failCount}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Link
                        to={`/eval/?evalId=${promptData.evalId}`}
                        style={{ textDecoration: 'none' }}
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
                          {promptData.evalId}
                        </Typography>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>

        {Math.ceil(sortedPrompts.length / ROWS_PER_PAGE) > 1 && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Pagination
              count={Math.ceil(sortedPrompts.length / ROWS_PER_PAGE)}
              page={page}
              onChange={(_, value) => setPage(value)}
              size="small"
              shape="rounded"
              showFirstButton
              showLastButton
              sx={{
                '& .MuiPaginationItem-root': {
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                },
              }}
            />
          </Box>
        )}
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
  );
}
