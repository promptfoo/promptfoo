import React from 'react';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Copy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { TestCase } from '@promptfoo/types';

interface TestCasesTableProps {
  testCases: TestCase[];
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onUpdateVariable?: (testCaseIndex: number, varName: string, newValue: string) => void;
  onGenerateAssertions?: (index: number) => void;
}

const TestCasesTable = React.memo<TestCasesTableProps>(
  ({ testCases, onEdit, onDuplicate, onDelete, onUpdateVariable, onGenerateAssertions }) => {
    // State for inline editing
    const [editingCell, setEditingCell] = React.useState<{
      testCaseIndex: number;
      varName: string;
    } | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);
    const [shouldSaveOnBlur, setShouldSaveOnBlur] = React.useState(true);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleRowClick = (index: number) => {
      onEdit(index);
    };

    const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onEdit(index);
      }
    };

    // Start editing a variable
    const startEditing = (
      testCaseIndex: number,
      varName: string,
      currentValue: string,
      event: React.MouseEvent,
    ) => {
      event.stopPropagation();
      setEditingCell({ testCaseIndex, varName });
      setEditValue(String(currentValue));
      setShouldSaveOnBlur(true);
      // Focus the input after render
      setTimeout(() => inputRef.current?.focus(), 0);
    };

    // Save the edited value
    const saveEdit = async () => {
      if (editingCell && onUpdateVariable) {
        setIsSaving(true);
        // Add a small delay to show the saving state
        await new Promise((resolve) => setTimeout(resolve, 200));
        onUpdateVariable(editingCell.testCaseIndex, editingCell.varName, editValue);
        setIsSaving(false);
      }
      setEditingCell(null);
      setEditValue('');
    };

    // Cancel editing
    const cancelEdit = () => {
      setShouldSaveOnBlur(false);
      setEditingCell(null);
      setEditValue('');
    };

    // Handle key press in edit input
    const handleEditKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        saveEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    };

    // Handle blur event
    const handleBlur = () => {
      if (shouldSaveOnBlur) {
        saveEdit();
      }
    };

    if (testCases.length === 0) {
      return (
        <TableContainer>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No test cases added yet.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    return (
      <TableContainer
        sx={{
          overflowX: 'auto',
          '& .MuiTable-root': {
            minWidth: { xs: 600, sm: 700, md: 800 },
          },
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell>Assertions</TableCell>
              <TableCell>Variables</TableCell>
              <TableCell align="right" sx={{ width: { xs: 120, sm: 150 }, minWidth: 120 }}>
                <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
                  Actions
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {testCases.map((testCase, index) => (
              <TableRow
                key={index}
                tabIndex={0}
                role="button"
                aria-label={`Edit test case ${testCase.description || index + 1}`}
                sx={{
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                    cursor: 'pointer',
                  },
                  '&:focus': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: -2,
                  },
                }}
                onClick={() => handleRowClick(index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                <TableCell>
                  <Typography variant="body2">
                    {testCase.description || `Test Case #${index + 1}`}
                  </Typography>
                </TableCell>
                <TableCell>{testCase.assert?.length || 0} assertions</TableCell>
                <TableCell sx={{ minWidth: { xs: 200, sm: 250, md: 300 } }}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: { xs: 0.5, sm: 1 },
                      maxWidth: { xs: '100%', sm: '400px', md: '500px' },
                    }}
                  >
                    {Object.entries(testCase.vars || {}).length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No variables
                      </Typography>
                    ) : (
                      Object.entries(testCase.vars || {}).map(([key, value]) => {
                        const isEditing =
                          editingCell?.testCaseIndex === index && editingCell?.varName === key;

                        if (isEditing) {
                          return (
                            <Box key={key} sx={{ position: 'relative' }}>
                              <TextField
                                inputRef={inputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                onBlur={handleBlur}
                                onClick={(e) => e.stopPropagation()}
                                size="small"
                                multiline
                                maxRows={4}
                                disabled={isSaving}
                                sx={{
                                  minWidth: '150px',
                                  maxWidth: '300px',
                                  '& .MuiInputBase-root': {
                                    fontSize: '0.875rem',
                                    backgroundColor: (theme) =>
                                      theme.palette.mode === 'dark'
                                        ? 'rgba(255, 255, 255, 0.09)'
                                        : 'rgba(0, 0, 0, 0.09)',
                                  },
                                  '& .MuiOutlinedInput-root': {
                                    '&.Mui-focused fieldset': {
                                      borderColor: 'primary.main',
                                      borderWidth: 2,
                                    },
                                  },
                                }}
                                placeholder={`Enter ${key} value`}
                                InputProps={{
                                  endAdornment: isSaving && (
                                    <CircularProgress size={16} sx={{ mr: 1 }} />
                                  ),
                                }}
                              />
                            </Box>
                          );
                        }

                        return (
                          <Tooltip
                            key={key}
                            title={
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                  {key}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                  {String(value)}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ display: 'block', mt: 0.5, opacity: 0.7 }}
                                >
                                  Click to edit
                                </Typography>
                              </Box>
                            }
                            arrow
                          >
                            <Chip
                              label={
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    maxWidth: { xs: '120px', sm: '150px', md: '200px' },
                                  }}
                                >
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      fontWeight: 600,
                                      color: 'primary.main',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {key}:
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      minWidth: 0,
                                    }}
                                  >
                                    {String(value)}
                                  </Typography>
                                </Box>
                              }
                              size="small"
                              variant="outlined"
                              onClick={(e) => startEditing(index, key, String(value), e)}
                              sx={{
                                backgroundColor: (theme) =>
                                  theme.palette.mode === 'dark'
                                    ? 'rgba(255, 255, 255, 0.05)'
                                    : 'rgba(0, 0, 0, 0.02)',
                                border: '1px solid',
                                borderColor: (theme) =>
                                  theme.palette.mode === 'dark'
                                    ? 'rgba(255, 255, 255, 0.1)'
                                    : 'rgba(0, 0, 0, 0.1)',
                                maxWidth: '100%',
                                cursor: 'pointer',
                                '&:hover': {
                                  backgroundColor: (theme) =>
                                    theme.palette.mode === 'dark'
                                      ? 'rgba(255, 255, 255, 0.08)'
                                      : 'rgba(0, 0, 0, 0.04)',
                                  borderColor: 'primary.main',
                                },
                              }}
                            />
                          </Tooltip>
                        );
                      })
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit test case">
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(index);
                      }}
                      size="small"
                      aria-label={`Edit test case ${index + 1}`}
                    >
                      <Edit />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Duplicate test case">
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(index);
                      }}
                      size="small"
                      aria-label={`Duplicate test case ${index + 1}`}
                    >
                      <Copy />
                    </IconButton>
                  </Tooltip>
                  {onGenerateAssertions && (!testCase.assert || testCase.assert.length === 0) && (
                    <Tooltip title="Generate assertions">
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          onGenerateAssertions(index);
                        }}
                        aria-label={`Generate assertions for test case ${index + 1}`}
                      >
                        <AutoAwesomeIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete test case">
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(index);
                      }}
                      size="small"
                      aria-label={`Delete test case ${index + 1}`}
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  },
);

TestCasesTable.displayName = 'TestCasesTable';

export default TestCasesTable;
