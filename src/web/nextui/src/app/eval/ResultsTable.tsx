import * as React from 'react';
import { diffSentences, diffJson, diffWords } from 'diff';

import './index.css';

import invariant from 'tiny-invariant';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Checkbox from '@mui/material/Checkbox';
import Tooltip from '@mui/material/Tooltip';
import FormControlLabel from '@mui/material/FormControlLabel';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Link from 'next/link';

import CustomMetrics from './CustomMetrics';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import { useStore } from './store';

import type { CellContext, ColumnDef, VisibilityState } from '@tanstack/table-core';

import type { EvaluateTableRow, EvaluateTableOutput, FilterMode, GradingResult } from './types';

import './ResultsTable.css';

function formatRowOutput(output: EvaluateTableOutput | string) {
  if (typeof output === 'string') {
    // Backwards compatibility for 0.15.0 breaking change. Remove eventually.
    const pass = output.startsWith('[PASS]');
    let text = output;
    if (output.startsWith('[PASS]')) {
      text = text.slice('[PASS]'.length);
    } else if (output.startsWith('[FAIL]')) {
      text = text.slice('[FAIL]'.length);
    }
    return {
      text,
      pass,
      score: pass ? 1 : 0,
    };
  }
  return output;
}

function scoreToString(score: number | null) {
  if (score === null || score === 0 || score === 1) {
    // Don't show boolean scores.
    return '';
  }
  return `(${score.toFixed(2)})`;
}

function textLength(node: React.ReactNode): number {
  if (typeof node === 'string' || typeof node === 'number') {
    return node.toString().length;
  }
  if (Array.isArray(node)) {
    return node.reduce((acc, child) => acc + textLength(child), 0);
  }
  if (React.isValidElement(node) && node.props.children) {
    return React.Children.toArray(node.props.children).reduce(
      (acc: number, child) => acc + textLength(child),
      0,
    );
  }
  return 0;
}

interface TruncatedTextProps {
  text: string | number | React.ReactNode;
  maxLength: number;
}

function TruncatedText({ text: rawText, maxLength }: TruncatedTextProps) {
  const [isTruncated, setIsTruncated] = React.useState<boolean>(true);
  const toggleTruncate = () => {
    setIsTruncated(!isTruncated);
  };

  const truncateText = (node: React.ReactNode, length: number = 0): React.ReactNode => {
    if (typeof node === 'string' || typeof node === 'number') {
      const nodeAsString = node.toString();
      return nodeAsString.slice(0, maxLength - length);
    }
    if (Array.isArray(node)) {
      const nodes: React.ReactNode[] = [];
      let currentLength = length;
      for (const child of node) {
        const childLength = textLength(child);
        if (currentLength + childLength > maxLength) {
          nodes.push(truncateText(child, currentLength));
          break;
        } else {
          nodes.push(child);
          currentLength += childLength;
        }
      }
      return nodes;
    }
    if (React.isValidElement(node) && node.props.children) {
      const childLength = textLength(node.props.children);
      if (childLength > maxLength - length) {
        return React.cloneElement(node, {
          ...node.props,
          children: truncateText(node.props.children, length),
        });
      }
    }
    return node;
  };

  let text;
  if (React.isValidElement(rawText) || typeof rawText === 'string') {
    text = rawText;
  } else {
    text = JSON.stringify(rawText);
  }
  const truncatedText = isTruncated ? truncateText(text) : text;

  const isOverLength = textLength(text) > maxLength;
  return (
    <div style={{ cursor: isOverLength ? 'pointer' : 'normal' }} onClick={toggleTruncate}>
      {truncatedText}
      {isTruncated && textLength(text) > maxLength && <span>...</span>}
    </div>
  );
}

interface PromptOutputProps {
  output: EvaluateTableOutput;
  maxTextLength: number;
  rowIndex: number;
  promptIndex: number;
  onRating: (rowIndex: number, promptIndex: number, isPass: boolean, score?: number) => void;
}

function EvalOutputCell({
  output,
  maxTextLength,
  rowIndex,
  promptIndex,
  onRating,
  firstOutput,
  filterMode,
}: PromptOutputProps & { firstOutput: EvaluateTableOutput; filterMode: FilterMode }) {
  const [openPrompt, setOpen] = React.useState(false);
  const handlePromptOpen = () => {
    setOpen(true);
  };
  const handlePromptClose = () => {
    setOpen(false);
  };
  let text = typeof output.text === 'string' ? output.text : JSON.stringify(output.text);
  let node: React.ReactNode | undefined;
  let chunks: string[] = [];
  if (!output.pass && text.includes('---')) {
    // TODO(ian): Plumb through failure message instead of parsing it out.
    chunks = text.split('---');
    text = chunks.slice(1).join('---');
  } else {
    chunks = [text];
  }

  if (filterMode === 'different' && firstOutput) {
    let firstOutputText =
      typeof firstOutput.text === 'string' ? firstOutput.text : JSON.stringify(firstOutput.text);

    if (firstOutputText.includes('---')) {
      firstOutputText = firstOutputText.split('---').slice(1).join('---');
    }

    let diffResult;
    try {
      // Try parsing the texts as JSON
      JSON.parse(firstOutputText);
      JSON.parse(text);
      // If no errors are thrown, the texts are valid JSON
      diffResult = diffJson(firstOutputText, text);
    } catch (error) {
      // If an error is thrown, the texts are not valid JSON
      if (firstOutputText.includes('. ') && text.includes('. ')) {
        // If the texts contain a period, they are considered as prose
        diffResult = diffSentences(firstOutputText, text);
      } else {
        // If the texts do not contain a period, use diffWords
        diffResult = diffWords(firstOutputText, text);
      }
    }
    node = (
      <>
        {diffResult.map(
          (part: { added?: boolean; removed?: boolean; value: string }, index: number) =>
            part.added ? (
              <ins key={index}>{part.value}</ins>
            ) : part.removed ? (
              <del key={index}>{part.value}</del>
            ) : (
              <span key={index}>{part.value}</span>
            ),
        )}
      </>
    );
  }

  const handleClick = (isPass: boolean) => {
    onRating(rowIndex, promptIndex, isPass);
  };

  const handleSetScore = () => {
    const score = prompt('Set test score (0.0 - 1.0):');
    if (score !== null) {
      const parsedScore = parseFloat(score);
      if (!isNaN(parsedScore) && parsedScore >= 0.0 && parsedScore <= 1.0) {
        onRating(rowIndex, promptIndex, true, parsedScore);
      } else {
        alert('Invalid score. Please enter a value between 0.0 and 1.0.');
      }
    }
  };

  // TODO(ian): output.prompt check for backwards compatibility, remove after 0.17.0
  return (
    <>
      <div className="cell">
        {output.pass && (
          <div className="status pass">
            PASS <span className="score">{scoreToString(output.score)}</span>
            {output.namedScores ? <CustomMetrics lookup={output.namedScores} /> : null}
          </div>
        )}
        {!output.pass && (
          <div className="status fail">
            [FAIL <span className="score">{scoreToString(output.score)}</span>]{' '}
            <span>
              {chunks[0]
                .trim()
                .split('\n')
                .map((line, index) => (
                  <React.Fragment key={index}>
                    {line}
                    <br />
                  </React.Fragment>
                ))}
            </span>
            {output.namedScores ? <CustomMetrics lookup={output.namedScores} /> : null}
          </div>
        )}{' '}
        <TruncatedText text={node || text} maxLength={maxTextLength} />
      </div>
      <div className="cell-detail">
        {output.tokenUsage?.cached ? (
          <span>{output.tokenUsage.cached} tokens (cached)</span>
        ) : (
          <>
            {output.tokenUsage?.total && <span>{output.tokenUsage.total} tokens</span>} |{' '}
            <span>{output.latencyMs} ms</span>
          </>
        )}
      </div>
      <div className="cell-actions">
        {output.prompt && (
          <>
            <span className="action" onClick={handlePromptOpen}>
              <Tooltip title="View ouput and test details">
                <span>🔎</span>
              </Tooltip>
            </span>
            <EvalOutputPromptDialog
              open={openPrompt}
              onClose={handlePromptClose}
              prompt={output.prompt}
              provider={output.provider}
              gradingResults={output.gradingResult?.componentResults}
              output={text}
            />
          </>
        )}
        <span className="action" onClick={() => handleClick(true)}>
          <Tooltip title="Mark test passed (score 1.0)">
            <span>👍</span>
          </Tooltip>
        </span>
        <span className="action" onClick={() => handleClick(false)}>
          <Tooltip title="Mark test failed (score 0.0)">
            <span>👎</span>
          </Tooltip>
        </span>
        <span className="action" onClick={handleSetScore}>
          <Tooltip title="Set test score">
            <span>✏️</span>
          </Tooltip>
        </span>
      </div>
    </>
  );
}

function TableHeader({
  text,
  maxLength,
  expandedText,
  resourceId,
  className,
}: TruncatedTextProps & { expandedText?: string; resourceId?: string; className?: string }) {
  const [promptOpen, setPromptOpen] = React.useState(false);
  const handlePromptOpen = () => {
    setPromptOpen(true);
  };
  const handlePromptClose = () => {
    setPromptOpen(false);
  };
  return (
    <div className={`${className || ''}`}>
      <TruncatedText text={text} maxLength={maxLength} />
      {expandedText && (
        <>
          <Tooltip title="View prompt">
            <span className="action" onClick={handlePromptOpen}>
              🔎
            </span>
          </Tooltip>
          <EvalOutputPromptDialog
            open={promptOpen}
            onClose={handlePromptClose}
            prompt={expandedText}
          />
          {resourceId && (
            <Tooltip title="View other evals and datasets for this prompt">
              <span className="action">
                <Link href={`/prompts/?id=${resourceId}`} target="_blank">
                  <OpenInNewIcon fontSize="small" />
                </Link>
              </span>
            </Tooltip>
          )}
        </>
      )}
    </div>
  );
}

interface ResultsTableProps {
  maxTextLength: number;
  columnVisibility: VisibilityState;
  wordBreak: 'break-word' | 'break-all';
  filterMode: FilterMode;
  failureFilter: { [key: string]: boolean };
  onFailureFilterToggle: (columnId: string, checked: boolean) => void;
}

export default function ResultsTable({
  maxTextLength,
  columnVisibility,
  wordBreak,
  filterMode,
  failureFilter,
  onFailureFilterToggle,
}: ResultsTableProps) {
  const { table, setTable } = useStore();
  invariant(table, 'Table should be defined');
  const { head, body } = table;
  // TODO(ian): Switch this to use prompt.metrics field once most clients have updated.
  const numGoodTests = head.prompts.map((_, idx) =>
    body.reduce((acc, row) => {
      return acc + (row.outputs[idx].pass ? 1 : 0);
    }, 0),
  );

  const numAsserts = head.prompts.map((_, idx) =>
    body.reduce((acc, row) => {
      return acc + (row.outputs[idx].gradingResult?.componentResults?.length || 0);
    }, 0),
  );

  const numGoodAsserts = head.prompts.map((_, idx) =>
    body.reduce((acc, row) => {
      const componentResults = row.outputs[idx].gradingResult?.componentResults;
      return (
        acc + (componentResults ? componentResults.filter((r: GradingResult) => r.pass).length : 0)
      );
    }, 0),
  );

  const handleRating = (rowIndex: number, promptIndex: number, isPass: boolean, score?: number) => {
    const updatedData = [...body];
    const updatedRow = { ...updatedData[rowIndex] };
    const updatedOutputs = [...updatedRow.outputs];
    updatedOutputs[promptIndex].pass = isPass;
    updatedOutputs[promptIndex].score =
      typeof score === 'undefined' ? (isPass ? 1 : 0) : score || 0;
    updatedRow.outputs = updatedOutputs;
    updatedData[rowIndex] = updatedRow;
    setTable({
      head,
      body: updatedData,
    });
  };

  const highestPassingIndex = numGoodTests.reduce(
    (maxIndex, currentPassCount, currentIndex, array) => {
      return currentPassCount > array[maxIndex] ? currentIndex : maxIndex;
    },
    0,
  );
  const highestPassingCount = numGoodTests[highestPassingIndex];

  const columnHelper = createColumnHelper<EvaluateTableRow>();
  const columns: ColumnDef<EvaluateTableRow, unknown>[] = [];

  if (head.vars.length > 0) {
    columns.push(
      columnHelper.group({
        id: 'vars',
        header: () => <span>Variables</span>,
        columns: head.vars.map((varName, idx) =>
          columnHelper.accessor(
            (row: EvaluateTableRow) => {
              return row.vars[idx];
            },
            {
              id: `Variable ${idx + 1}`,
              header: () => <TableHeader text={varName} maxLength={maxTextLength} />,
              cell: (info: CellContext<EvaluateTableRow, string>) => (
                <TruncatedText text={info.getValue()} maxLength={maxTextLength} />
              ),
              // Minimize the size of Variable columns.
              size: 50,
            },
          ),
        ),
      }),
    );
  }

  columns.push(
    columnHelper.group({
      id: 'prompts',
      header: () => <span>Outputs</span>,
      columns: head.prompts.map((prompt, idx) =>
        columnHelper.accessor((row: EvaluateTableRow) => formatRowOutput(row.outputs[idx]), {
          id: `Prompt ${idx + 1}`,
          header: () => {
            const pct =
              numGoodTests[idx] && body.length
                ? ((numGoodTests[idx] / body.length) * 100.0).toFixed(2)
                : '0.00';
            const isHighestPassing =
              numGoodTests[idx] === highestPassingCount && highestPassingCount !== 0;
            const columnId = `Prompt ${idx + 1}`;
            const isChecked = failureFilter[columnId] || false;
            // TODO(ian): prompt string support for backwards compatibility, remove after 0.17.0
            return (
              <>
                <TableHeader
                  className="prompt-container"
                  text={typeof prompt === 'string' ? prompt : prompt.display}
                  expandedText={typeof prompt === 'string' ? undefined : prompt.raw}
                  maxLength={maxTextLength}
                  resourceId={typeof prompt === 'string' ? undefined : prompt.id}
                />
                {filterMode === 'failures' && (
                  <FormControlLabel
                    sx={{
                      '& .MuiFormControlLabel-label': {
                        fontSize: '0.75rem',
                      },
                    }}
                    control={
                      <Checkbox
                        checked={isChecked}
                        onChange={(event) => onFailureFilterToggle(columnId, event.target.checked)}
                      />
                    }
                    label="Show failures"
                  />
                )}
                <div className="summary">
                  <span className={isHighestPassing ? 'highlight' : ''}>
                    Passing: <strong>{pct}%</strong> ({numGoodTests[idx]}/{body.length} cases
                    {numAsserts[idx] ? (
                      <span>
                        , {numGoodAsserts[idx]}/{numAsserts[idx]} asserts
                      </span>
                    ) : null}
                    )
                  </span>
                  {(prompt.metrics?.totalLatencyMs || prompt.metrics?.tokenUsage?.total) && (
                    <span> avg</span>
                  )}
                  {prompt.metrics?.totalLatencyMs ? (
                    <span>
                      {' '}
                      {Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 0,
                      }).format(prompt.metrics.totalLatencyMs / body.length)}
                      ms
                    </span>
                  ) : null}
                  {prompt.metrics?.tokenUsage?.total ? (
                    <span>
                      {' '}
                      {Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 0,
                      }).format(prompt.metrics.tokenUsage.total / body.length)}{' '}
                      tokens
                    </span>
                  ) : null}
                </div>
                {prompt.metrics?.namedScores && Object.keys(prompt.metrics.namedScores).length > 0 ? (
                  <div>
                    <CustomMetrics lookup={prompt.metrics.namedScores} />
                  </div>
                ) : null}
              </>
            );
          },
          cell: (info: CellContext<EvaluateTableRow, EvaluateTableOutput>) => (
            <EvalOutputCell
              output={info.getValue() as unknown as EvaluateTableOutput}
              maxTextLength={maxTextLength}
              rowIndex={info.row.index}
              promptIndex={idx}
              onRating={handleRating}
              firstOutput={filteredBody[info.row.index].outputs[0]}
              filterMode={filterMode}
            />
          ),
        }),
      ),
    }),
  );

  const hasAnyDescriptions = body.some((row) => row.description);
  if (hasAnyDescriptions) {
    const descriptionColumn = {
      accessorFn: (row: EvaluateTableRow) => row.description || '',
      id: 'description',
      header: () => <span>Description</span>,
      cell: (info: CellContext<EvaluateTableRow, unknown>) => (
        <TruncatedText text={String(info.getValue())} maxLength={maxTextLength} />
      ),
      size: 50,
    };
    columns.splice(0, 0, descriptionColumn);
  }

  const filteredBody = React.useMemo(() => {
    if (filterMode === 'failures') {
      if (Object.values(failureFilter).every((v) => !v)) {
        return body;
      }
      return body.filter((row) => {
        return row.outputs.some((output, idx) => {
          const columnId = `Prompt ${idx + 1}`;
          const isFail = !output.pass;
          return failureFilter[columnId] && isFail;
        });
      });
    } else if (filterMode === 'different') {
      return body.filter((row) => {
        // TODO(ian): This works for strings, but not objects.
        return !row.outputs.every((output) => output.text === row.outputs[0].text);
      });
    }
    return body;
  }, [body, failureFilter, filterMode]);

  const reactTable = useReactTable({
    data: filteredBody,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),

    state: {
      columnVisibility,
    },
  });

  return (
    <table
      className={`results-table ${maxTextLength <= 25 ? 'compact' : ''}`}
      style={{
        wordBreak,
      }}
    >
      <thead>
        {reactTable.getHeaderGroups().map((headerGroup: any) => (
          <tr key={headerGroup.id} className="header">
            {headerGroup.headers.map((header: any) => {
              return (
                <th
                  key={header.id}
                  {...{
                    colSpan: header.colSpan,
                    style: {
                      width: header.getSize(),
                    },
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                  <div
                    {...{
                      onMouseDown: header.getResizeHandler(),
                      onTouchStart: header.getResizeHandler(),
                      className: `resizer ${header.column.getIsResizing() ? 'isResizing' : ''}`,
                    }}
                  />
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {reactTable.getRowModel().rows.map((row: any, rowIndex: any) => {
          let colBorderDrawn = false;
          return (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell: any) => {
                const isMetadataCol =
                  cell.column.id.startsWith('Variable') || cell.column.id === 'description';
                const shouldDrawColBorder = !isMetadataCol && !colBorderDrawn;
                if (shouldDrawColBorder) {
                  colBorderDrawn = true;
                }
                const shouldDrawRowBorder = rowIndex === 0 && !isMetadataCol;
                return (
                  <td
                    key={cell.id}
                    {...{
                      style: {
                        width: cell.column.getSize(),
                      },
                      className: `${isMetadataCol ? 'variable' : ''} ${
                        shouldDrawRowBorder ? 'first-prompt-row' : ''
                      } ${shouldDrawColBorder ? 'first-prompt-col' : ''}`,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
