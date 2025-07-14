import React from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Chip,
  Grid,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  CircularProgress,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import type { TestCase } from '@promptfoo/types';

interface TestCasesCardViewProps {
  testCases: TestCase[];
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onUpdateVariable?: (testCaseIndex: number, varName: string, newValue: string) => void;
  onGenerateAssertions?: (index: number) => void;
}

const TestCasesCardView: React.FC<TestCasesCardViewProps> = ({
  testCases,
  onEdit,
  onDuplicate,
  onDelete,
  onUpdateVariable,
  onGenerateAssertions,
}) => {
  const theme = useTheme();

  // State for inline editing
  const [editingCell, setEditingCell] = React.useState<{
    testCaseIndex: number;
    varName: string;
  } | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  // Start editing a variable
  const startEditing = (testCaseIndex: number, varName: string, currentValue: string) => {
    setEditingCell({ testCaseIndex, varName });
    setEditValue(String(currentValue));
  };

  // Save the edited value
  const saveEdit = async () => {
    if (editingCell && onUpdateVariable) {
      setIsSaving(true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      onUpdateVariable(editingCell.testCaseIndex, editingCell.varName, editValue);
      setIsSaving(false);
    }
    setEditingCell(null);
    setEditValue('');
  };

  // Cancel editing
  const cancelEdit = () => {
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

  if (testCases.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="textSecondary">No test cases added yet.</Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {testCases.map((testCase, index) => (
        <Grid item xs={12} sm={6} md={4} key={index}>
          <Card
            variant="outlined"
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              transition: 'all 0.2s',
              '&:hover': {
                boxShadow: 2,
                borderColor: 'primary.main',
              },
            }}
          >
            <CardContent sx={{ flex: 1, cursor: 'pointer' }} onClick={() => onEdit(index)}>
              {/* Header with test case number/description */}
              <Typography variant="subtitle1" gutterBottom fontWeight="medium">
                {testCase.description || `Test Case #${index + 1}`}
              </Typography>

              {/* Assertions count */}
              <Chip
                label={`${testCase.assert?.length || 0} assertions`}
                size="small"
                variant="outlined"
                sx={{ mb: 2 }}
              />

              {/* Variables section */}
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Variables:
              </Typography>
              <Stack spacing={1}>
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
                        <TextField
                          key={key}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          onBlur={saveEdit}
                          onClick={(e) => e.stopPropagation()}
                          size="small"
                          fullWidth
                          multiline
                          maxRows={3}
                          disabled={isSaving}
                          label={key}
                          autoFocus
                          InputProps={{
                            endAdornment: isSaving && <CircularProgress size={16} />,
                          }}
                        />
                      );
                    }

                    return (
                      <Box
                        key={key}
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(index, key, String(value));
                        }}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          backgroundColor: theme.palette.action.hover,
                          border: '1px solid',
                          borderColor: theme.palette.divider,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          '&:hover': {
                            backgroundColor: theme.palette.action.selected,
                            borderColor: 'primary.main',
                          },
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="primary.main"
                          fontWeight="medium"
                          display="block"
                        >
                          {key}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            wordBreak: 'break-word',
                            maxHeight: '60px',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                          }}
                        >
                          {String(value)}
                        </Typography>
                      </Box>
                    );
                  })
                )}
              </Stack>
            </CardContent>

            {/* Actions */}
            <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
              <Tooltip title="Edit test case">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(index);
                  }}
                  aria-label={`Edit test case ${index + 1}`}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Duplicate test case">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(index);
                  }}
                  aria-label={`Duplicate test case ${index + 1}`}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {onGenerateAssertions && (!testCase.assert || testCase.assert.length === 0) && (
                <Tooltip title="Generate assertions">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerateAssertions(index);
                    }}
                    aria-label={`Generate assertions for test case ${index + 1}`}
                  >
                    <AutoAwesomeIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Delete test case">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(index);
                  }}
                  aria-label={`Delete test case ${index + 1}`}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </CardActions>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default React.memo(TestCasesCardView);
