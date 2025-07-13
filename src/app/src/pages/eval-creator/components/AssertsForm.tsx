import React, { useState } from 'react';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Delete from '@mui/icons-material/Delete';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Assertion, AssertionType } from '@promptfoo/types';

interface AssertsFormProps {
  onAdd: (asserts: Assertion[]) => void;
  initialValues: Assertion[];
  onGenerateClick?: () => void;
  canGenerate?: boolean;
  generatedAssertions?: Assertion[]; // Assertions that were just generated
}

const assertTypes: AssertionType[] = [
  'equals',
  'contains',
  'icontains',
  'contains-all',
  'contains-any',
  'starts-with',
  'regex',
  'is-json',
  'contains-json',
  'is-xml',
  'contains-xml',
  'is-sql',
  'contains-sql',
  //'javascript',
  //'python',
  'similar',
  'llm-rubric',
  'pi',
  'model-graded-closedqa',
  'factuality',
  'webhook',
  'bleu',
  'rouge-n',
  'g-eval',
  'not-equals',
  'not-contains',
  'not-icontains',
  'not-contains-all',
  'not-contains-any',
  'not-starts-with',
  'not-regex',
  'not-is-json',
  'not-contains-json',
  //'not-javascript',
  //'not-python',
  'not-similar',
  'not-webhook',
  'not-rouge-n',
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'latency',
  'perplexity',
  'perplexity-score',
  'cost',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'select-best',
  'moderation',
  'finish-reason',
];

const AssertsForm: React.FC<AssertsFormProps> = ({
  onAdd,
  initialValues,
  onGenerateClick,
  canGenerate = false,
  generatedAssertions = [],
}) => {
  const [asserts, setAsserts] = useState<Assertion[]>(initialValues || []);
  const [generatedIndices, setGeneratedIndices] = useState<Set<number>>(new Set());
  const [hasBeenEdited, setHasBeenEdited] = useState<Set<number>>(new Set());

  // Reset when initialValues changes
  React.useEffect(() => {
    setAsserts(initialValues || []);
    setGeneratedIndices(new Set());
    setHasBeenEdited(new Set());
  }, [initialValues]);

  // Track which assertions are generated when generatedAssertions changes
  React.useEffect(() => {
    if (generatedAssertions.length > 0) {
      const newGeneratedIndices = new Set<number>();
      // Find indices of generated assertions by comparing with current asserts
      asserts.forEach((assert, index) => {
        const isGenerated = generatedAssertions.some(
          (genAssert) =>
            genAssert.type === assert.type &&
            genAssert.value === assert.value &&
            !hasBeenEdited.has(index),
        );
        if (isGenerated) {
          newGeneratedIndices.add(index);
        }
      });
      setGeneratedIndices(newGeneratedIndices);
    }
  }, [generatedAssertions, asserts, hasBeenEdited]);

  const handleAdd = () => {
    const newAsserts = [...asserts, { type: 'equals' as AssertionType, value: '' }];
    setAsserts(newAsserts);
    onAdd(newAsserts);
  };

  const handleRemoveAssert = (indexToRemove: number) => {
    const newAsserts = asserts.filter((_, index) => index !== indexToRemove);
    setAsserts(newAsserts);
    onAdd(newAsserts);

    // Update indices when removing an assertion
    const newGeneratedIndices = new Set<number>();
    const newHasBeenEdited = new Set<number>();

    generatedIndices.forEach((idx) => {
      if (idx < indexToRemove) {
        newGeneratedIndices.add(idx);
      } else if (idx > indexToRemove) {
        newGeneratedIndices.add(idx - 1);
      }
    });

    hasBeenEdited.forEach((idx) => {
      if (idx < indexToRemove) {
        newHasBeenEdited.add(idx);
      } else if (idx > indexToRemove) {
        newHasBeenEdited.add(idx - 1);
      }
    });

    setGeneratedIndices(newGeneratedIndices);
    setHasBeenEdited(newHasBeenEdited);
  };

  const handleAssertionEdit = (index: number) => {
    // Mark assertion as edited, removing its generated status
    if (generatedIndices.has(index)) {
      const newGeneratedIndices = new Set(generatedIndices);
      newGeneratedIndices.delete(index);
      setGeneratedIndices(newGeneratedIndices);

      const newHasBeenEdited = new Set(hasBeenEdited);
      newHasBeenEdited.add(index);
      setHasBeenEdited(newHasBeenEdited);
    }
  };

  return (
    <>
      <Typography variant="h6">Asserts</Typography>
      <Box my={asserts.length > 0 ? 2 : 0}>
        <Stack direction="column" spacing={2}>
          {asserts.map((assert, index) => (
            <Stack key={index} direction="row" spacing={2} alignItems="center">
              {generatedIndices.has(index) && (
                <Tooltip title="Generated assertion">
                  <Chip
                    icon={<AutoAwesome />}
                    label="Generated"
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Tooltip>
              )}
              <Autocomplete
                value={assert.type}
                options={assertTypes}
                sx={{ minWidth: 200 }}
                onChange={(event, newValue) => {
                  const newType = newValue;
                  const newAsserts = asserts.map((a, i) =>
                    i === index ? { ...a, type: newType as AssertionType } : a,
                  );
                  setAsserts(newAsserts);
                  onAdd(newAsserts);
                  handleAssertionEdit(index);
                }}
                renderInput={(params) => <TextField {...params} label="Type" />}
              />
              <TextField
                label="Value"
                value={assert.value}
                fullWidth
                onChange={(e) => {
                  const newValue = e.target.value;
                  const newAsserts = asserts.map((a, i) =>
                    i === index ? { ...a, value: newValue } : a,
                  );
                  setAsserts(newAsserts);
                  onAdd(newAsserts);
                  handleAssertionEdit(index);
                }}
              />
              <IconButton onClick={() => handleRemoveAssert(index)} size="small">
                <Delete />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Stack direction="row" spacing={1}>
        {canGenerate && onGenerateClick && (
          <Button
            color="primary"
            onClick={onGenerateClick}
            variant="outlined"
            startIcon={<AutoAwesome />}
          >
            Generate Assertions
          </Button>
        )}
        <Button color="primary" onClick={handleAdd}>
          Add Assert
        </Button>
      </Stack>
    </>
  );
};

export default AssertsForm;
