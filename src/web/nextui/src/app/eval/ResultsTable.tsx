import * as React from 'react';
import { diffSentences, diffJson, diffWords } from 'diff';

import './index.css';

import ReactMarkdown from 'react-markdown';
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

import CustomMetrics from '@/app/eval/CustomMetrics';
import EvalOutputPromptDialog from '@/app/eval/EvalOutputPromptDialog';
import GenerateTestCases from '@/app/eval/GenerateTestCases';
import { getApiBaseUrl } from '@/api';
import { useStore as useResultsViewStore } from './store';
import { useStore as useMainStore } from '@/app/eval/store';

import type { CellContext, ColumnDef, VisibilityState } from '@tanstack/table-core';

import type {
  EvaluateTableRow,
  EvaluateTableOutput,
  FilterMode,
  GradingResult,
  EvaluateTable,
} from './types';

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
  showStats: boolean;
  onRating: (
    rowIndex: number,
    promptIndex: number,
    isPass?: boolean,
    score?: number,
    comment?: string,
  ) => void;
}

function EvalOutputCell({
  output,
  maxTextLength,
  rowIndex,
  promptIndex,
  onRating,
  firstOutput,
  filterMode,
  searchText,
  showStats,
}: PromptOutputProps & {
  firstOutput: EvaluateTableOutput;
  filterMode: FilterMode;
  searchText: string;
}) {
  const { renderMarkdown, prettifyJson, showPrompts } = useResultsViewStore();
  const [openPrompt, setOpen] = React.useState(false);
  const handlePromptOpen = () => {
    setOpen(true);
  };
  const handlePromptClose = () => {
    setOpen(false);
  };

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const toggleLightbox = () => setLightboxOpen(!lightboxOpen);

  let text = typeof output.text === 'string' ? output.text : JSON.stringify(output.text);
  let node: React.ReactNode | undefined;
  let chunks: string[] = [];
  if (text.startsWith('[IMAGE]')) {
    const url = text.slice('[IMAGE]'.length).trim();

    node = (
      <>
        <img loading="lazy" src={url} alt={output.prompt} onClick={toggleLightbox} />
        {lightboxOpen && (
          <div className="lightbox" onClick={toggleLightbox}>
            <img src={url} alt={output.prompt} />
          </div>
        )}
      </>
    );
  } else if (!output.pass && text.includes('---')) {
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

  if (searchText) {
    // Highlight search matches
    const regex = new RegExp(searchText, 'gi');
    const matches: { start: number; end: number }[] = [];
    let match;
    let lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: regex.lastIndex,
      });
      lastIndex = regex.lastIndex;
    }
    node = (
      <>
        {matches.length > 0 ? (
          <>
            <span key="text-before">{text.substring(0, matches[0].start)}</span>
            {matches.map((range, index) => (
              <>
                <span className="search-highlight" key={'match-' + index}>
                  {text.substring(range.start, range.end)}
                </span>
                <span key={'text-after-' + index}>
                  {text.substring(
                    range.end,
                    matches[index + 1] ? matches[index + 1].start : text.length,
                  )}
                </span>
              </>
            ))}
          </>
        ) : (
          <span key="no-match">{text}</span>
        )}
      </>
    );
  } else if (renderMarkdown) {
    node = <ReactMarkdown>{text}</ReactMarkdown>;
  } else if (prettifyJson) {
    try {
      node = <pre>{JSON.stringify(JSON.parse(text), null, 2)}</pre>;
    } catch (error) {
      // Ignore because it's probably not JSON.
    }
  }

  const handleRating = (isPass: boolean) => {
    onRating(rowIndex, promptIndex, isPass, undefined, output.gradingResult?.comment);
  };

  const handleSetScore = () => {
    const score = prompt('Set test score (0.0 - 1.0):', String(output.score));
    if (score !== null) {
      const parsedScore = parseFloat(score);
      if (!isNaN(parsedScore) && parsedScore >= 0.0 && parsedScore <= 1.0) {
        onRating(rowIndex, promptIndex, undefined, parsedScore, output.gradingResult?.comment);
      } else {
        alert('Invalid score. Please enter a value between 0.0 and 1.0.');
      }
    }
  };

  const handleComment = () => {
    const comment = prompt('Comment:', output.gradingResult?.comment || '');
    if (comment != null) {
      onRating(rowIndex, promptIndex, undefined, undefined, comment);
    }
  };

  let tokenUsageDisplay;
  let latencyDisplay;
  let tokPerSecDisplay;
  let costDisplay;

  if (output.tokenUsage?.completion) {
    latencyDisplay = (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(output.latencyMs)} ms
      </span>
    );
    const tokPerSec = output.tokenUsage.completion / (output.latencyMs / 1000);
    tokPerSecDisplay = (
      <span>{Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokPerSec)}</span>
    );
  }

  if (output.cost) {
    costDisplay = <span>${output.cost.toPrecision(2)}</span>;
  }

  if (output.tokenUsage?.cached) {
    tokenUsageDisplay = (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
          output.tokenUsage.cached,
        )}{' '}
        (cached)
      </span>
    );
  } else if (output.tokenUsage?.total) {
    tokenUsageDisplay = (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(output.tokenUsage.total)}
      </span>
    );
  }

  const comment = output.gradingResult?.comment ? (
    <div className="comment" onClick={handleComment}>
      {output.gradingResult.comment}
    </div>
  ) : null;

  const detail = showStats ? (
    <div className="cell-detail">
      {tokenUsageDisplay && (
        <div className="stat-item">
          <strong>Tokens:</strong> {tokenUsageDisplay}
        </div>
      )}
      {latencyDisplay && (
        <div className="stat-item">
          <strong>Latency:</strong> {latencyDisplay}
        </div>
      )}
      {tokPerSecDisplay && (
        <div className="stat-item">
          <strong>Tokens/Sec:</strong> {tokPerSecDisplay}
        </div>
      )}
      {costDisplay && (
        <div className="stat-item">
          <strong>Cost:</strong> {costDisplay}
        </div>
      )}
    </div>
  ) : null;

  const actions = (
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
      <span className="action" onClick={() => handleRating(true)}>
        <Tooltip title="Mark test passed (score 1.0)">
          <span>👍</span>
        </Tooltip>
      </span>
      <span className="action" onClick={() => handleRating(false)}>
        <Tooltip title="Mark test failed (score 0.0)">
          <span>👎</span>
        </Tooltip>
      </span>
      <span className="action" onClick={handleSetScore}>
        <Tooltip title="Set test score">
          <span>🔢</span>
        </Tooltip>
      </span>
      <span className="action" onClick={handleComment}>
        <Tooltip title="Edit comment">
          <span>✏️</span>
        </Tooltip>
      </span>
    </div>
  );

  // TODO(ian): output.prompt check for backwards compatibility, remove after 0.17.0
  return (
    <div className="cell">
      {output.pass ? (
        <>
          <div className="status pass">
            <div className="pill">
              PASS <span className="score">{scoreToString(output.score)}</span>
            </div>
            <CustomMetrics lookup={output.namedScores} />
          </div>
        </>
      ) : (
        <>
          <div className="status fail">
            <div className="pill">
              FAIL{output.score > 0 ? ' ' : ''}
              <span className="score">{scoreToString(output.score)}</span>
            </div>
            <CustomMetrics lookup={output.namedScores} />
            <span className="fail-reason">
              {chunks[0]
                ?.trim()
                .split('\n')
                .map((line, index) => (
                  <React.Fragment key={index}>
                    {line}
                    <br />
                  </React.Fragment>
                ))}
            </span>
          </div>
        </>
      )}
      {showPrompts && firstOutput.prompt && (
        <div className="prompt">
          <span className="pill">Prompt</span>
          {output.prompt}
        </div>
      )}
      <TruncatedText text={node || text} maxLength={maxTextLength} />
      {comment}
      {detail}
      {actions}
    </div>
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
  searchText: string;
  showStats: boolean;
  onFailureFilterToggle: (columnId: string, checked: boolean) => void;
}

export default function ResultsTable({
  maxTextLength,
  columnVisibility,
  wordBreak,
  filterMode,
  failureFilter,
  searchText,
  showStats,
  onFailureFilterToggle,
}: ResultsTableProps) {
  const { evalId: filePath, table, setTable } = useMainStore();
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

  const handleRating = async (
    rowIndex: number,
    promptIndex: number,
    isPass?: boolean,
    score?: number,
    comment?: string,
  ) => {
    const updatedData = [...body];
    const updatedRow = { ...updatedData[rowIndex] };
    const updatedOutputs = [...updatedRow.outputs];
    // TODO(ian): Remove output.pass and output.score, and just use output.gradingResult.
    const finalPass = isPass ?? updatedOutputs[promptIndex].pass;
    const finalScore = typeof score === 'undefined' ? (isPass ? 1 : 0) : score || 0;
    updatedOutputs[promptIndex].pass = finalPass;
    updatedOutputs[promptIndex].score = finalScore;

    // Override the gradingResult
    const gradingResult = {
      ...(updatedOutputs[promptIndex].gradingResult || {}),
      pass: finalPass,
      score: finalScore,
      reason: 'Manual result (overrides all other grading results)',
      comment,
      assertion: null,
    };
    updatedOutputs[promptIndex].gradingResult = gradingResult;
    updatedRow.outputs = updatedOutputs;
    updatedData[rowIndex] = updatedRow;
    const newTable: EvaluateTable = {
      head,
      body: updatedData,
    };
    setTable(newTable);
    try {
      const response = await fetch(`${await getApiBaseUrl()}/api/eval/${filePath}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ table: newTable }),
      });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
    } catch (error) {
      console.error('Failed to update table:', error);
    }
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
        header: () => <span className="font-bold">Variables</span>,
        columns: head.vars.map((varName, idx) =>
          columnHelper.accessor(
            (row: EvaluateTableRow) => {
              return row.vars[idx];
            },
            {
              id: `Variable ${idx + 1}`,
              header: () => (
                <TableHeader text={varName} maxLength={maxTextLength} className="font-bold" />
              ),
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
                {prompt.metrics?.totalLatencyMs ? (
                  <div>
                    <strong>Avg Latency:</strong>{' '}
                    {Intl.NumberFormat(undefined, {
                      maximumFractionDigits: 0,
                    }).format(prompt.metrics.totalLatencyMs / body.length)}{' '}
                    ms
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
                {prompt.metrics?.totalLatencyMs && prompt.metrics?.tokenUsage?.completion ? (
                  <div>
                    <strong>Tokens/Sec:</strong>{' '}
                    {Intl.NumberFormat(undefined, {
                      maximumFractionDigits: 0,
                    }).format(
                      prompt.metrics.tokenUsage.completion / (prompt.metrics.totalLatencyMs / 1000),
                    )}
                  </div>
                ) : null}
                {prompt.metrics?.cost ? (
                  <div>
                    <strong>Cost:</strong> ${prompt.metrics.cost.toPrecision(2)}
                  </div>
                ) : null}
              </div>
            ) : null;

            const allProvidersSame = head.prompts.every(
              (p) => p.provider === head.prompts[0].provider,
            );
            const providerParts = prompt.provider ? prompt.provider.split(':') : [];
            const providerDisplay =
              providerParts.length > 1 ? (
                <>
                  {providerParts[0]}:<strong>{providerParts.slice(1).join(':')}</strong>
                </>
              ) : (
                <strong>{prompt.provider}</strong>
              );
            return (
              <div className="output-header">
                <div className="pills">
                  {!allProvidersSame && prompt.provider ? (
                    <div className="provider">{providerDisplay}</div>
                  ) : null}
                  <div className="summary">
                    <div className={`highlight ${isHighestPassing ? 'success' : ''}`}>
                      <strong>{pct}% passing</strong> ({numGoodTests[idx]}/{body.length} cases)
                    </div>
                  </div>
                  {prompt.metrics?.namedScores &&
                  Object.keys(prompt.metrics.namedScores).length > 0 ? (
                    <CustomMetrics lookup={prompt.metrics.namedScores} />
                  ) : null}
                  {/* TODO(ian): Remove backwards compatibility for prompt.provider added 12/26/23 */}
                </div>
                <TableHeader
                  className="prompt-container"
                  text={prompt.display}
                  expandedText={prompt.raw}
                  maxLength={maxTextLength}
                  resourceId={prompt.id}
                />
                {details}
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
              </div>
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
              searchText={searchText}
              showStats={showStats}
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
      header: () => <span className="font-bold">Description</span>,
      cell: (info: CellContext<EvaluateTableRow, unknown>) => (
        <TruncatedText text={String(info.getValue())} maxLength={maxTextLength} />
      ),
      size: 50,
    };
    columns.splice(0, 0, descriptionColumn);
  }

  const columnVisibilityIsSet = Object.keys(columnVisibility).length > 0;
  const filteredBody = React.useMemo(() => {
    const searchRegex = new RegExp(searchText, 'i');
    return body.filter((row) => {
      const outputsPassFilter =
        filterMode === 'failures'
          ? row.outputs.some((output, idx) => {
              const columnId = `Prompt ${idx + 1}`;
              return (
                failureFilter[columnId] &&
                !output.pass &&
                (!columnVisibilityIsSet || columnVisibility[columnId])
              );
            })
          : filterMode === 'different'
          ? !row.outputs.every((output) => output.text === row.outputs[0].text)
          : true;

      const outputsMatchSearch = searchText
        ? row.outputs.some((output) => {
            const stringifiedOutput = `${output.text} ${Object.keys(output.namedScores)} ${
              output.gradingResult?.reason
            }`;
            return searchRegex.test(stringifiedOutput);
          })
        : true;

      return outputsPassFilter && outputsMatchSearch;
    });
  }, [body, failureFilter, filterMode, searchText, columnVisibility, columnVisibilityIsSet]);

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
    <div>
      <table
        className={`results-table firefox-fix ${maxTextLength <= 25 ? 'compact' : ''}`}
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
      <GenerateTestCases />
    </div>
  );
}
