import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { useToast } from '@app/hooks/useToast';
import {
  type EvaluateTableRow,
  type EvaluateTableOutput,
  type FilterMode,
  type EvaluateTable,
  ResultFailureReason,
} from '@app/pages/eval/components/types';
import { callApi } from '@app/utils/api';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import invariant from '@promptfoo/util/invariant';
import type { CellContext, ColumnDef, VisibilityState } from '@tanstack/table-core';
import yaml from 'js-yaml';
import remarkGfm from 'remark-gfm';
import CustomMetrics from './CustomMetrics';
import EvalOutputCell from './EvalOutputCell';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import GenerateTestCases from './GenerateTestCases';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import type { TruncatedTextProps } from './TruncatedText';
import TruncatedText from './TruncatedText';
import { useStore as useMainStore } from './store';
import { useStore as useResultsViewStore } from './store';
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
    } else if (output.startsWith('[ERROR]')) {
      text = text.slice('[ERROR]'.length);
    }
    return {
      text,
      pass,
      score: pass ? 1 : 0,
    };
  }
  return output;
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
                <Link to={`/prompts/?id=${resourceId}`} target="_blank">
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
  searchText: string;
  showStats: boolean;
  onFailureFilterToggle: (columnId: string, checked: boolean) => void;
  onSearchTextChange: (text: string) => void;
  setFilterMode: (mode: FilterMode) => void;
}

interface ExtendedEvaluateTableOutput extends EvaluateTableOutput {
  originalRowIndex?: number;
  originalPromptIndex?: number;
}

interface ExtendedEvaluateTableRow extends EvaluateTableRow {
  outputs: ExtendedEvaluateTableOutput[];
}

function useScrollHandler() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { stickyHeader } = useResultsViewStore();
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const shouldCollapse = currentScrollY > 500;

      if (shouldCollapse !== isCollapsed || currentScrollY < 100) {
        setIsCollapsed(shouldCollapse);
      }

      lastScrollY.current = currentScrollY;
    };

    if (stickyHeader) {
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [stickyHeader]);

  return { isCollapsed };
}

function ResultsTable({
  maxTextLength,
  columnVisibility,
  wordBreak,
  filterMode,
  failureFilter,
  searchText,
  showStats,
  onFailureFilterToggle,
  onSearchTextChange,
  setFilterMode,
}: ResultsTableProps) {
  const { evalId, table, setTable, config, inComparisonMode, version } = useMainStore();
  const { showToast } = useToast();

  invariant(table, 'Table should be defined');
  const { head, body } = table;

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImage, setLightboxImage] = React.useState<string | null>(null);

  const toggleLightbox = (url?: string) => {
    setLightboxImage(url || null);
    setLightboxOpen(!lightboxOpen);
  };

  const handleRating = React.useCallback(
    async (
      rowIndex: number,
      promptIndex: number,
      resultId: string,
      isPass?: boolean,
      score?: number,
      comment?: string,
    ) => {
      const updatedData = [...body];
      const updatedRow = { ...updatedData[rowIndex] };
      const updatedOutputs = [...updatedRow.outputs];
      const finalPass = isPass ?? updatedOutputs[promptIndex].pass;
      const finalScore = typeof score === 'undefined' ? (isPass ? 1 : 0) : score || 0;
      updatedOutputs[promptIndex].pass = finalPass;
      updatedOutputs[promptIndex].score = finalScore;

      const componentResults = updatedOutputs[promptIndex].gradingResult?.componentResults || [];
      if (typeof isPass !== 'undefined') {
        // Add component result for manual grading
        const humanResultIndex = componentResults.findIndex(
          (result) => result.assertion?.type === 'human',
        );

        const newResult = {
          pass: finalPass,
          score: finalScore,
          reason: 'Manual result (overrides all other grading results)',
          comment,
          assertion: { type: 'human' as const },
        };

        if (humanResultIndex === -1) {
          componentResults.push(newResult);
        } else {
          componentResults[humanResultIndex] = newResult;
        }
      }

      const gradingResult = {
        ...(updatedOutputs[promptIndex].gradingResult || {}),
        pass: finalPass,
        score: finalScore,
        reason: 'Manual result (overrides all other grading results)',
        comment,
        assertion: updatedOutputs[promptIndex].gradingResult?.assertion || null,
        componentResults,
      };
      updatedOutputs[promptIndex].gradingResult = gradingResult;
      updatedRow.outputs = updatedOutputs;
      updatedData[rowIndex] = updatedRow;
      const newTable: EvaluateTable = {
        head,
        body: updatedData,
      };

      setTable(newTable);
      if (inComparisonMode) {
        showToast('Ratings are not saved in comparison mode', 'warning');
      } else {
        try {
          let response;
          if (version && version >= 4) {
            response = await callApi(`/eval/${evalId}/results/${resultId}/rating`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ ...gradingResult }),
            });
          } else {
            response = await callApi(`/eval/${evalId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ table: newTable }),
            });
          }
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
        } catch (error) {
          console.error('Failed to update table:', error);
        }
      }
    },
    [body, head, setTable, evalId, inComparisonMode, showToast],
  );

  const columnVisibilityIsSet = Object.keys(columnVisibility).length > 0;
  const searchRegex = React.useMemo(() => {
    try {
      return new RegExp(searchText, 'i');
    } catch (err) {
      console.error('Invalid regular expression:', (err as Error).message);
      return null;
    }
  }, [searchText]);
  const filteredBody = React.useMemo(() => {
    try {
      return body
        .map((row, rowIndex) => ({
          ...row,
          outputs: row.outputs.map((output, promptIndex) => ({
            ...output,
            originalRowIndex: rowIndex,
            originalPromptIndex: promptIndex,
          })),
        }))
        .filter((row) => {
          let outputsPassFilter = true;
          if (filterMode === 'failures') {
            outputsPassFilter = row.outputs.some((output, idx) => {
              const columnId = `Prompt ${idx + 1}`;
              return (
                failureFilter[columnId] &&
                !output.pass &&
                (!columnVisibilityIsSet || columnVisibility[columnId]) &&
                output.failureReason !== ResultFailureReason.ERROR
              );
            });
          } else if (filterMode === 'errors') {
            outputsPassFilter = row.outputs.some(
              (output) => output.failureReason === ResultFailureReason.ERROR,
            );
          } else if (filterMode === 'different') {
            outputsPassFilter = !row.outputs.every((output) => output.text === row.outputs[0].text);
          } else if (filterMode === 'highlights') {
            outputsPassFilter = row.outputs.some((output) =>
              output.gradingResult?.comment?.startsWith('!highlight'),
            );
          }

          if (!outputsPassFilter) {
            return false;
          }

          return searchText && searchRegex
            ? row.outputs.some((output) => {
                const vars = row.vars.map((v) => `var=${v}`).join(' ');
                const stringifiedOutput = `${output.text} ${Object.keys(output.namedScores)
                  .map((k) => `metric=${k}:${output.namedScores[k]}`)
                  .join(' ')} ${
                  output.gradingResult?.reason || ''
                } ${output.gradingResult?.comment || ''}`;

                const searchString = `${vars} ${stringifiedOutput}`;
                return searchRegex.test(searchString);
              })
            : true;
        }) as ExtendedEvaluateTableRow[];
    } catch (err) {
      console.error('Invalid regular expression:', (err as Error).message);
      return body as ExtendedEvaluateTableRow[];
    }
  }, [
    body,
    failureFilter,
    filterMode,
    searchText,
    columnVisibility,
    columnVisibilityIsSet,
    searchRegex,
  ]);

  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 50 });

  React.useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [failureFilter, filterMode, searchText]);

  // TODO(ian): Switch this to use prompt.metrics field once most clients have updated.
  const numGoodTests = React.useMemo(
    () =>
      head.prompts.map((_, idx) =>
        body.reduce((acc, row) => acc + (row.outputs[idx]?.pass ? 1 : 0), 0),
      ),
    [head.prompts, body],
  );

  const numAsserts = React.useMemo(
    () =>
      head.prompts.map((_, idx) =>
        body.reduce(
          (acc, row) => acc + (row.outputs[idx]?.gradingResult?.componentResults?.length || 0),
          0,
        ),
      ),
    [head.prompts, body],
  );

  const numGoodAsserts = React.useMemo(
    () =>
      head.prompts.map((_, idx) =>
        body.reduce((acc, row) => {
          const componentResults = row.outputs[idx]?.gradingResult?.componentResults;
          return acc + (componentResults ? componentResults.filter((r) => r?.pass).length : 0);
        }, 0),
      ),
    [head.prompts, body],
  );

  const highestPassingIndex = React.useMemo(
    () =>
      numGoodTests.reduce((maxIndex, currentPassCount, currentIndex, array) => {
        return currentPassCount > array[maxIndex] ? currentIndex : maxIndex;
      }, 0),
    [numGoodTests],
  );
  const highestPassingCount = numGoodTests[highestPassingIndex];

  const columnHelper = React.useMemo(() => createColumnHelper<EvaluateTableRow>(), []);

  const { renderMarkdown } = useResultsViewStore();
  const variableColumns = React.useMemo(() => {
    if (head.vars.length > 0) {
      return [
        columnHelper.group({
          id: 'vars',
          header: () => <span className="font-bold">Variables</span>,
          columns: head.vars.map((varName, idx) =>
            columnHelper.accessor((row: EvaluateTableRow) => row.vars[idx], {
              id: `Variable ${idx + 1}`,
              header: () => (
                <TableHeader text={varName} maxLength={maxTextLength} className="font-bold" />
              ),
              cell: (info: CellContext<EvaluateTableRow, string>) => {
                let value: string | object = info.getValue();
                if (typeof value === 'object') {
                  value = JSON.stringify(value, null, 2);
                  if (renderMarkdown) {
                    value = `\`\`\`json\n${value}\n\`\`\``;
                  }
                }
                const truncatedValue =
                  value.length > maxTextLength
                    ? `${value.substring(0, maxTextLength - 3).trim()}...`
                    : value;
                return (
                  <div className="cell">
                    {renderMarkdown ? (
                      <MarkdownErrorBoundary fallback={<>{value}</>}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{truncatedValue}</ReactMarkdown>
                      </MarkdownErrorBoundary>
                    ) : (
                      <>{value}</>
                    )}
                  </div>
                );
              },
              size: 50,
            }),
          ),
        }),
      ];
    }
    return [];
  }, [columnHelper, head.vars, maxTextLength, renderMarkdown]);

  const getOutput = React.useCallback(
    (rowIndex: number, promptIndex: number) => {
      return filteredBody[rowIndex].outputs[promptIndex];
    },
    [filteredBody],
  );

  const getFirstOutput = React.useCallback(
    (rowIndex: number) => {
      return filteredBody[rowIndex].outputs[0];
    },
    [filteredBody],
  );

  const metricTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    table?.body.forEach((row) => {
      row.test.assert?.forEach((assertion) => {
        if (assertion.metric) {
          totals[assertion.metric] = (totals[assertion.metric] || 0) + 1;
        }
        if ('assert' in assertion && Array.isArray(assertion.assert)) {
          assertion.assert.forEach((subAssertion) => {
            if ('metric' in subAssertion && subAssertion.metric) {
              totals[subAssertion.metric] = (totals[subAssertion.metric] || 0) + 1;
            }
          });
        }
      });
    });
    return totals;
  }, [table]);

  const promptColumns = React.useMemo(() => {
    return [
      columnHelper.group({
        id: 'prompts',
        header: () => <span className="font-bold">Outputs</span>,
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

              const details = showStats ? (
                <div className="prompt-detail">
                  {numAsserts[idx] ? (
                    <div>
                      <strong>Asserts:</strong> {numGoodAsserts[idx]}/{numAsserts[idx]} passed
                    </div>
                  ) : null}
                  {prompt.metrics?.cost ? (
                    <div>
                      <strong>Total Cost:</strong>{' '}
                      <Tooltip
                        title={`Average: $${Intl.NumberFormat(undefined, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: prompt.metrics.cost / body.length >= 1 ? 2 : 4,
                        }).format(prompt.metrics.cost / body.length)} per test`}
                      >
                        <span style={{ cursor: 'help' }}>
                          $
                          {Intl.NumberFormat(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: prompt.metrics.cost >= 1 ? 2 : 4,
                          }).format(prompt.metrics.cost)}
                        </span>
                      </Tooltip>
                    </div>
                  ) : null}
                  {prompt.metrics?.tokenUsage?.total ? (
                    <div>
                      <strong>Total Tokens:</strong>{' '}
                      {Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 0,
                      }).format(prompt.metrics.tokenUsage.total)}
                    </div>
                  ) : null}

                  {prompt.metrics?.tokenUsage?.total ? (
                    <div>
                      <strong>Avg Tokens:</strong>{' '}
                      {Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 0,
                      }).format(prompt.metrics.tokenUsage.total / body.length)}
                    </div>
                  ) : null}
                  {prompt.metrics?.totalLatencyMs ? (
                    <div>
                      <strong>Avg Latency:</strong>{' '}
                      {Intl.NumberFormat(undefined, {
                        maximumFractionDigits: 0,
                      }).format(prompt.metrics.totalLatencyMs / body.length)}{' '}
                      ms
                    </div>
                  ) : null}
                  {prompt.metrics?.totalLatencyMs && prompt.metrics?.tokenUsage?.completion ? (
                    <div>
                      <strong>Tokens/Sec:</strong>{' '}
                      {prompt.metrics.totalLatencyMs > 0
                        ? Intl.NumberFormat(undefined, {
                            maximumFractionDigits: 0,
                          }).format(
                            prompt.metrics.tokenUsage.completion /
                              (prompt.metrics.totalLatencyMs / 1000),
                          )
                        : '0'}
                    </div>
                  ) : null}
                </div>
              ) : null;
              const providerConfig = Array.isArray(config?.providers)
                ? config.providers[idx]
                : undefined;
              const providerParts = prompt.provider ? prompt.provider.split(':') : [];
              const providerDisplay = (
                <Tooltip title={providerConfig ? <pre>{yaml.dump(providerConfig)}</pre> : ''}>
                  {providerParts.length > 1 ? (
                    <>
                      {providerParts[0]}:<strong>{providerParts.slice(1).join(':')}</strong>
                    </>
                  ) : (
                    <strong>{prompt.provider}</strong>
                  )}
                </Tooltip>
              );
              return (
                <div className="output-header">
                  <div className="pills">
                    {prompt.provider ? <div className="provider">{providerDisplay}</div> : null}
                    <div className="summary">
                      <div className={`highlight ${isHighestPassing ? 'success' : ''}`}>
                        <strong>{pct}% passing</strong> ({numGoodTests[idx]}/{body.length} cases)
                      </div>
                    </div>
                    {prompt.metrics?.testErrorCount && prompt.metrics.testErrorCount > 0 ? (
                      <div className="summary error-pill" onClick={() => setFilterMode('errors')}>
                        <div className="highlight fail">
                          <strong>Errors:</strong> {prompt.metrics?.testErrorCount || 0}
                        </div>
                      </div>
                    ) : null}
                    {prompt.metrics?.namedScores &&
                    Object.keys(prompt.metrics.namedScores).length > 0 ? (
                      <CustomMetrics
                        lookup={prompt.metrics.namedScores}
                        counts={prompt.metrics.namedScoresCount}
                        metricTotals={metricTotals}
                        onSearchTextChange={onSearchTextChange}
                      />
                    ) : null}
                    {/* TODO(ian): Remove backwards compatibility for prompt.provider added 12/26/23 */}
                  </div>
                  <TableHeader
                    className="prompt-container"
                    text={prompt.label || prompt.display || prompt.raw}
                    expandedText={prompt.raw}
                    maxLength={maxTextLength}
                    resourceId={prompt.id}
                  />
                  {details}
                  {filterMode === 'failures' && head.prompts.length > 1 && (
                    <FormControlLabel
                      sx={{
                        '& .MuiFormControlLabel-label': {
                          fontSize: '0.75rem',
                        },
                      }}
                      control={
                        <Checkbox
                          checked={isChecked}
                          onChange={(event) =>
                            onFailureFilterToggle(columnId, event.target.checked)
                          }
                        />
                      }
                      label="Show failures"
                    />
                  )}
                </div>
              );
            },
            cell: (info: CellContext<EvaluateTableRow, EvaluateTableOutput>) => {
              const output = getOutput(info.row.index, idx);
              return output ? (
                <EvalOutputCell
                  output={output}
                  maxTextLength={maxTextLength}
                  rowIndex={info.row.index}
                  promptIndex={idx}
                  onRating={handleRating.bind(
                    null,
                    output.originalRowIndex ?? info.row.index,
                    output.originalPromptIndex ?? idx,
                    output.id,
                  )}
                  firstOutput={getFirstOutput(info.row.index)}
                  showDiffs={filterMode === 'different'}
                  searchText={searchText}
                  showStats={showStats}
                />
              ) : (
                <div style={{ padding: '20px' }}>'Test still in progress...'</div>
              );
            },
          }),
        ),
      }),
    ];
  }, [
    body.length,
    config?.providers,
    columnHelper,
    failureFilter,
    filterMode,
    getFirstOutput,
    getOutput,
    handleRating,
    head.prompts,
    highestPassingCount,
    maxTextLength,
    metricTotals,
    numAsserts,
    numGoodAsserts,
    numGoodTests,
    onFailureFilterToggle,
    onSearchTextChange,
    searchText,
    showStats,
  ]);

  const descriptionColumn = React.useMemo(() => {
    const hasAnyDescriptions = body.some((row) => row.test.description);
    if (hasAnyDescriptions) {
      return {
        accessorFn: (row: EvaluateTableRow) => row.test.description || '',
        id: 'description',
        header: () => <span className="font-bold">Description</span>,
        cell: (info: CellContext<EvaluateTableRow, unknown>) => (
          <div className="cell">
            <TruncatedText text={String(info.getValue())} maxLength={maxTextLength} />
          </div>
        ),
        size: 50,
      };
    }
    return null;
  }, [body, maxTextLength]);

  const columns = React.useMemo(() => {
    const cols: ColumnDef<EvaluateTableRow, unknown>[] = [];
    if (descriptionColumn) {
      cols.push(descriptionColumn);
    }
    cols.push(...variableColumns, ...promptColumns);
    return cols;
  }, [descriptionColumn, variableColumns, promptColumns]);

  const reactTable = useReactTable({
    data: filteredBody,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      columnVisibility,
      pagination,
    },
  });

  const { isCollapsed } = useScrollHandler();
  const { stickyHeader, setStickyHeader } = useResultsViewStore();

  return (
    <div>
      <table
        className={`results-table firefox-fix ${maxTextLength <= 25 ? 'compact' : ''}`}
        style={{
          wordBreak,
        }}
      >
        <thead className={`${isCollapsed ? 'collapsed' : ''} ${stickyHeader ? 'sticky' : ''}`}>
          {stickyHeader && isCollapsed && (
            <div className="header-dismiss">
              <IconButton
                onClick={() => setStickyHeader(false)}
                size="small"
                sx={{ color: 'text.primary' }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </div>
          )}
          {reactTable.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="header">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  style={{
                    width: header.getSize(),
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={`resizer ${header.column.getIsResizing() ? 'isResizing' : ''}`}
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {reactTable.getRowModel().rows.map((row, rowIndex) => {
            let colBorderDrawn = false;
            return (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const isMetadataCol =
                    cell.column.id.startsWith('Variable') || cell.column.id === 'description';
                  const shouldDrawColBorder = !isMetadataCol && !colBorderDrawn;
                  if (shouldDrawColBorder) {
                    colBorderDrawn = true;
                  }
                  const shouldDrawRowBorder = rowIndex === 0 && !isMetadataCol;

                  let cellContent = flexRender(cell.column.columnDef.cell, cell.getContext());
                  const value = cell.getValue();
                  if (
                    typeof value === 'string' &&
                    (value.match(/^data:(image\/[a-z]+|application\/octet-stream);base64,/) ||
                      value.match(/^\/[0-9A-Za-z+/]{4}.*/))
                  ) {
                    const imgSrc = value.startsWith('data:')
                      ? value
                      : `data:image/jpeg;base64,${value}`;
                    cellContent = (
                      <>
                        <img
                          src={imgSrc}
                          alt="Base64 encoded image"
                          style={{
                            maxWidth: '100%',
                            height: 'auto',
                            cursor: 'pointer',
                          }}
                          onClick={() => toggleLightbox(imgSrc)}
                        />
                        {lightboxOpen && lightboxImage === imgSrc && (
                          <div className="lightbox" onClick={() => toggleLightbox()}>
                            <img
                              src={lightboxImage}
                              alt="Lightbox"
                              style={{
                                maxWidth: '90%',
                                maxHeight: '90vh',
                                objectFit: 'contain',
                              }}
                            />
                          </div>
                        )}
                      </>
                    );
                  }

                  return (
                    <td
                      key={cell.id}
                      style={{
                        width: cell.column.getSize(),
                      }}
                      className={`${isMetadataCol ? 'variable' : ''} ${
                        shouldDrawRowBorder ? 'first-prompt-row' : ''
                      } ${shouldDrawColBorder ? 'first-prompt-col' : 'second-prompt-column'}`}
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {reactTable.getPageCount() > 1 && (
        <Box className="pagination" mx={1} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            onClick={() => {
              setPagination((old) => ({ ...old, pageIndex: Math.max(old.pageIndex - 1, 0) }));
              window.scrollTo(0, 0);
            }}
            disabled={reactTable.getState().pagination.pageIndex === 0}
            variant="contained"
          >
            Previous
          </Button>
          <Typography component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            Page
            <TextField
              size="small"
              type="number"
              value={reactTable.getState().pagination.pageIndex + 1}
              onChange={(e) => {
                const page = e.target.value ? Number(e.target.value) - 1 : 0;
                setPagination((old) => ({
                  ...old,
                  pageIndex: Math.min(Math.max(page, 0), reactTable.getPageCount() - 1),
                }));
              }}
              InputProps={{
                style: { width: '60px', textAlign: 'center' },
              }}
              variant="outlined"
            />
            <span>of {reactTable.getPageCount()}</span>
          </Typography>
          <Button
            onClick={() => {
              setPagination((old) => ({
                ...old,
                pageIndex: Math.min(old.pageIndex + 1, reactTable.getPageCount() - 1),
              }));
              window.scrollTo(0, 0);
            }}
            disabled={reactTable.getState().pagination.pageIndex + 1 >= reactTable.getPageCount()}
            variant="contained"
          >
            Next
          </Button>
          <Typography component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Select
              value={pagination.pageSize}
              onChange={(e) => {
                setPagination({ pageIndex: 0, pageSize: Number(e.target.value) });
                window.scrollTo(0, 0);
              }}
              displayEmpty
              inputProps={{ 'aria-label': 'Results per page' }}
              size="small"
              sx={{ m: 1, minWidth: 80 }}
            >
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
              <MenuItem value={500}>500</MenuItem>
              <MenuItem value={1000}>1000</MenuItem>
            </Select>
            <span>results per page</span>
          </Typography>
        </Box>
      )}
      <GenerateTestCases />
    </div>
  );
}

export default React.memo(ResultsTable);
