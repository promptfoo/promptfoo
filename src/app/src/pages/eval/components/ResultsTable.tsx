import React, { useEffect, useRef } from 'react';

import ErrorBoundary from '@app/components/ErrorBoundary';
import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { EVAL_ROUTES, ROUTES } from '@app/constants/routes';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { formatDuration } from '@app/utils/date';
import { normalizeMediaText, resolveAudioSource, resolveImageSource } from '@app/utils/media';
import { getActualPrompt } from '@app/utils/providerResponse';
import { FILE_METADATA_KEY, HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import {
  type EvalResultsFilterMode,
  type EvaluateTable,
  type EvaluateTableOutput,
  type EvaluateTableRow,
  type GradingResult,
  type ProviderOptions,
  type Vars,
} from '@promptfoo/types';
import invariant from '@promptfoo/util/invariant';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowLeft, ArrowRight, ExternalLink, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import CustomMetrics from './CustomMetrics';
import CustomMetricsDialog from './CustomMetricsDialog';
import EvalOutputCell from './EvalOutputCell';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import { useFilterMode } from './FilterModeProvider';
import { ProviderDisplay } from './ProviderDisplay';
import { type ProviderDef } from './providerConfig';
import { useResultsViewSettingsStore, useTableStore } from './store';
import TruncatedText from './TruncatedText';
import VariableMarkdownCell from './VariableMarkdownCell';
import type {
  Cell,
  CellContext,
  ColumnDef,
  ColumnSizingState,
  Row,
  VisibilityState,
} from '@tanstack/table-core';

import type { TruncatedTextProps } from './TruncatedText';
import './ResultsTable.css';

import { NumberInput } from '@app/components/ui/number-input';
import { isBlobRef, isStorageRef, resolveAudioUrl } from '@app/utils/mediaStorage';
import { isEncodingStrategy } from '@promptfoo/redteam/constants/strategies';
import { useMetricsGetter, usePassingTestCounts, usePassRates, useTestCounts } from './hooks';
import { getNamedMetricTotals } from './utils';

/**
 * Audio player component that handles both storage refs and base64 data
 */
function StorageRefAudioPlayer({ data, format = 'mp3' }: { data: string; format?: string }) {
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(isStorageRef(data) || isBlobRef(data));

  React.useEffect(() => {
    let cancelled = false;

    if (isStorageRef(data) || isBlobRef(data)) {
      setLoading(true);
      resolveAudioUrl(data, format).then((url) => {
        if (!cancelled) {
          setAudioUrl(url);
          setLoading(false);
        }
      });
    } else {
      // Inline base64
      const url = data.startsWith('data:') ? data : `data:audio/${format};base64,${data}`;
      setAudioUrl(url);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [data, format]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <Spinner className="size-4" />
        <span className="text-xs text-muted-foreground">Loading audio...</span>
      </div>
    );
  }

  if (!audioUrl) {
    return <span className="text-xs text-destructive">Failed to load audio</span>;
  }

  return (
    <audio controls style={{ maxWidth: '100%', height: '32px' }}>
      <source src={audioUrl} type={`audio/${format}`} />
      Your browser does not support the audio element.
    </audio>
  );
}

const VARIABLE_COLUMN_SIZE_PX = 200;
const PROMPT_COLUMN_SIZE_PX = 400;
const DESCRIPTION_COLUMN_SIZE_PX = 100;

function formatRowOutput(output: EvaluateTableOutput | string | null | undefined) {
  if (output == null) {
    return output;
  }

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
    <div className={`${className || ''} flex items-center gap-1`}>
      {expandedText ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="text-left cursor-pointer transition-colors px-2 py-1.5 -mx-2 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground font-mono text-[13px]"
              onClick={handlePromptOpen}
            >
              <span className="line-clamp-3">{text}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>View prompt</TooltipContent>
        </Tooltip>
      ) : (
        <TruncatedText text={text} maxLength={maxLength} />
      )}
      {expandedText && (
        <>
          {promptOpen && (
            <EvalOutputPromptDialog
              open={promptOpen}
              onClose={handlePromptClose}
              prompt={expandedText}
            />
          )}
          {resourceId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={ROUTES.PROMPT_DETAIL(resourceId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View other evals and datasets for this prompt"
                  className="action"
                >
                  <ExternalLink className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>View other evals and datasets for this prompt</TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  );
}

function getVariableCellValue({
  row,
  varName,
  injectVarName,
  fallbackValue,
}: {
  row: EvaluateTableRow;
  varName: string;
  injectVarName: string;
  fallbackValue: string | object;
}): string | object {
  let value = fallbackValue;

  if (varName === injectVarName) {
    for (const output of row.outputs || []) {
      const actualPrompt = getActualPrompt(output?.response);
      if (actualPrompt) {
        value = actualPrompt;
        break;
      }
    }
  }

  if (value && value !== '') {
    return value;
  }

  for (const output of row.outputs || []) {
    const transformVars = output?.metadata?.transformDisplayVars as
      | Record<string, string>
      | undefined;
    if (transformVars?.[varName]) {
      return transformVars[varName];
    }
  }

  return value;
}

function renderMediaVariableCell({
  output,
  mediaMetadata,
  value,
  lightboxOpen,
  lightboxImage,
  maxTextLength,
  toggleLightbox,
}: {
  output: EvaluateTableOutput | null;
  mediaMetadata?: { path: string; type: string; format?: string };
  value: string | object;
  lightboxOpen: boolean;
  lightboxImage: string | null;
  maxTextLength: number;
  toggleLightbox?: (url?: string) => void;
}): React.ReactNode | null {
  if (!output || !mediaMetadata || typeof value !== 'string') {
    return null;
  }

  const { type: mediaType, format = '' } = mediaMetadata;
  const normalizedValue = normalizeMediaText(value);
  const audioSource =
    mediaType === 'audio' ? resolveAudioSource({ data: value, format, blobRef: value }) : null;
  const imageSrc =
    mediaType === 'image' ? resolveImageSource({ data: value, format, blobRef: value }) : undefined;

  const mediaElement =
    mediaType === 'audio' && audioSource ? (
      <audio controls style={{ maxWidth: '100%' }}>
        <source src={audioSource.src} type={audioSource.type || 'audio/mpeg'} />
        Your browser does not support the audio element.
      </audio>
    ) : mediaType === 'video' ? (
      <video controls style={{ maxWidth: '100%', maxHeight: '200px' }}>
        <source
          src={
            normalizedValue.startsWith('data:') ||
            normalizedValue.startsWith('http') ||
            normalizedValue.startsWith('/api/')
              ? normalizedValue
              : `data:${mediaType}/${format};base64,${value}`
          }
          type={`video/${format || 'mp4'}`}
        />
        Your browser does not support the video element.
      </video>
    ) : mediaType === 'image' && imageSrc && toggleLightbox ? (
      renderImageCellContent({
        imgSrc: imageSrc,
        lightboxOpen,
        lightboxImage,
        maxTextLength,
        toggleLightbox,
        alt: 'Input image',
      })
    ) : null;

  if (!mediaElement) {
    return null;
  }

  return (
    <div className="cell">
      <div style={{ marginBottom: '8px' }}>{mediaElement}</div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span style={{ fontSize: '0.8em', color: '#666' }}>
            {mediaMetadata.path} ({mediaType}/{format})
          </span>
        </TooltipTrigger>
        <TooltipContent>Original file path</TooltipContent>
      </Tooltip>
    </div>
  );
}

function renderDecodedVariableCell({
  value,
  varName,
  row,
  injectVarName,
  maxTextLength,
  cellContent,
}: {
  value: string | object;
  varName: string;
  row: EvaluateTableRow;
  injectVarName: string;
  maxTextLength: number;
  cellContent: React.ReactNode;
}): React.ReactNode {
  const testMetadata: Record<string, unknown> = row.test?.metadata || {};
  const metadataOriginal =
    typeof testMetadata.originalText === 'string' ? testMetadata.originalText : undefined;
  const strategyId = testMetadata.strategyId;
  const shouldShowOriginal =
    varName === injectVarName &&
    typeof strategyId === 'string' &&
    isEncodingStrategy(strategyId) &&
    Boolean(metadataOriginal);

  if (!shouldShowOriginal) {
    return (
      <div className="cell" data-capture="true">
        {cellContent}
      </div>
    );
  }

  const isAudioContent =
    strategyId === 'audio' ||
    (typeof value === 'string' &&
      (isStorageRef(value) || isBlobRef(value)) &&
      value.includes('audio/'));
  const isImageContent =
    strategyId === 'image' ||
    (typeof value === 'string' &&
      (isStorageRef(value) || isBlobRef(value)) &&
      value.includes('image/'));

  return (
    <div className="cell" data-capture="true">
      {isAudioContent && typeof value === 'string' ? (
        <div>
          <StorageRefAudioPlayer data={value} />
        </div>
      ) : isImageContent ? (
        <div>
          {typeof value === 'string' && (isStorageRef(value) || isBlobRef(value)) ? (
            <span className="text-xs text-muted-foreground">
              Image preview not yet supported for storage refs
            </span>
          ) : (
            cellContent
          )}
        </div>
      ) : (
        cellContent
      )}

      {metadataOriginal && (
        <div className="mt-1.5 text-muted-foreground text-[0.8em]">
          <strong>Original (decoded):</strong>{' '}
          <TruncatedText text={String(metadataOriginal)} maxLength={maxTextLength} />
        </div>
      )}
    </div>
  );
}

function renderVariableCell({
  info,
  varName,
  injectVarName,
  maxTextLength,
  renderMarkdown,
  lightboxOpen,
  lightboxImage,
  toggleLightbox,
}: {
  info: CellContext<EvaluateTableRow, string>;
  varName: string;
  injectVarName: string;
  maxTextLength: number;
  renderMarkdown: boolean;
  lightboxOpen: boolean;
  lightboxImage: string | null;
  toggleLightbox: (url?: string) => void;
}): React.ReactNode {
  const row = info.row.original;
  let value = getVariableCellValue({
    row,
    varName,
    injectVarName,
    fallbackValue: info.getValue(),
  });

  const output = row.outputs && row.outputs.length > 0 ? row.outputs[0] : null;
  const fileMetadata = output?.metadata?.[FILE_METADATA_KEY] as
    | Record<string, { path: string; type: string; format?: string }>
    | undefined;
  const mediaCell = renderMediaVariableCell({
    output,
    mediaMetadata: fileMetadata?.[varName],
    value,
    lightboxOpen,
    lightboxImage,
    maxTextLength,
    toggleLightbox,
  });

  if (mediaCell) {
    return mediaCell;
  }

  if (typeof value === 'object') {
    value = JSON.stringify(value, null, 2);
    if (renderMarkdown) {
      value = `\`\`\`json\n${value}\n\`\`\``;
    }
  }

  const cellContent = renderMarkdown ? (
    <VariableMarkdownCell value={value} maxTextLength={maxTextLength} />
  ) : (
    <TruncatedText text={value} maxLength={maxTextLength} />
  );

  return renderDecodedVariableCell({
    value,
    varName,
    row,
    injectVarName,
    maxTextLength,
    cellContent,
  });
}

type PromptSummaryMetric = {
  total?: number | null;
  filtered?: number | null;
};

type PromptMetrics = ReturnType<ReturnType<typeof useMetricsGetter>>;

type ManualRatingUpdate = {
  pass: EvaluateTableOutput['pass'];
  score: EvaluateTableOutput['score'];
  componentResults?: NonNullable<GradingResult['componentResults']>;
  modifiedComponentResults: boolean;
};

function formatProviderString(prompt: EvaluateTable['head']['prompts'][number]): string {
  if (typeof prompt.provider === 'string') {
    return prompt.provider;
  }

  if (typeof prompt.provider === 'object' && prompt.provider !== null) {
    return (prompt.provider as ProviderOptions).id || JSON.stringify(prompt.provider);
  }

  return String(prompt.provider || 'Unknown provider');
}

function formatMetricValue(
  value: number,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 0 },
): string {
  return Intl.NumberFormat(undefined, options).format(value);
}

function renderFilteredSuffix(value: React.ReactNode, unit = 'filtered'): React.ReactNode {
  return (
    <span style={{ fontSize: '0.9em', color: '#666', marginLeft: '4px' }}>
      ({value} {unit})
    </span>
  );
}

function renderRequestMetric({
  metrics,
  isRedteam,
}: {
  metrics: PromptMetrics['total'];
  isRedteam: boolean;
}): React.ReactNode {
  if (metrics?.tokenUsage?.numRequests === undefined) {
    return null;
  }

  return (
    <div>
      <strong>{isRedteam ? 'Probes:' : 'Requests:'}</strong> {metrics.tokenUsage.numRequests}
    </div>
  );
}

function renderAssertMetric({
  numAsserts,
  numGoodAsserts,
  idx,
}: {
  numAsserts: number[];
  numGoodAsserts: number[];
  idx: number;
}): React.ReactNode {
  if (!numAsserts[idx]) {
    return null;
  }

  return (
    <div>
      <strong>Asserts:</strong> {numGoodAsserts[idx]}/{numAsserts[idx]} passed
    </div>
  );
}

function renderCostMetric({
  metrics,
  filteredMetrics,
  testCount,
}: {
  metrics: PromptMetrics['total'];
  filteredMetrics: PromptMetrics['filtered'];
  testCount?: PromptSummaryMetric;
}): React.ReactNode {
  if (!metrics?.cost) {
    return null;
  }

  const totalAverage = testCount?.total ? metrics.cost / testCount.total : 0;
  const totalCost = formatMetricValue(metrics.cost, {
    minimumFractionDigits: 2,
    maximumFractionDigits: metrics.cost >= 1 ? 2 : 4,
  });
  const averageCost = formatMetricValue(totalAverage, {
    minimumFractionDigits: 1,
    maximumFractionDigits: testCount?.total && totalAverage >= 1 ? 2 : 4,
  });

  return (
    <div>
      <strong>Total Cost:</strong>{' '}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">${totalCost}</span>
        </TooltipTrigger>
        <TooltipContent>{`Average: $${averageCost} per test`}</TooltipContent>
      </Tooltip>
      {filteredMetrics?.cost && testCount?.filtered
        ? renderFilteredSuffix(
            `$${formatMetricValue(filteredMetrics.cost, {
              minimumFractionDigits: 2,
              maximumFractionDigits: filteredMetrics.cost >= 1 ? 2 : 4,
            })}`,
          )
        : null}
    </div>
  );
}

function renderTokenMetrics({
  metrics,
  filteredMetrics,
  testCount,
}: {
  metrics: PromptMetrics['total'];
  filteredMetrics: PromptMetrics['filtered'];
  testCount?: PromptSummaryMetric;
}): React.ReactNode[] {
  if (!metrics?.tokenUsage?.total) {
    return [];
  }

  const totalTokens = metrics.tokenUsage.total;
  const filteredTokens = filteredMetrics?.tokenUsage?.total;
  const totalAverage = testCount?.total ? totalTokens / testCount.total : 0;
  const filteredAverage =
    filteredTokens && testCount?.filtered ? filteredTokens / testCount.filtered : undefined;

  return [
    <div key="total-tokens">
      <strong>Total Tokens:</strong> {formatMetricValue(totalTokens)}
      {filteredTokens ? renderFilteredSuffix(formatMetricValue(filteredTokens)) : null}
    </div>,
    <div key="avg-tokens">
      <strong>Avg Tokens:</strong> {formatMetricValue(totalAverage)}
      {filteredAverage ? renderFilteredSuffix(formatMetricValue(filteredAverage)) : null}
    </div>,
  ];
}

function renderLatencyMetric({
  metrics,
  filteredMetrics,
  testCount,
}: {
  metrics: PromptMetrics['total'];
  filteredMetrics: PromptMetrics['filtered'];
  testCount?: PromptSummaryMetric;
}): React.ReactNode {
  if (!metrics?.totalLatencyMs) {
    return null;
  }

  const totalAverage = testCount?.total ? metrics.totalLatencyMs / testCount.total : 0;
  const filteredAverage =
    filteredMetrics?.totalLatencyMs != null && testCount?.filtered
      ? filteredMetrics.totalLatencyMs / testCount.filtered
      : undefined;

  const formatLatency = (ms: number) => formatDuration(ms) ?? `${formatMetricValue(ms)} ms`;
  const exactTotalMs = `${formatMetricValue(totalAverage, { maximumFractionDigits: 3 })} ms`;

  return (
    <div>
      <strong>Avg Latency:</strong>{' '}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help" aria-label={exactTotalMs}>
            {formatLatency(totalAverage)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{exactTotalMs}</TooltipContent>
      </Tooltip>
      {filteredAverage === undefined ? null : renderFilteredSuffix(formatLatency(filteredAverage))}
    </div>
  );
}

function renderTokensPerSecondMetric(metrics: PromptMetrics['total']): React.ReactNode {
  if (!metrics?.totalLatencyMs || !metrics.tokenUsage?.completion) {
    return null;
  }

  const tokPerSec =
    metrics.totalLatencyMs > 0
      ? metrics.tokenUsage.completion / (metrics.totalLatencyMs / 1000)
      : 0;

  return (
    <div>
      <strong>Tokens/Sec:</strong> {formatMetricValue(tokPerSec)}
    </div>
  );
}

function averageComponentResultScore(
  componentResults: NonNullable<GradingResult['componentResults']>,
  fallbackScore: EvaluateTableOutput['score'],
): EvaluateTableOutput['score'] {
  const scores = componentResults
    .map((result) => result.score)
    .filter((resultScore): resultScore is number => typeof resultScore === 'number');

  if (scores.length === 0) {
    return fallbackScore;
  }

  return scores.reduce((sum, resultScore) => sum + resultScore, 0) / scores.length;
}

function getManualRatingUpdate({
  existingOutput,
  isPass,
  score,
  comment,
}: {
  existingOutput: EvaluateTableOutput;
  isPass?: boolean | null;
  score?: number;
  comment?: string;
}): ManualRatingUpdate {
  let finalPass = existingOutput.pass;
  let finalScore = existingOutput.score;

  if (typeof score !== 'undefined') {
    finalScore = score;
  } else if (typeof isPass !== 'undefined' && isPass !== null) {
    finalScore = isPass ? 1 : 0;
  }

  if (typeof isPass === 'undefined') {
    return {
      pass: finalPass,
      score: finalScore,
      modifiedComponentResults: false,
    };
  }

  const componentResults = [...(existingOutput.gradingResult?.componentResults || [])];
  const humanResultIndex = componentResults.findIndex(
    (result) => result.assertion?.type === HUMAN_ASSERTION_TYPE,
  );

  if (isPass === null) {
    if (humanResultIndex !== -1) {
      componentResults.splice(humanResultIndex, 1);
    }

    if (componentResults.length > 0) {
      finalPass =
        componentResults.filter((result) => result.pass).length === componentResults.length;
      finalScore = averageComponentResultScore(componentResults, finalScore);
    }

    return {
      pass: finalPass,
      score: finalScore,
      componentResults,
      modifiedComponentResults: true,
    };
  }

  finalPass = isPass;

  const humanResult = {
    pass: finalPass,
    score: finalScore,
    reason: 'Manual result (overrides all other grading results)',
    comment,
    assertion: { type: HUMAN_ASSERTION_TYPE },
  };

  if (humanResultIndex === -1) {
    componentResults.push(humanResult);
  } else {
    componentResults[humanResultIndex] = humanResult;
  }

  return {
    pass: finalPass,
    score: finalScore,
    componentResults,
    modifiedComponentResults: true,
  };
}

function buildManualGradingResult({
  existingOutput,
  ratingUpdate,
  isPass,
  score,
  comment,
}: {
  existingOutput: EvaluateTableOutput;
  ratingUpdate: ManualRatingUpdate;
  isPass?: boolean | null;
  score?: number;
  comment?: string;
}): GradingResult {
  const { componentResults: _, ...existingGradingResultWithoutComponents } =
    existingOutput.gradingResult || {};

  const gradingResult: GradingResult = {
    ...existingGradingResultWithoutComponents,
    pass: existingOutput.gradingResult?.pass ?? ratingUpdate.pass,
    score: existingOutput.gradingResult?.score ?? ratingUpdate.score,
    reason: existingOutput.gradingResult?.reason ?? 'Manual result',
    comment,
  };

  if (isPass === null) {
    gradingResult.pass = ratingUpdate.pass;
    gradingResult.score = ratingUpdate.score;
    if (gradingResult.reason === 'Manual result (overrides all other grading results)') {
      gradingResult.reason = ratingUpdate.componentResults?.[0]?.reason || 'Manual rating cleared';
    }
    if (gradingResult.assertion?.type === HUMAN_ASSERTION_TYPE) {
      delete gradingResult.assertion;
    }
  } else if (typeof isPass !== 'undefined' || typeof score !== 'undefined') {
    gradingResult.pass = ratingUpdate.pass;
    gradingResult.score = ratingUpdate.score;
    gradingResult.reason = 'Manual result (overrides all other grading results)';
    if (existingOutput.gradingResult?.assertion) {
      gradingResult.assertion = existingOutput.gradingResult.assertion;
    }
  }

  if (ratingUpdate.modifiedComponentResults && ratingUpdate.componentResults) {
    gradingResult.componentResults = ratingUpdate.componentResults;
  } else if (existingOutput.gradingResult?.componentResults?.length) {
    gradingResult.componentResults = existingOutput.gradingResult.componentResults;
  }

  return gradingResult;
}

function buildRatingTableUpdate({
  head,
  body,
  rowIndex,
  promptIndex,
  ratingUpdate,
  gradingResult,
}: {
  head: EvaluateTable['head'];
  body: EvaluateTable['body'];
  rowIndex: number;
  promptIndex: number;
  ratingUpdate: ManualRatingUpdate;
  gradingResult: GradingResult;
}): EvaluateTable {
  const updatedData = [...body];
  const updatedRow = { ...updatedData[rowIndex] };
  const updatedOutputs = [...updatedRow.outputs];

  updatedOutputs[promptIndex] = {
    ...updatedOutputs[promptIndex],
    pass: ratingUpdate.pass,
    score: ratingUpdate.score,
    gradingResult,
  };
  updatedRow.outputs = updatedOutputs;
  updatedData[rowIndex] = updatedRow;

  return {
    head,
    body: updatedData,
  };
}

async function saveManualRating({
  evalId,
  resultId,
  version,
  gradingResult,
  table,
}: {
  evalId: string | null;
  resultId: string;
  version: number | null | undefined;
  gradingResult: GradingResult;
  table: EvaluateTable;
}): Promise<void> {
  invariant(evalId, 'Cannot save manual rating without an evaluation ID');

  const response =
    version && version >= 4
      ? await callApi(EVAL_ROUTES.RESULT_RATING(evalId, resultId), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...gradingResult }),
        })
      : await callApi(EVAL_ROUTES.DETAIL(evalId), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ table }),
        });

  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
}

function renderPromptMetricDetails({
  metrics,
  filteredMetrics,
  idx,
  isRedteam,
  showStats,
  numAsserts,
  numGoodAsserts,
  testCounts,
}: {
  metrics: PromptMetrics['total'];
  filteredMetrics: PromptMetrics['filtered'];
  idx: number;
  isRedteam: boolean;
  showStats: boolean;
  numAsserts: number[];
  numGoodAsserts: number[];
  testCounts: PromptSummaryMetric[];
}): React.ReactNode {
  if (!showStats) {
    return null;
  }

  return (
    <div className="prompt-detail collapse-hidden">
      {renderRequestMetric({ metrics, isRedteam })}
      {renderAssertMetric({ numAsserts, numGoodAsserts, idx })}
      {renderCostMetric({
        metrics,
        filteredMetrics,
        testCount: testCounts[idx],
      })}
      {renderTokenMetrics({
        metrics,
        filteredMetrics,
        testCount: testCounts[idx],
      })}
      {renderLatencyMetric({
        metrics,
        filteredMetrics,
        testCount: testCounts[idx],
      })}
      {renderTokensPerSecondMetric(metrics)}
    </div>
  );
}

function getPassRateClassName(passRate: PromptSummaryMetric | undefined): string {
  const bucket =
    passRate?.filtered === null
      ? passRate?.total
        ? Math.round(passRate.total / 20) * 20
        : 0
      : Math.round((passRate?.filtered ?? 0) / 20) * 20;

  return `highlight success-${bucket}`;
}

function PromptColumnHeader({
  prompt,
  idx,
  passRates,
  failureFilter,
  getMetrics,
  showStats,
  isRedteam,
  numAsserts,
  numGoodAsserts,
  testCounts,
  passingTestCounts,
  metricTotals,
  config,
  filterMode,
  headPromptCount,
  maxTextLength,
  onFailureFilterToggle,
  setFilterMode,
  setCustomMetricsDialogOpen,
}: {
  prompt: EvaluateTable['head']['prompts'][number];
  idx: number;
  passRates: PromptSummaryMetric[];
  failureFilter: { [key: string]: boolean };
  getMetrics: ReturnType<typeof useMetricsGetter>;
  showStats: boolean;
  isRedteam: boolean;
  numAsserts: number[];
  numGoodAsserts: number[];
  testCounts: PromptSummaryMetric[];
  passingTestCounts: PromptSummaryMetric[];
  metricTotals: Record<string, number>;
  config: ReturnType<typeof useTableStore.getState>['config'];
  filterMode: EvalResultsFilterMode;
  headPromptCount: number;
  maxTextLength: number;
  onFailureFilterToggle: (columnId: string, checked: boolean) => void;
  setFilterMode: (mode: EvalResultsFilterMode) => void;
  setCustomMetricsDialogOpen: (open: boolean) => void;
}) {
  const columnId = `Prompt ${idx + 1}`;
  const { total: metrics, filtered: filteredMetrics } = getMetrics(idx);

  return (
    <div className="output-header">
      <div className="pills collapse-font-small">
        {prompt.provider ? (
          <div className="provider">
            <ProviderDisplay
              providerString={formatProviderString(prompt)}
              providersArray={config?.providers as ProviderDef[] | undefined}
              fallbackIndex={idx}
            />
          </div>
        ) : null}
        <div className="summary">
          <div className={getPassRateClassName(passRates[idx])}>
            {passRates[idx]?.filtered === null ? (
              <>
                <strong>{passRates[idx]?.total?.toFixed(2) ?? '0.00'}% passing</strong> (
                {passingTestCounts[idx]?.total}/{testCounts[idx]?.total} cases)
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <strong>{passRates[idx]?.filtered?.toFixed(2)}% passing</strong> (
                    {passingTestCounts[idx]?.filtered}/{testCounts[idx]?.filtered} filtered,{' '}
                    {passingTestCounts[idx]?.total}/{testCounts[idx]?.total} total)
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {`Filtered: ${passingTestCounts[idx]?.filtered}/${testCounts[idx]?.filtered} passing (${passRates[idx]?.filtered?.toFixed(2)}%). Total: ${passingTestCounts[idx]?.total}/${testCounts[idx]?.total} passing (${passRates[idx]?.total?.toFixed(2)}%)`}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {metrics?.testErrorCount && metrics.testErrorCount > 0 ? (
          <button
            type="button"
            className="summary error-pill border-0 bg-transparent p-0 text-left"
            onClick={() => setFilterMode('errors')}
          >
            <div className="highlight fail">
              <strong>Errors:</strong> {metrics?.testErrorCount || 0}
            </div>
          </button>
        ) : null}
        {!isRedteam && metrics?.namedScores && Object.keys(metrics.namedScores).length > 0 ? (
          <div className="collapse-hidden">
            <CustomMetrics
              lookup={metrics.namedScores}
              counts={getNamedMetricTotals(metrics)}
              metricTotals={metricTotals}
              onShowMore={() => setCustomMetricsDialogOpen(true)}
            />
          </div>
        ) : null}
      </div>
      <TableHeader
        className="prompt-container collapse-font-small"
        text={prompt.label || prompt.display || prompt.raw}
        expandedText={prompt.raw}
        maxLength={maxTextLength}
        resourceId={prompt.id}
      />
      {renderPromptMetricDetails({
        metrics,
        filteredMetrics,
        idx,
        isRedteam,
        showStats,
        numAsserts,
        numGoodAsserts,
        testCounts,
      })}
      {filterMode === 'failures' && headPromptCount > 1 && (
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={failureFilter[columnId] || false}
            onCheckedChange={(checked) => onFailureFilterToggle(columnId, checked === true)}
          />
          <span>Show failures</span>
        </label>
      )}
    </div>
  );
}

function isMetadataColumn(columnId: string): boolean {
  return (
    columnId.startsWith('Variable') ||
    columnId.startsWith('TransformVar_') ||
    columnId === 'description'
  );
}

function getOriginalImageText({
  columnId,
  row,
  headVars,
  injectVarName,
}: {
  columnId: string;
  row: Row<EvaluateTableRow>;
  headVars: string[];
  injectVarName: string;
}): string | undefined {
  const match = columnId.match(/^Variable (\d+)$/);
  if (!match) {
    return undefined;
  }

  const varNameForCol = headVars[Number(match[1]) - 1];
  if (varNameForCol !== injectVarName) {
    return undefined;
  }

  const testMeta = row.original.test?.metadata || {};
  const fromMeta = typeof testMeta.originalText === 'string' ? testMeta.originalText : undefined;
  const testVars: Vars = row.original.test?.vars || {};
  const fromVars = typeof testVars.image_text === 'string' ? testVars.image_text : undefined;

  return fromVars || fromMeta;
}

function getVariableNameForColumn(columnId: string, headVars: string[]): string | undefined {
  const variableMatch = columnId.match(/^Variable (\d+)$/);
  if (variableMatch) {
    return headVars[Number(variableMatch[1]) - 1];
  }

  if (columnId.startsWith('TransformVar_')) {
    return columnId.slice('TransformVar_'.length);
  }

  return undefined;
}

function hasFileMetadataForColumn({
  columnId,
  row,
  headVars,
}: {
  columnId: string;
  row: Row<EvaluateTableRow>;
  headVars: string[];
}): boolean {
  const varName = getVariableNameForColumn(columnId, headVars);
  if (!varName) {
    return false;
  }

  const fileMetadata = row.original.outputs?.[0]?.metadata?.[FILE_METADATA_KEY] as
    | Record<string, unknown>
    | undefined;
  return Boolean(fileMetadata?.[varName]);
}

function getImageSourceForCell({
  columnId,
  value,
  row,
  headVars,
  injectVarName,
}: {
  columnId: string;
  value: unknown;
  row: Row<EvaluateTableRow>;
  headVars: string[];
  injectVarName: string;
}): string | undefined {
  if (typeof value !== 'string' || hasFileMetadataForColumn({ columnId, row, headVars })) {
    return undefined;
  }

  const varName = getVariableNameForColumn(columnId, headVars);
  const imageValue = varName
    ? getVariableCellValue({
        row: row.original,
        varName,
        injectVarName,
        fallbackValue: value,
      })
    : value;

  return typeof imageValue === 'string' ? resolveImageSource(imageValue) : undefined;
}

function renderImageCellContent({
  imgSrc,
  originalImageText,
  alt = 'Base64 encoded image',
  lightboxOpen,
  lightboxImage,
  maxTextLength,
  toggleLightbox,
}: {
  imgSrc: string;
  originalImageText?: string;
  alt?: string;
  lightboxOpen: boolean;
  lightboxImage: string | null;
  maxTextLength: number;
  toggleLightbox: (url?: string) => void;
}): React.ReactNode {
  return (
    <>
      <img
        src={imgSrc}
        alt={alt}
        style={{
          maxWidth: '100%',
          maxHeight: '200px',
          height: 'auto',
          objectFit: 'contain',
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
      {originalImageText ? (
        <div className="mt-1.5 text-muted-foreground text-[0.8em]">
          <strong>Original (image text):</strong>{' '}
          <TruncatedText text={originalImageText} maxLength={maxTextLength} />
        </div>
      ) : null}
    </>
  );
}

function renderResultsTableCell({
  cell,
  row,
  headVars,
  injectVarName,
  shouldDrawColBorder,
  maxTextLength,
  lightboxOpen,
  lightboxImage,
  toggleLightbox,
}: {
  cell: Cell<EvaluateTableRow, unknown>;
  row: Row<EvaluateTableRow>;
  headVars: string[];
  injectVarName: string;
  shouldDrawColBorder: boolean;
  maxTextLength: number;
  lightboxOpen: boolean;
  lightboxImage: string | null;
  toggleLightbox: (url?: string) => void;
}): React.ReactNode {
  const columnId = String(cell.column.id);
  const isMetadataCol = isMetadataColumn(columnId);
  const renderedCellContent = flexRender(cell.column.columnDef.cell, cell.getContext());
  const value = cell.getValue();
  const renderedImgSrc =
    typeof renderedCellContent === 'string' ? resolveImageSource(renderedCellContent) : undefined;
  const rawImgSrc = getImageSourceForCell({
    columnId,
    value,
    row,
    headVars,
    injectVarName,
  });
  const imgSrc = renderedImgSrc || rawImgSrc;
  const cellContent = imgSrc
    ? renderImageCellContent({
        imgSrc,
        originalImageText: getOriginalImageText({
          columnId,
          row,
          headVars,
          injectVarName,
        }),
        lightboxOpen,
        lightboxImage,
        maxTextLength,
        toggleLightbox,
      })
    : renderedCellContent;

  return (
    <td
      tabIndex={0}
      key={cell.id}
      style={{
        width: cell.column.getSize(),
      }}
      className={cn(
        isMetadataCol && 'variable',
        shouldDrawColBorder ? 'first-prompt-col' : 'second-prompt-column',
      )}
    >
      {cellContent}
    </td>
  );
}

function ResultsTableBodyRow({
  row,
  pageSize,
  headVars,
  injectVarName,
  maxTextLength,
  lightboxOpen,
  lightboxImage,
  toggleLightbox,
}: {
  row: Row<EvaluateTableRow>;
  pageSize: number;
  headVars: string[];
  injectVarName: string;
  maxTextLength: number;
  lightboxOpen: boolean;
  lightboxImage: string | null;
  toggleLightbox: (url?: string) => void;
}) {
  let colBorderDrawn = false;

  return (
    <tr id={`row-${row.index % pageSize}`}>
      {row.getVisibleCells().map((cell) => {
        const shouldDrawColBorder = !isMetadataColumn(String(cell.column.id)) && !colBorderDrawn;
        if (shouldDrawColBorder) {
          colBorderDrawn = true;
        }

        return renderResultsTableCell({
          cell,
          row,
          headVars,
          injectVarName,
          shouldDrawColBorder,
          maxTextLength,
          lightboxOpen,
          lightboxImage,
          toggleLightbox,
        });
      })}
    </tr>
  );
}

interface ResultsTableProps {
  maxTextLength: number;
  columnVisibility: VisibilityState;
  wordBreak: 'break-word' | 'break-all';
  filterMode: EvalResultsFilterMode;
  failureFilter: { [key: string]: boolean };
  debouncedSearchText?: string;
  showStats: boolean;
  onFailureFilterToggle: (columnId: string, checked: boolean) => void;
  zoom: number;
}

interface ExtendedEvaluateTableOutput extends EvaluateTableOutput {
  originalRowIndex?: number;
  originalPromptIndex?: number;
}

interface ExtendedEvaluateTableRow extends EvaluateTableRow {
  outputs: ExtendedEvaluateTableOutput[];
}

function ResultsTableHeader({
  reactTable,
  tableWidth,
  maxTextLength,
  wordBreak,
  theadRef,
  stickyHeader,
  setStickyHeader,
  hasMinimalScrollRoom,
  zoom,
}: {
  reactTable: ReturnType<typeof useReactTable<EvaluateTableRow>>;
  tableWidth: number;
  maxTextLength: number;
  wordBreak: 'break-word' | 'break-all';
  theadRef: React.RefObject<HTMLTableSectionElement | null>;
  stickyHeader: boolean;
  setStickyHeader: (sticky: boolean) => void;
  hasMinimalScrollRoom: boolean;
  zoom: number;
}) {
  return (
    <div
      data-testid="results-table-header"
      className={cn(
        'relative -mx-4 overflow-hidden px-4',
        stickyHeader && 'results-table-sticky',
        hasMinimalScrollRoom && 'minimal-scroll-room',
      )}
    >
      <div className="header-dismiss" style={{ display: stickyHeader ? undefined : 'none' }}>
        <button
          type="button"
          onClick={() => setStickyHeader(false)}
          aria-label="Dismiss sticky header"
          className="p-1.5 rounded hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
      <table
        className={`results-table firefox-fix ${maxTextLength <= 25 ? 'compact' : ''}`}
        style={{
          wordBreak,
          width: `${tableWidth}px`,
          zoom,
        }}
      >
        <thead ref={theadRef}>
          {reactTable.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="header">
              {headerGroup.headers.map((header) => {
                const isFinalRow = headerGroup.depth === 1;

                return (
                  <th
                    key={header.id}
                    tabIndex={0}
                    colSpan={header.colSpan}
                    style={{
                      width: header.getSize(),
                      borderBottom: 'none',
                      height: isFinalRow ? 'fit-content' : 'auto',
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
                );
              })}
            </tr>
          ))}
        </thead>
      </table>
    </div>
  );
}

function ResultsTable({
  maxTextLength,
  columnVisibility,
  wordBreak,
  filterMode,
  failureFilter,
  debouncedSearchText,
  showStats,
  onFailureFilterToggle,
  zoom,
}: ResultsTableProps) {
  const {
    evalId,
    table,
    setTable,
    config,
    version,
    filteredResultsCount,
    fetchEvalData,
    isFetching,
    filters,
  } = useTableStore();
  const { inComparisonMode, comparisonEvalIds } = useResultsViewSettingsStore();
  const { setFilterMode } = useFilterMode();

  const { showToast } = useToast();
  const navigate = useNavigate();

  invariant(table, 'Table should be defined');
  const { head, body } = table;

  const isRedteam = React.useMemo(() => {
    return config?.redteam !== undefined;
  }, [config?.redteam]);

  const visiblePromptCount = React.useMemo(
    () => head.prompts.filter((_, idx) => columnVisibility[`Prompt ${idx + 1}`] !== false).length,
    [head.prompts, columnVisibility],
  );

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImage, setLightboxImage] = React.useState<string | null>(null);
  const [pagination, setPagination] = React.useState<{ pageIndex: number; pageSize: number }>({
    pageIndex: 0,
    pageSize: filteredResultsCount > 10 ? 50 : 10,
  });

  // Persist column sizing state to prevent header resize flicker during pagination.
  // Without this, column widths reset when columns memo recalculates (due to deps like passRates changing).
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});

  /**
   * Reset the pagination state when the filtered results count changes.
   */
  React.useEffect(() => {
    setPagination({
      pageIndex: 0,
      pageSize: filteredResultsCount > 10 ? 50 : 10,
    });
  }, [filteredResultsCount]);

  const toggleLightbox = (url?: string) => {
    setLightboxImage(url || null);
    setLightboxOpen(!lightboxOpen);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const handleRating = React.useCallback(
    async (
      rowIndex: number,
      promptIndex: number,
      resultId: string,
      isPass?: boolean | null,
      score?: number,
      comment?: string,
    ) => {
      const existingOutput = body[rowIndex].outputs[promptIndex];
      const ratingUpdate = getManualRatingUpdate({
        existingOutput,
        isPass,
        score,
        comment,
      });
      const gradingResult = buildManualGradingResult({
        existingOutput,
        ratingUpdate,
        isPass,
        score,
        comment,
      });
      const newTable = buildRatingTableUpdate({
        head,
        body,
        rowIndex,
        promptIndex,
        ratingUpdate,
        gradingResult,
      });

      setTable(newTable);
      if (inComparisonMode) {
        showToast('Ratings are not saved in comparison mode', 'warning');
      } else {
        try {
          await saveManualRating({
            evalId,
            resultId,
            version,
            gradingResult,
            table: newTable,
          });
        } catch (error) {
          console.error('Failed to update table:', error);
        }
      }
    },
    [body, head, setTable, evalId, inComparisonMode, showToast],
  );

  const tableBody = React.useMemo(() => {
    return body.map((row, rowIndex) => ({
      ...row,
      outputs: row.outputs.map((output, promptIndex) =>
        output == null
          ? null
          : {
              ...output,
              originalRowIndex: rowIndex,
              originalPromptIndex: promptIndex,
            },
      ),
    })) as ExtendedEvaluateTableRow[];
  }, [body]);

  const parseQueryParams = (queryString: string) => {
    return Object.fromEntries(new URLSearchParams(queryString));
  };

  // Create a stable reference for applied filters to avoid unnecessary re-renders
  const appliedFiltersString = React.useMemo(() => {
    const appliedFilters = Object.values(filters.values)
      .filter((filter) => {
        // For metadata filters with exists operator, only field is required
        if (filter.type === 'metadata' && filter.operator === 'exists') {
          return Boolean(filter.field);
        }
        // For other metadata operators, both field and value are required
        if (filter.type === 'metadata') {
          return Boolean(filter.value && filter.field);
        }
        // For metric filters with is_defined operator, only field is required
        if (filter.type === 'metric' && filter.operator === 'is_defined') {
          return Boolean(filter.field);
        }
        // For metric filters with comparison operators, both field and value are required
        if (filter.type === 'metric') {
          return Boolean(filter.value && filter.field);
        }
        // For non-metadata/non-metric filters, value is required
        return Boolean(filter.value);
      })
      .sort((a, b) => a.sortIndex - b.sortIndex); // Sort by sortIndex for stability
    // Create a stable string representation of applied filters
    return JSON.stringify(
      appliedFilters.map((f) => ({
        type: f.type,
        operator: f.operator,
        value: f.value,
        field: f.field,
        logicOperator: f.logicOperator,
        sortIndex: f.sortIndex, // Include sortIndex for complete representation
      })),
    );
  }, [filters.values]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  React.useEffect(() => {
    // Use functional update to avoid stale closure over pagination state
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [failureFilter, filterMode, debouncedSearchText, appliedFiltersString]);

  // Add a ref to track the current evalId to compare with new values
  const previousEvalIdRef = useRef<string | null>(null);

  // Reset pagination when evalId changes. Do not mark previousEvalIdRef here to
  // allow the fetch effect to skip the first fetch after an eval switch.
  React.useEffect(() => {
    if (evalId !== previousEvalIdRef.current) {
      // Use functional update to avoid stale closure over pagination state
      setPagination((prev) => ({ pageIndex: 0, pageSize: prev.pageSize }));

      // Don't fetch here - the parent component (Eval.tsx) is responsible
      // for the initial data load when changing evalId
    }
  }, [evalId]);

  // Only fetch data when pagination or filters change, but not when evalId changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  React.useEffect(() => {
    if (!evalId) {
      return;
    }

    // Skip fetching if this is the first render for a new evalId
    // Data should already be loaded by Eval.tsx
    if (pagination.pageIndex === 0 && evalId !== previousEvalIdRef.current) {
      previousEvalIdRef.current = evalId;
      return;
    }

    fetchEvalData(evalId, {
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      filterMode,
      searchText: debouncedSearchText,
      // Only pass the filters that have been applied.
      // For metadata filters with exists operator, only field is required.
      // For other metadata operators, both field and value are required.
      // For metric filters with is_defined operator, only field is required.
      // For metric filters with comparison operators, both field and value are required.
      // For non-metadata/non-metric filters, value is required.
      filters: Object.values(filters.values).filter((filter) => {
        if (filter.type === 'metadata' && filter.operator === 'exists') {
          return Boolean(filter.field);
        }
        if (filter.type === 'metadata') {
          return Boolean(filter.value && filter.field);
        }
        if (filter.type === 'metric' && filter.operator === 'is_defined') {
          return Boolean(filter.field);
        }
        if (filter.type === 'metric') {
          return Boolean(filter.value && filter.field);
        }
        return Boolean(filter.value);
      }),
      skipSettingEvalId: true, // Don't change evalId when paginating or filtering
    });
  }, [
    // evalId is NOT in the dependency array
    pagination.pageIndex,
    pagination.pageSize,
    filterMode,
    comparisonEvalIds,
    debouncedSearchText,
    fetchEvalData,
    appliedFiltersString, // Use the stable string representation instead of filters.values
    // Removed filters.appliedCount since appliedFiltersString covers it
  ]);

  const testCounts = useTestCounts();
  const passingTestCounts = usePassingTestCounts();
  const passRates = usePassRates();
  const getMetrics = useMetricsGetter();

  const numAsserts = React.useMemo(
    () =>
      head.prompts.map((_, idx) => {
        const { total: metrics } = getMetrics(idx);
        return (metrics?.assertFailCount ?? 0) + (metrics?.assertPassCount ?? 0);
      }),
    [head.prompts, getMetrics],
  );

  const numGoodAsserts = React.useMemo(
    () =>
      head.prompts.map((_, idx) => {
        const { total: metrics } = getMetrics(idx);
        return metrics?.assertPassCount || 0;
      }),
    [head.prompts, getMetrics],
  );

  const columnHelper = React.useMemo(() => createColumnHelper<EvaluateTableRow>(), []);

  const { renderMarkdown } = useResultsViewSettingsStore();
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const variableColumns = React.useMemo(() => {
    if (head.vars.length > 0) {
      const injectVarName = config?.redteam?.injectVar || 'prompt';

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
              cell: (info: CellContext<EvaluateTableRow, string>) =>
                renderVariableCell({
                  info,
                  varName,
                  injectVarName,
                  maxTextLength,
                  renderMarkdown,
                  lightboxOpen,
                  lightboxImage,
                  toggleLightbox,
                }),
              size: VARIABLE_COLUMN_SIZE_PX,
            }),
          ),
        }),
      ];
    }
    return [];
  }, [
    columnHelper,
    head,
    head.vars,
    maxTextLength,
    renderMarkdown,
    lightboxOpen,
    lightboxImage,
    config,
  ]);

  // Extract transformDisplayVars from output metadata (used by per-turn layer transforms like indirect-web-pwn)
  const transformDisplayVarsColumns = React.useMemo(() => {
    // Collect unique transformDisplayVars keys from all outputs
    const transformVarKeys = new Set<string>();
    tableBody.forEach((row) => {
      row.outputs?.forEach((output) => {
        const transformVars = output?.metadata?.transformDisplayVars as
          | Record<string, string>
          | undefined;
        if (transformVars) {
          Object.keys(transformVars).forEach((key) => transformVarKeys.add(key));
        }
      });
    });

    if (transformVarKeys.size === 0) {
      return [];
    }

    // Filter out keys that already exist in head.vars to avoid duplicate columns
    // This handles the case where standalone mode has embeddedInjection in vars
    // and layer mode has it in transformDisplayVars - we want one unified column
    const existingVarNames = new Set(head.vars);
    const varKeyArray = Array.from(transformVarKeys).filter((key) => !existingVarNames.has(key));

    // If all keys were filtered out (they all exist in vars), don't create a duplicate column group
    if (varKeyArray.length === 0) {
      return [];
    }

    return [
      columnHelper.group({
        id: 'transformDisplayVars',
        header: () => <span className="font-bold">Variables</span>,
        columns: varKeyArray.map((varName) =>
          columnHelper.accessor(
            (row: EvaluateTableRow) => {
              // Get the value from the first output's transformDisplayVars
              const output = row.outputs?.[0];
              const transformVars = output?.metadata?.transformDisplayVars as
                | Record<string, string>
                | undefined;
              return transformVars?.[varName] || '';
            },
            {
              id: `TransformVar_${varName}`,
              header: () => (
                <TableHeader
                  text={varName.replace(/^__/, '')} // Remove __ prefix for display
                  maxLength={maxTextLength}
                  className="font-bold"
                />
              ),
              cell: (info: CellContext<EvaluateTableRow, string>) => {
                const value = info.getValue();
                return (
                  <div className="cell">
                    <TruncatedText text={value} maxLength={maxTextLength} />
                  </div>
                );
              },
              size: VARIABLE_COLUMN_SIZE_PX,
            },
          ),
        ),
      }),
    ];
  }, [columnHelper, tableBody, maxTextLength, head.vars]);

  const getOutput = React.useCallback(
    (rowIndex: number, promptIndex: number) => {
      return tableBody[rowIndex].outputs[promptIndex];
    },
    [tableBody],
  );

  const getFirstOutput = React.useCallback(
    (rowIndex: number) => {
      return tableBody[rowIndex].outputs[0];
    },
    [tableBody],
  );

  const metricTotals = React.useMemo(() => {
    // Use the backend's already-correct metric totals instead of recalculating
    const firstProvider = table?.head?.prompts?.[0];
    const backendTotals = getNamedMetricTotals(firstProvider?.metrics);

    if (backendTotals) {
      return backendTotals;
    }

    const totals: Record<string, number> = {};
    table?.body.forEach((row) => {
      row.test.assert?.forEach((assertion) => {
        if (assertion.metric) {
          totals[assertion.metric] = (totals[assertion.metric] || 0) + (assertion.weight ?? 1);
        }
        if ('assert' in assertion && Array.isArray(assertion.assert)) {
          assertion.assert.forEach((subAssertion) => {
            if ('metric' in subAssertion && subAssertion.metric) {
              totals[subAssertion.metric] =
                (totals[subAssertion.metric] || 0) + (subAssertion.weight ?? 1);
            }
          });
        }
      });
    });
    return totals;
  }, [table?.head?.prompts, table?.body]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const promptColumns = React.useMemo(() => {
    return [
      columnHelper.group({
        id: 'prompts',
        header: () => <span className="font-bold">Outputs</span>,
        columns: head.prompts.map((prompt, idx) =>
          columnHelper.accessor((row: EvaluateTableRow) => formatRowOutput(row.outputs[idx]), {
            id: `Prompt ${idx + 1}`,
            header: () => (
              <PromptColumnHeader
                prompt={prompt}
                idx={idx}
                passRates={passRates}
                failureFilter={failureFilter}
                getMetrics={getMetrics}
                showStats={showStats}
                isRedteam={isRedteam}
                numAsserts={numAsserts}
                numGoodAsserts={numGoodAsserts}
                testCounts={testCounts}
                passingTestCounts={passingTestCounts}
                metricTotals={metricTotals}
                config={config}
                filterMode={filterMode}
                headPromptCount={head.prompts.length}
                maxTextLength={maxTextLength}
                onFailureFilterToggle={onFailureFilterToggle}
                setFilterMode={setFilterMode}
                setCustomMetricsDialogOpen={setCustomMetricsDialogOpen}
              />
            ),
            cell: (info: CellContext<EvaluateTableRow, EvaluateTableOutput>) => {
              const output = getOutput(info.row.index, idx);
              return output ? (
                <ErrorBoundary
                  name={`EvalOutputCell-${info.row.index}-${idx}`}
                  fallback={
                    <div style={{ padding: '20px', color: 'red', fontSize: '12px' }}>
                      Error loading cell
                    </div>
                  }
                >
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
                    showDiffs={filterMode === 'different' && visiblePromptCount > 1}
                    searchText={debouncedSearchText}
                    showStats={showStats}
                    evaluationId={evalId || undefined}
                    testCaseId={info.row.original.test?.metadata?.testCaseId || output.id}
                  />
                </ErrorBoundary>
              ) : (
                <div className="cell" aria-label="No output for this prompt" />
              );
            },
            size: PROMPT_COLUMN_SIZE_PX,
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
    getMetrics,
    getOutput,
    handleRating,
    head,
    head.prompts,
    maxTextLength,
    metricTotals,
    numAsserts,
    numGoodAsserts,
    onFailureFilterToggle,
    debouncedSearchText,
    showStats,
    filters.appliedCount,
    passRates,
    passingTestCounts,
    testCounts,
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
        size: DESCRIPTION_COLUMN_SIZE_PX,
      };
    }
    return null;
  }, [body, maxTextLength]);

  const columns = React.useMemo(() => {
    const cols: ColumnDef<EvaluateTableRow, unknown>[] = [];
    if (descriptionColumn) {
      cols.push(descriptionColumn);
    }
    cols.push(...variableColumns, ...transformDisplayVarsColumns, ...promptColumns);
    return cols;
  }, [descriptionColumn, variableColumns, transformDisplayVarsColumns, promptColumns]);

  const pageCount = Math.ceil(filteredResultsCount / pagination.pageSize);

  const reactTable = useReactTable({
    data: tableBody,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: {
      columnVisibility,
      columnSizing,
      pagination,
    },
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: true,
  });

  const { stickyHeader, setStickyHeader } = useResultsViewSettingsStore();

  const clearRowIdFromUrl = React.useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('rowId')) {
      url.searchParams.delete('rowId');
      navigate({ pathname: url.pathname, search: url.search }, { replace: true });
    }
  }, [navigate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const params = parseQueryParams(window.location.search);
    const rowId = params['rowId'];

    if (rowId && Number.isInteger(Number(rowId))) {
      const parsedRowId = Number(rowId);
      const rowIndex = Math.max(0, Math.min(parsedRowId - 1, filteredResultsCount - 1));

      let hasScrolled = false;

      const rowPageIndex = Math.floor(rowIndex / pagination.pageSize);

      const maxPageIndex = pageCount - 1;
      const safeRowPageIndex = Math.min(rowPageIndex, maxPageIndex);

      if (pagination.pageIndex !== safeRowPageIndex) {
        setPagination((prev) => ({
          ...prev,
          pageIndex: safeRowPageIndex,
        }));
      }

      const scrollToRow = () => {
        if (hasScrolled) {
          return;
        }

        const localRowIndex = rowIndex % pagination.pageSize;
        const rowElement = document.querySelector(`#row-${localRowIndex}`);

        if (rowElement) {
          hasScrolled = true;

          requestAnimationFrame(() => {
            rowElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
            });
          });
        }
      };

      const tableContainer =
        document.querySelector('.results-table')?.parentElement || document.body;

      const observer = new MutationObserver(() => {
        if (hasScrolled) {
          observer.disconnect();
          return;
        }

        const localRowIndex = rowIndex % pagination.pageSize;
        const rowElement = document.querySelector(`#row-${localRowIndex}`);
        if (rowElement) {
          scrollToRow();
          observer.disconnect();
        }
      });

      observer.observe(tableContainer, {
        childList: true,
        subtree: true,
      });

      const timeoutId = setTimeout(() => {
        if (!hasScrolled) {
          console.warn('Timeout reached while waiting for row to be rendered');
          observer.disconnect();
        }
      }, 5000);

      return () => {
        observer.disconnect();
        clearTimeout(timeoutId);
      };
    }
  }, [pagination.pageIndex, pagination.pageSize, reactTable, filteredResultsCount]);

  // Use TanStack Table's built-in method to calculate total width of visible columns.
  // This automatically handles both column visibility changes and user-initiated column resizing.
  const tableWidth = reactTable.getTotalSize();

  // Listen for scroll events on the table container and sync the header horizontally
  const tableRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);

  // Detect if there's minimal scroll room - in this case, disable height collapse
  // to prevent jitter feedback loop (height change affects scroll position)
  const [hasMinimalScrollRoom, setHasMinimalScrollRoom] = React.useState(false);

  const checkScrollRoom = React.useCallback(() => {
    const scrollRoom = document.documentElement.scrollHeight - window.innerHeight;
    setHasMinimalScrollRoom(scrollRoom < 150);
  }, []);

  useEffect(() => {
    checkScrollRoom();
    window.addEventListener('resize', checkScrollRoom);
    // Re-check after initial render
    const timeoutId = setTimeout(checkScrollRoom, 100);

    return () => {
      window.removeEventListener('resize', checkScrollRoom);
      clearTimeout(timeoutId);
    };
  }, [checkScrollRoom]);

  // Re-check scroll room when content changes (filtered results count affects page height)
  // biome-ignore lint/correctness/useExhaustiveDependencies: filteredResultsCount is intentionally used as a trigger to re-check scroll room when the number of rows changes
  useEffect(() => {
    checkScrollRoom();
  }, [filteredResultsCount, checkScrollRoom]);

  useEffect(() => {
    if (!tableRef.current || !theadRef.current) {
      return;
    }

    const container = tableRef.current;
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        if (theadRef.current) {
          const xScroll = container.scrollLeft;
          theadRef.current.style.transform = `translateX(-${xScroll}px)`;
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    // Initial sync
    handleScroll();
    // Keep in sync on resize
    window.addEventListener('resize', handleScroll);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const [customMetricsDialogOpen, setCustomMetricsDialogOpen] = React.useState(false);

  return (
    // NOTE: It's important that the JSX Fragment is the top-level element within the DOM tree
    // of this component. This ensures that the pagination footer is always pinned to the bottom
    // of the viewport (because the parent container is a flexbox).
    <>
      {filteredResultsCount === 0 &&
        !isFetching &&
        (debouncedSearchText || filterMode !== 'all' || filters.appliedCount > 0) && (
          <div className="p-5 text-center bg-black/[0.03] dark:bg-white/[0.03] rounded my-5">
            <p>No results found for the current filters.</p>
          </div>
        )}
      <div className="h-4" />
      <ResultsTableHeader
        reactTable={reactTable}
        tableWidth={tableWidth}
        maxTextLength={maxTextLength}
        wordBreak={wordBreak}
        theadRef={theadRef}
        stickyHeader={stickyHeader}
        setStickyHeader={setStickyHeader}
        hasMinimalScrollRoom={hasMinimalScrollRoom}
        zoom={zoom}
      />
      <div
        id="results-table-container"
        style={{
          zoom,
          borderTop: 'none',
          // Grow vertically into any empty space; this applies when total number of evals is so few that the table otherwise
          // won't extend to the bottom of the viewport.
          flexGrow: 1,
          minHeight: 0,
          position: 'relative',
        }}
        ref={tableRef}
      >
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-background/70 z-20 transition-opacity duration-300 backdrop-blur-[2px]',
            isFetching ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
          )}
        >
          <Spinner className="size-[60px]" />
        </div>
        <table
          className={`results-table firefox-fix ${maxTextLength <= 25 ? 'compact' : ''}`}
          style={{
            wordBreak,
            width: `${tableWidth}px`,
          }}
        >
          <tbody>
            {reactTable.getRowModel().rows.map((row) => (
              <ResultsTableBodyRow
                key={row.id}
                row={row}
                pageSize={pagination.pageSize}
                headVars={head.vars}
                injectVarName={config?.redteam?.injectVar || 'prompt'}
                maxTextLength={maxTextLength}
                lightboxOpen={lightboxOpen}
                lightboxImage={lightboxImage}
                toggleLightbox={toggleLightbox}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination sticky bottom-0 z-10 flex w-screen shrink-0 flex-col items-stretch gap-3 border-t border-border bg-background px-4 py-2 shadow-lg -mx-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div>
          Showing{' '}
          {filteredResultsCount === 0 ? (
            <span className="font-semibold">0</span>
          ) : (
            <>
              <span className="font-semibold">
                {pagination.pageIndex * pagination.pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold">
                {Math.min((pagination.pageIndex + 1) * pagination.pageSize, filteredResultsCount)}
              </span>{' '}
              of <span className="font-semibold">{filteredResultsCount}</span>
            </>
          )}{' '}
          results
        </div>

        {filteredResultsCount > 0 && (
          <div>
            Page{' '}
            <span className="font-semibold">{reactTable.getState().pagination.pageIndex + 1}</span>{' '}
            of <span className="font-semibold">{pageCount}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* PAGE SIZE SELECTOR */}
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">Results per page:</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) => {
                setPagination((prev) => ({
                  ...prev,
                  pageSize: Number(value),
                }));
                window.scrollTo(0, 0);
              }}
              disabled={filteredResultsCount <= 10}
            >
              <SelectTrigger aria-label="Results per page" className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="50" disabled={filteredResultsCount <= 10}>
                  50
                </SelectItem>
                <SelectItem value="100" disabled={filteredResultsCount <= 50}>
                  100
                </SelectItem>
                <SelectItem value="500" disabled={filteredResultsCount <= 100}>
                  500
                </SelectItem>
                <SelectItem value="1000" disabled={filteredResultsCount <= 500}>
                  1000
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* PAGE NAVIGATOR */}
          <div
            className={cn(
              'flex items-center gap-2',
              pageCount <= 1 && 'opacity-50 pointer-events-none',
            )}
          >
            <span className="whitespace-nowrap">Go to:</span>
            <NumberInput
              value={pagination.pageIndex + 1}
              onChange={(v) => {
                const page = v === undefined ? null : v - 1;
                if (page !== null && page >= 0 && page < pageCount) {
                  setPagination((prev) => ({
                    ...prev,
                    pageIndex: Math.min(Math.max(page, 0), pageCount - 1),
                  }));
                  clearRowIdFromUrl();
                }
              }}
              className="w-[60px] h-8 text-center"
              aria-label="Go to page"
              min={1}
              max={pageCount || 1}
              disabled={pageCount === 1}
            />
          </div>

          {/* PAGE NAVIGATION BUTTONS */}
          <div className="flex">
            <Button
              variant="outline"
              size="icon"
              className="rounded-r-none"
              aria-label="Previous page"
              onClick={() => {
                setPagination((prev) => ({
                  ...prev,
                  pageIndex: Math.max(prev.pageIndex - 1, 0),
                }));
                clearRowIdFromUrl();
                window.scrollTo(0, 0);
              }}
              disabled={reactTable.getState().pagination.pageIndex === 0}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-l-none -ml-px"
              aria-label="Next page"
              onClick={() => {
                setPagination((prev) => ({
                  ...prev,
                  pageIndex: Math.min(prev.pageIndex + 1, pageCount - 1),
                }));
                clearRowIdFromUrl();
                window.scrollTo(0, 0);
              }}
              disabled={reactTable.getState().pagination.pageIndex + 1 >= pageCount}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
      <CustomMetricsDialog
        open={customMetricsDialogOpen}
        onClose={() => setCustomMetricsDialogOpen(false)}
      />
    </>
  );
}

export default React.memo(ResultsTable);
