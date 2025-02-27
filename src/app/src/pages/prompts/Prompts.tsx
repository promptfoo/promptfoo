import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Box from '@mui/material/Box';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { PromptWithMetadata } from '@promptfoo/types';
import PromptDialog from './PromptDialog';

const ROWS_PER_PAGE = 10;

type SortableField = 'id' | 'raw' | 'date' | 'count' | null;

interface SortState {
  field: SortableField;
  order: 'asc' | 'desc';
}

interface PromptsProps {
  data: (PromptWithMetadata & { recentEvalDate: string })[];
  isLoading: boolean;
  error: string | null;
  showDatasetColumn?: boolean;
}

const LoadingSkeleton = () => (
  <TableBody>
    {[...Array(ROWS_PER_PAGE)].map((_, index) => (
      <TableRow key={index}>
        <TableCell>
          <Skeleton width={60} />
        </TableCell>
        <TableCell>
          <Skeleton width="90%" />
        </TableCell>
        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
          <Skeleton width={100} />
        </TableCell>
        <TableCell align="right">
          <Skeleton width={40} />
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
);

export default function Prompts({
  data,
  isLoading,
  error,
  showDatasetColumn = true,
}: PromptsProps) {
  const [searchParams] = useSearchParams();
  const [sort, setSort] = useState<SortState>({ field: 'date', order: 'desc' });
  const [page, setPage] = useState(1);
  const [dialogState, setDialogState] = useState<{ open: boolean; selectedIndex: number }>({
    open: false,
    selectedIndex: 0,
  });
  const hasShownPopup = useRef(false);

  const handleSort = useCallback((field: SortableField) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const sortedPrompts = useMemo(() => {
    if (!sort.field) {
      return data;
    }

    return [...data].sort((a, b) => {
      if (sort.field === null) {
        return 0;
      }

      let aValue: any;
      let bValue: any;

      if (sort.field === 'raw') {
        aValue = a.prompt.raw;
        bValue = b.prompt.raw;
      } else if (sort.field === 'date') {
        aValue = a.recentEvalDate ? new Date(a.recentEvalDate).getTime() : 0;
        bValue = b.recentEvalDate ? new Date(b.recentEvalDate).getTime() : 0;
      } else if (sort.field === 'id') {
        aValue = a.id;
        bValue = b.id;
      } else {
        aValue = a[sort.field];
        bValue = b[sort.field];
      }

      const compareResult = sort.order === 'asc' ? 1 : -1;
      if (aValue === bValue) {
        return 0;
      }
      return aValue === bValue ? 0 : aValue > bValue ? compareResult : -compareResult;
    });
  }, [data, sort]);

  const handleClickOpen = useCallback((index: number) => {
    setDialogState({ open: true, selectedIndex: index });
  }, []);

  const handleClose = useCallback(() => {
    setDialogState((prev) => ({ ...prev, open: false }));
  }, []);

  const handlePageChange = useCallback((_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
  }, []);

  useEffect(() => {
    if (hasShownPopup.current) {
      return;
    }

    const promptId = searchParams.get('id');
    if (promptId) {
      const promptIndex = data.findIndex((prompt) => prompt.id.startsWith(promptId));
      if (promptIndex !== -1) {
        handleClickOpen(promptIndex);
        hasShownPopup.current = true;
      }
    }
  }, [data, searchParams, handleClickOpen]);

  const paginatedPrompts = useMemo(() => {
    const startIndex = (page - 1) * ROWS_PER_PAGE;
    return sortedPrompts.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedPrompts, page]);

  const pageCount = useMemo(() => Math.ceil(data.length / ROWS_PER_PAGE), [data.length]);

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.black, 0.2)
            : alpha(theme.palette.grey[50], 0.5),
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderTop: 1,
          borderColor: (theme) => alpha(theme.palette.divider, 0.1),
          boxShadow: (theme) => `0 1px 2px ${alpha(theme.palette.common.black, 0.05)}`,
          bgcolor: 'background.paper',
          borderRadius: 1,
        }}
      >
        {error ? (
          <Box
            sx={{
              m: 3,
              p: 2,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: 'error.main',
              bgcolor: (theme) => alpha(theme.palette.error.main, 0.05),
            }}
          >
            <ErrorOutlineIcon fontSize="small" />
            <Typography variant="body2">{error}</Typography>
          </Box>
        ) : data.length === 0 && !isLoading ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <Typography variant="h6" color="text.secondary">
              No prompts found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create a prompt to start evaluating your AI responses
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ flex: 1, overflow: 'auto', px: 3, pt: 3 }}>
              <Table
                size="medium"
                stickyHeader
                sx={{
                  minWidth: { xs: 350, sm: 650 },
                  '& th': {
                    bgcolor: 'background.paper',
                    fontWeight: 600,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  },
                  '& td, & th': {
                    p: { xs: 1.5, sm: 2 },
                  },
                  '& tr:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell width="15%" sx={{ minWidth: { xs: 80, sm: 100 } }}>
                      <TableSortLabel
                        active={sort.field === 'id'}
                        direction={sort.field === 'id' ? sort.order : 'asc'}
                        onClick={() => handleSort('id')}
                      >
                        <Typography variant="subtitle2">ID</Typography>
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ minWidth: { xs: 200, sm: 300 } }}>
                      <TableSortLabel
                        active={sort.field === 'raw'}
                        direction={sort.field === 'raw' ? sort.order : 'asc'}
                        onClick={() => handleSort('raw')}
                      >
                        <Typography variant="subtitle2">Prompt</Typography>
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      width="20%"
                      sx={{
                        display: { xs: 'none', sm: 'table-cell' },
                        minWidth: 150,
                      }}
                    >
                      <Tooltip title="The date of the most recent eval for this prompt">
                        <TableSortLabel
                          active={sort.field === 'date'}
                          direction={sort.field === 'date' ? sort.order : 'asc'}
                          onClick={() => handleSort('date')}
                        >
                          <Typography variant="subtitle2">Most recent eval</Typography>
                        </TableSortLabel>
                      </Tooltip>
                    </TableCell>
                    <TableCell
                      width="15%"
                      align="right"
                      sx={{
                        minWidth: 80,
                      }}
                    >
                      <TableSortLabel
                        active={sort.field === 'count'}
                        direction={sort.field === 'count' ? sort.order : 'asc'}
                        onClick={() => handleSort('count')}
                      >
                        <Typography variant="subtitle2"># Evals</Typography>
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                {isLoading ? (
                  <LoadingSkeleton />
                ) : (
                  <TableBody>
                    {paginatedPrompts.map((promptRow, index) => (
                      <TableRow
                        key={promptRow.id}
                        hover
                        onClick={() => handleClickOpen(index)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            fontFamily="monospace"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {promptRow.id.slice(0, 6)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            noWrap
                            title={promptRow.prompt.raw}
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: { xs: '200px', sm: '300px', md: '500px' },
                            }}
                          >
                            {promptRow.prompt.raw}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          {promptRow.recentEvalDate ? (
                            <Link
                              to={`/eval?evalId=${promptRow.recentEvalId}`}
                              style={{ textDecoration: 'none' }}
                            >
                              <Typography
                                variant="body2"
                                color="primary"
                                fontFamily="monospace"
                                sx={{
                                  '&:hover': { textDecoration: 'underline' },
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {promptRow.recentEvalDate}
                              </Typography>
                            </Link>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Unknown
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={500}>
                            {promptRow.count}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                )}
              </Table>
            </Box>
            {pageCount > 1 && (
              <Box
                sx={{
                  p: 2,
                  display: 'flex',
                  justifyContent: 'center',
                  borderTop: 1,
                  borderColor: 'divider',
                }}
              >
                <Pagination
                  count={pageCount}
                  page={page}
                  onChange={handlePageChange}
                  size="small"
                  shape="rounded"
                  showFirstButton
                  showLastButton
                />
              </Box>
            )}
          </>
        )}
      </Paper>

      {data[dialogState.selectedIndex] && (
        <PromptDialog
          openDialog={dialogState.open}
          handleClose={handleClose}
          selectedPrompt={paginatedPrompts[dialogState.selectedIndex]}
          showDatasetColumn={showDatasetColumn}
        />
      )}
    </Box>
  );
}
