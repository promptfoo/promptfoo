import { useState } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { ellipsize } from '../../../../../util/text';
import type { GradingResult } from '@promptfoo/types';

const copyButtonSx = {
  position: 'absolute',
  right: '8px',
  top: '8px',
  bgcolor: 'background.paper',
  boxShadow: 1,
  '&:hover': {
    bgcolor: 'action.hover',
    boxShadow: 2,
  },
};

function getValue(result: GradingResult): string {
  // For context-related assertions, read the context value from metadata, if it exists
  // These assertions require special handling and should always use metadata.context
  if (
    result.assertion?.type &&
    ['context-faithfulness', 'context-recall', 'context-relevance'].includes(
      result.assertion.type,
    ) &&
    result.metadata?.context
  ) {
    const context = result.metadata.context;
    return Array.isArray(context) ? context.join('\n') : context;
  }

  // Prefer rendered assertion value with substituted variables over raw template
  if (result.metadata?.renderedAssertionValue !== undefined) {
    return result.metadata.renderedAssertionValue;
  }

  // Otherwise, return the assertion value
  return result.assertion?.value
    ? typeof result.assertion.value === 'object'
      ? JSON.stringify(result.assertion.value, null, 2)
      : String(result.assertion.value)
    : '-';
}

function AssertionResults({ gradingResults }: { gradingResults?: GradingResult[] }) {
  const [expandedValues, setExpandedValues] = useState<{ [key: number]: boolean }>({});
  const [copiedAssertions, setCopiedAssertions] = useState<{ [key: string]: boolean }>({});
  const [hoveredAssertion, setHoveredAssertion] = useState<string | null>(null);

  if (!gradingResults) {
    return null;
  }

  const hasMetrics = gradingResults.some((result) => result?.assertion?.metric);

  const toggleExpand = (index: number) => {
    setExpandedValues((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const copyAssertionToClipboard = async (key: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopiedAssertions((prev) => ({ ...prev, [key]: true }));

    setTimeout(() => {
      setCopiedAssertions((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              {hasMetrics && <TableCell style={{ fontWeight: 'bold' }}>Metric</TableCell>}
              <TableCell style={{ fontWeight: 'bold' }}>Pass</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Score</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Type</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Value</TableCell>
              <TableCell style={{ fontWeight: 'bold' }}>Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {gradingResults.map((result, i) => {
              if (!result) {
                return null;
              }

              const value = getValue(result);
              const truncatedValue = ellipsize(value, 300);
              const isExpanded = expandedValues[i] || false;
              const valueKey = `value-${i}`;

              return (
                <TableRow key={i}>
                  {hasMetrics && <TableCell>{result.assertion?.metric || ''}</TableCell>}
                  <TableCell>{result.pass ? '✅' : '❌'}</TableCell>
                  <TableCell>{result.score?.toFixed(2)}</TableCell>
                  <TableCell>{result.assertion?.type || ''}</TableCell>
                  <TableCell
                    style={{ whiteSpace: 'pre-wrap', cursor: 'pointer', position: 'relative' }}
                    onClick={() => toggleExpand(i)}
                    onMouseEnter={() => setHoveredAssertion(valueKey)}
                    onMouseLeave={() => setHoveredAssertion(null)}
                  >
                    {isExpanded ? value : truncatedValue}
                    {(hoveredAssertion === valueKey || copiedAssertions[valueKey]) && (
                      <IconButton
                        size="small"
                        onClick={(e) => copyAssertionToClipboard(valueKey, value, e)}
                        sx={copyButtonSx}
                        aria-label={`Copy assertion value ${i}`}
                      >
                        {copiedAssertions[valueKey] ? (
                          <CheckIcon fontSize="small" />
                        ) : (
                          <ContentCopyIcon fontSize="small" />
                        )}
                      </IconButton>
                    )}
                  </TableCell>
                  <TableCell
                    style={{ whiteSpace: 'pre-wrap', position: 'relative' }}
                    onMouseEnter={() => setHoveredAssertion(`reason-${i}`)}
                    onMouseLeave={() => setHoveredAssertion(null)}
                  >
                    {result.reason}
                    {result.reason &&
                      (hoveredAssertion === `reason-${i}` || copiedAssertions[`reason-${i}`]) && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyAssertionToClipboard(`reason-${i}`, result.reason || '', e);
                          }}
                          sx={copyButtonSx}
                          aria-label={`Copy assertion reason ${i}`}
                        >
                          {copiedAssertions[`reason-${i}`] ? (
                            <CheckIcon fontSize="small" />
                          ) : (
                            <ContentCopyIcon fontSize="small" />
                          )}
                        </IconButton>
                      )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

interface EvaluationPanelProps {
  gradingResults?: GradingResult[];
}

export function EvaluationPanel({ gradingResults }: EvaluationPanelProps) {
  return (
    <Box>
      <AssertionResults gradingResults={gradingResults} />
    </Box>
  );
}
