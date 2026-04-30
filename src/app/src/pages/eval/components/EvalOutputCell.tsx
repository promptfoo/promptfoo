import React, { useCallback, useId, useMemo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import useCloudConfig from '@app/hooks/useCloudConfig';
import { useEvalOperations } from '@app/hooks/useEvalOperations';
import { useShiftKey } from '@app/hooks/useShiftKey';
import {
  normalizeMediaText,
  resolveAudioSource,
  resolveImageSource,
  resolveVideoSource,
} from '@app/utils/media';
import { getActualPrompt } from '@app/utils/providerResponse';
import {
  type EvaluateTableOutput,
  type GradingResult,
  type ImageOutput,
  ResultFailureReason,
} from '@promptfoo/types';
import { diffJson, diffSentences, diffWords } from 'diff';
import {
  Check,
  ClipboardCopy,
  Hash,
  Link,
  Pencil,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import logger from '../../../../../logger';
import CustomMetrics from './CustomMetrics';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import { stringifyAssertionValue } from './EvaluationPanel';
import FailReasonCarousel from './FailReasonCarousel';
import { IDENTITY_URL_TRANSFORM, REMARK_PLUGINS } from './markdown-config';
import SetScoreDialog from './SetScoreDialog';
import { useResultsViewSettingsStore, useTableStore } from './store';
import CommentDialog from './TableCommentDialog';
import TruncatedText from './TruncatedText';
import { getHumanRating } from './utils';

type CSSPropertiesWithCustomVars = React.CSSProperties & {
  [key: `--${string}`]: string | number;
};

function scoreToString(score: number | null | undefined) {
  if (typeof score !== 'number' || score === 0 || score === 1) {
    // Don't show boolean scores.
    return '';
  }
  return `(${score.toFixed(2)})`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringifyOutputText(text: unknown): string {
  if (typeof text === 'string') {
    return text;
  }

  if (text == null) {
    return '';
  }

  return JSON.stringify(text) ?? String(text);
}

/**
 * Detects if the provider is an image generation provider.
 * Image providers follow patterns like:
 * - 'openai:image:dall-e-3' (OpenAI DALL-E)
 * - 'google:image:imagen-3.0' (Google Imagen)
 * - 'google:gemini-2.5-flash-image' (Gemini native image generation)
 * Used to skip truncation for image content since truncating `![alt](url)` breaks rendering.
 */
export function isImageProvider(provider: string | undefined): boolean {
  if (!provider) {
    return false;
  }
  // Check for :image: namespace (OpenAI DALL-E, Google Imagen)
  if (provider.includes(':image:')) {
    return true;
  }
  // Check for Gemini native image models (e.g., google:gemini-2.5-flash-image)
  if (provider.startsWith('google:') && provider.includes('-image')) {
    return true;
  }
  return false;
}

/**
 * Detects if the provider is a video generation provider.
 * Video providers follow patterns like:
 * - 'openai:video:sora-2' (OpenAI Sora)
 * - 'openai:video:sora-2-pro' (OpenAI Sora Pro)
 * - 'google:video:veo-3.1-generate-preview' (Google Veo)
 * - 'google:video:veo-2-generate' (Google Veo 2)
 * Used to skip truncation for video content.
 */
export function isVideoProvider(provider: string | undefined): boolean {
  if (!provider) {
    return false;
  }
  // Check for :video: namespace (OpenAI Sora, Google Veo)
  return provider.includes(':video:');
}

function getImageDataUriComparisonKey(src: string): string | undefined {
  const trimmed = src.trim();
  if (!trimmed.toLowerCase().startsWith('data:')) {
    return undefined;
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1) {
    return undefined;
  }

  const metadata = trimmed.slice('data:'.length, commaIndex);
  const payload = trimmed.slice(commaIndex + 1);
  const [mimeType = '', ...params] = metadata.split(';').filter(Boolean);
  const normalizedMimeType = mimeType.toLowerCase();
  const hasBase64Param = params.some((param) => param.toLowerCase() === 'base64');

  if (
    hasBase64Param &&
    (normalizedMimeType.startsWith('image/') || normalizedMimeType === 'application/octet-stream')
  ) {
    return `data:image-content;base64,${payload.replace(/\s+/g, '')}`;
  }

  return undefined;
}

export function normalizeImageSrcForComparison(src: string): string {
  const normalized = normalizeMediaText(src.trim());
  return resolveImageSource(normalized) || normalized;
}

function getImageSrcComparisonKeys(src: string): string[] {
  const normalized = normalizeImageSrcForComparison(src);
  const dataUriKey = getImageDataUriComparisonKey(normalized);
  return dataUriKey && dataUriKey !== normalized ? [normalized, dataUriKey] : [normalized];
}

function addImageSrcComparisonKeys(keys: Set<string>, src: string) {
  for (const key of getImageSrcComparisonKeys(src)) {
    keys.add(key);
  }
}

function hasImageSrcComparisonKey(keys: Set<string>, src: string): boolean {
  return getImageSrcComparisonKeys(src).some((key) => keys.has(key));
}

export function extractMarkdownImageSources(markdown: string): string[] {
  const sources = new Set<string>();

  const markdownImageRegex = /!\[[^\]]*]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlImageRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;

  for (const match of markdown.matchAll(markdownImageRegex)) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }
    const unwrapped =
      candidate.startsWith('<') && candidate.endsWith('>') ? candidate.slice(1, -1) : candidate;
    sources.add(normalizeImageSrcForComparison(unwrapped));
  }

  for (const match of markdown.matchAll(htmlImageRegex)) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }
    sources.add(normalizeImageSrcForComparison(candidate));
  }

  return [...sources];
}

export function resolveEvalImageOutputSource(image: ImageOutput): string | undefined {
  if (typeof image.data === 'string' && /^https?:\/\//.test(image.data)) {
    return image.data;
  }

  return resolveImageSource(image);
}

function isImageLikeDataUri(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('data:')) {
    return false;
  }

  const mimeType = trimmed.slice('data:'.length).split(/[;,]/, 1)[0]?.toLowerCase();
  return Boolean(
    mimeType && (mimeType.startsWith('image/') || mimeType === 'application/octet-stream'),
  );
}

function getPrimaryRenderedImageSrc(text: string, inlineImageSrc?: string): string | undefined {
  const trimmed = text.trim();

  if (trimmed.startsWith('<svg')) {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }

  if (isImageLikeDataUri(text)) {
    return inlineImageSrc || text;
  }

  if (inlineImageSrc && !trimmed.startsWith('data:')) {
    return inlineImageSrc;
  }

  return undefined;
}

function getFailAndPassReasons(output: EvaluateTableOutput): {
  failReasons: string[];
  passReasons: string[];
} {
  const failReasons =
    output.gradingResult?.componentResults
      ?.filter((result) => (result ? !result.pass : false))
      .map((result) => result.reason)
      .filter((reason) => reason) ?? [];

  const passReasons =
    output.gradingResult?.componentResults
      ?.filter((result) => (result ? result.pass : false))
      .map((result) => result.reason)
      .filter((reason) => reason) ?? [];

  if (output.error && output.failureReason === ResultFailureReason.ERROR) {
    return {
      failReasons: [output.error, ...failReasons],
      passReasons,
    };
  }

  return { failReasons, passReasons };
}

function renderDiffNode(firstOutputText: string, text: string): React.ReactNode {
  let diffResult;
  try {
    JSON.parse(firstOutputText);
    JSON.parse(text);
    diffResult = diffJson(firstOutputText, text);
  } catch {
    diffResult =
      firstOutputText.includes('. ') && text.includes('. ')
        ? diffSentences(firstOutputText, text)
        : diffWords(firstOutputText, text);
  }

  return diffResult.map(
    (part: { added?: boolean; removed?: boolean; value: string }, index: number) =>
      part.added ? (
        <ins key={index}>{part.value}</ins>
      ) : part.removed ? (
        <del key={index}>{part.value}</del>
      ) : (
        <span key={index}>{part.value}</span>
      ),
  );
}

function renderHighlightedTextNode(text: string, searchText: string): React.ReactNode {
  try {
    const regex = new RegExp(searchText, 'gi');
    const matches: { start: number; end: number }[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (regex.lastIndex === match.index) {
        regex.lastIndex += 1;
        continue;
      }
      matches.push({
        start: match.index,
        end: regex.lastIndex,
      });
    }

    if (matches.length === 0) {
      return <span key="no-match">{text}</span>;
    }

    return (
      <>
        <span key="text-before">{text?.substring(0, matches[0].start)}</span>
        {matches.map((range, index) => {
          const matchText = text?.substring(range.start, range.end);
          const afterText = text?.substring(
            range.end,
            matches[index + 1] ? matches[index + 1].start : text?.length,
          );
          return (
            <React.Fragment key={`fragment-${index}`}>
              <span className="search-highlight" key={`match-${index}`}>
                {matchText}
              </span>
              <span key={`text-after-${index}`}>{afterText}</span>
            </React.Fragment>
          );
        })}
      </>
    );
  } catch (error) {
    logger.warn('[EvalOutputCell] Invalid search regex', {
      searchText,
      error: getErrorMessage(error),
    });
    return undefined;
  }
}

function renderMediaNode({
  output,
  outputAudioSource,
  primaryRenderedImageSrc,
  toggleLightbox,
}: {
  output: EvaluateTableOutput;
  outputAudioSource: ReturnType<typeof resolveAudioSource>;
  primaryRenderedImageSrc?: string;
  toggleLightbox: (url?: string) => void;
}): React.ReactNode | undefined {
  if (primaryRenderedImageSrc) {
    return (
      <img
        src={primaryRenderedImageSrc}
        alt={output.prompt}
        style={{ width: '100%' }}
        onClick={() => toggleLightbox(primaryRenderedImageSrc)}
      />
    );
  }

  if (output.audio) {
    if (outputAudioSource) {
      return (
        <div className="audio-output">
          <audio controls style={{ width: '100%' }} data-testid="audio-player">
            <source src={outputAudioSource.src} type={outputAudioSource.type || 'audio/mpeg'} />
            Your browser does not support the audio element.
          </audio>
          {output.audio.transcript && (
            <div className="transcript">
              <strong>Transcript:</strong> {output.audio.transcript}
            </div>
          )}
        </div>
      );
    }

    if (output.audio.transcript) {
      return (
        <div className="transcript">
          <strong>Transcript:</strong> {output.audio.transcript}
        </div>
      );
    }
  }

  if (output.video || output.response?.video) {
    const videoData = output.video || output.response?.video;
    const videoSource = resolveVideoSource(videoData);
    if (videoSource) {
      return (
        <div className="video-output">
          <video
            controls
            style={{ width: '100%', maxWidth: '640px', borderRadius: '4px' }}
            poster={videoSource.poster}
            data-testid="video-player"
          >
            <source src={videoSource.src} type={videoSource.type || 'video/mp4'} />
            Your browser does not support the video element.
          </video>
          <div
            className="video-metadata"
            style={{ marginTop: '8px', fontSize: '0.85em', opacity: 0.8 }}
          >
            {videoData?.model && (
              <span style={{ marginRight: '12px' }}>Model: {videoData.model}</span>
            )}
            {videoData?.size && <span style={{ marginRight: '12px' }}>Size: {videoData.size}</span>}
            {videoData?.duration && <span>Duration: {videoData.duration}s</span>}
          </div>
        </div>
      );
    }
  }

  return undefined;
}

function renderMarkdownOrJsonNode({
  text,
  normalizedText,
  renderMarkdown,
  prettifyJson,
  markdownComponents,
}: {
  text: string;
  normalizedText: string;
  renderMarkdown: boolean;
  prettifyJson: boolean;
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
}): { node?: React.ReactNode; renderedMarkdownOutput: boolean } {
  if (!prettifyJson && !renderMarkdown) {
    return { node: undefined, renderedMarkdownOutput: false };
  }

  if (prettifyJson) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          node: <pre>{JSON.stringify(parsed, null, 2)}</pre>,
          renderedMarkdownOutput: false,
        };
      }
    } catch {
      // Not valid JSON, continue to Markdown if enabled.
    }
  }

  if (!renderMarkdown) {
    return { node: undefined, renderedMarkdownOutput: false };
  }

  return {
    node: (
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={IDENTITY_URL_TRANSFORM}
        components={markdownComponents}
      >
        {normalizedText}
      </ReactMarkdown>
    ),
    renderedMarkdownOutput: true,
  };
}

function renderStructuredImages({
  node,
  output,
  normalizedText,
  primaryRenderedImageSrc,
  renderedMarkdownOutput,
  toggleLightbox,
}: {
  node?: React.ReactNode;
  output: EvaluateTableOutput;
  normalizedText: string;
  primaryRenderedImageSrc?: string;
  renderedMarkdownOutput: boolean;
  toggleLightbox: (url?: string) => void;
}): React.ReactNode | undefined {
  if (!output.images?.length) {
    return node;
  }

  const renderedImageSrcs = new Set<string>();
  if (primaryRenderedImageSrc) {
    addImageSrcComparisonKeys(renderedImageSrcs, primaryRenderedImageSrc);
  }
  if (renderedMarkdownOutput) {
    for (const source of extractMarkdownImageSources(normalizedText)) {
      addImageSrcComparisonKeys(renderedImageSrcs, source);
    }
  }

  const imageElements = output.images
    .map((img: ImageOutput, idx: number) => {
      const src = resolveEvalImageOutputSource(img);
      if (!src || hasImageSrcComparisonKey(renderedImageSrcs, src)) {
        return null;
      }
      addImageSrcComparisonKeys(renderedImageSrcs, src);
      return (
        <img
          key={`img-${idx}`}
          src={src}
          alt={output.prompt || 'Generated image'}
          loading="lazy"
          style={{ display: 'block', width: '100%', cursor: 'pointer' }}
          onClick={() => toggleLightbox(src)}
        />
      );
    })
    .filter((img): img is React.ReactElement => img !== null);

  if (imageElements.length === 0) {
    return node;
  }

  return node ? (
    <>
      {node}
      {imageElements}
    </>
  ) : (
    imageElements
  );
}

function renderOutputNode({
  output,
  firstOutput,
  showDiffs,
  searchText,
  shouldHighlightSearchText,
  text,
  normalizedText,
  renderMarkdown,
  prettifyJson,
  markdownComponents,
  toggleLightbox,
  outputAudioSource,
  primaryRenderedImageSrc,
}: {
  output: EvaluateTableOutput;
  firstOutput?: EvaluateTableOutput | null;
  showDiffs: boolean;
  searchText?: string;
  shouldHighlightSearchText: boolean;
  text: string;
  normalizedText: string;
  renderMarkdown: boolean;
  prettifyJson: boolean;
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
  toggleLightbox: (url?: string) => void;
  outputAudioSource: ReturnType<typeof resolveAudioSource>;
  primaryRenderedImageSrc?: string;
}): React.ReactNode | undefined {
  let node: React.ReactNode | undefined;
  let renderedMarkdownOutput = false;

  if (showDiffs && firstOutput) {
    const firstOutputText = stringifyOutputText(firstOutput.text);
    node = renderDiffNode(firstOutputText, text);
  }

  if (!node) {
    node =
      renderMediaNode({
        output,
        outputAudioSource,
        primaryRenderedImageSrc,
        toggleLightbox,
      }) || node;
  }

  if (!node) {
    const shouldPreserveFormattedRendering = extractMarkdownImageSources(normalizedText).length > 0;
    if (searchText && shouldHighlightSearchText && !shouldPreserveFormattedRendering) {
      node = renderHighlightedTextNode(text, searchText) ?? node;
    }
  }

  if (!node && !showDiffs) {
    const formattedNode = renderMarkdownOrJsonNode({
      text,
      normalizedText,
      renderMarkdown,
      prettifyJson,
      markdownComponents,
    });
    node = formattedNode.node;
    renderedMarkdownOutput = formattedNode.renderedMarkdownOutput;
  }

  return renderStructuredImages({
    node,
    output,
    normalizedText,
    primaryRenderedImageSrc,
    renderedMarkdownOutput,
    toggleLightbox,
  });
}

function getPassFailCounts(output: EvaluateTableOutput): {
  passCount: number;
  failCount: number;
  errorCount: number;
} {
  let passCount = 0;
  let failCount = 0;

  const componentResults = output.gradingResult?.componentResults;
  if (componentResults?.length) {
    componentResults.forEach((result) => {
      if (result?.pass) {
        passCount++;
      } else {
        failCount++;
      }
    });
  } else if (typeof output.gradingResult?.pass === 'boolean') {
    passCount = output.gradingResult.pass ? 1 : 0;
    failCount = output.gradingResult.pass ? 0 : 1;
  } else if (output.pass === true) {
    passCount = 1;
  } else if (output.pass === false) {
    failCount = 1;
  }

  return {
    passCount,
    failCount,
    errorCount: output.failureReason === ResultFailureReason.ERROR ? 1 : 0,
  };
}

function getDialogGradingResults(output: EvaluateTableOutput): GradingResult[] | undefined {
  const gradingResult = output.gradingResult;
  if (!gradingResult) {
    return undefined;
  }

  return gradingResult.componentResults?.length ? gradingResult.componentResults : [gradingResult];
}

function getPassFailText({
  passCount,
  failCount,
  errorCount,
}: {
  passCount: number;
  failCount: number;
  errorCount: number;
}): React.ReactNode {
  if (errorCount === 1) {
    return 'ERROR';
  }

  if (failCount === 1 && passCount === 1) {
    return (
      <>
        {`${failCount} FAIL`} {`${passCount} PASS`}
      </>
    );
  }

  const failText =
    failCount > 1 || (passCount > 1 && failCount > 0)
      ? `${failCount} FAIL`
      : failCount === 1
        ? 'FAIL'
        : '';
  const passText =
    passCount > 1 || (failCount > 1 && passCount > 0)
      ? `${passCount} PASS`
      : passCount === 1 && failCount === 0
        ? 'PASS'
        : '';
  const separator = failText && passText ? ' ' : '';

  return (
    <>
      {failText}
      {separator}
      {passText}
    </>
  );
}

function getCombinedContextText(output: EvaluateTableOutput): string {
  if (!output.gradingResult?.componentResults?.length) {
    return stringifyOutputText(output.text);
  }

  return output.gradingResult.componentResults
    .map((result, index) => {
      const displayName = result.assertion?.metric || result.assertion?.type || 'unknown';
      const rawValue = result.metadata?.renderedAssertionValue ?? result.assertion?.value;
      const value = rawValue === undefined ? '' : stringifyAssertionValue(rawValue);
      return `Assertion ${index + 1} (${displayName}): ${value}`;
    })
    .join('\n\n');
}

function getProviderOverrideBadge(output: EvaluateTableOutput): React.ReactNode {
  const testCaseProvider = output.testCase?.provider;
  const providerId =
    typeof testCaseProvider === 'string'
      ? testCaseProvider
      : typeof testCaseProvider === 'object' &&
          testCaseProvider !== null &&
          'id' in testCaseProvider &&
          typeof testCaseProvider.id === 'string'
        ? testCaseProvider.id
        : null;

  if (!providerId) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="provider pill">{providerId}</span>
      </TooltipTrigger>
      <TooltipContent side="top">Model override for this test</TooltipContent>
    </Tooltip>
  );
}

function getCommentTextToDisplay(comment?: string): string | undefined {
  return comment?.startsWith('!highlight') ? comment.slice('!highlight'.length).trim() : comment;
}

function formatTokenUsageDisplay(
  tokenUsage:
    | EvaluateTableOutput['tokenUsage']
    | NonNullable<EvaluateTableOutput['response']>['tokenUsage']
    | undefined,
): React.ReactNode | undefined {
  if (tokenUsage?.cached) {
    return (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokenUsage.cached ?? 0)}{' '}
        (cached)
      </span>
    );
  }

  if (!tokenUsage?.total) {
    return undefined;
  }

  const promptTokens = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    tokenUsage.prompt ?? 0,
  );
  const completionTokens = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    tokenUsage.completion ?? 0,
  );
  const totalTokens = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    tokenUsage.total ?? 0,
  );

  if (tokenUsage.completionDetails?.reasoning) {
    const reasoningTokens = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
      tokenUsage.completionDetails.reasoning ?? 0,
    );
    const tooltipText = `${promptTokens} prompt tokens + ${completionTokens} completion tokens & ${reasoningTokens} reasoning tokens = ${totalTokens} total`;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span aria-label={tooltipText}>
            {totalTokens}
            {(promptTokens !== '0' || completionTokens !== '0') &&
              ` (${promptTokens}+${completionTokens})`}
            {` R${reasoningTokens}`}
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          {totalTokens}
          {(promptTokens !== '0' || completionTokens !== '0') &&
            ` (${promptTokens}+${completionTokens})`}
        </span>
      </TooltipTrigger>
      <TooltipContent>{`${promptTokens} prompt tokens + ${completionTokens} completion tokens = ${totalTokens} total`}</TooltipContent>
    </Tooltip>
  );
}

function getLatencyDisplay(output: EvaluateTableOutput): React.ReactNode | undefined {
  if (!output.latencyMs) {
    return undefined;
  }

  return (
    <span>
      {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(output.latencyMs)} ms
      {output.response?.cached ? ' (cached)' : ''}
    </span>
  );
}

function getTokensPerSecondDisplay({
  tokenUsage,
  latencyMs,
}: {
  tokenUsage:
    | EvaluateTableOutput['tokenUsage']
    | NonNullable<EvaluateTableOutput['response']>['tokenUsage']
    | undefined;
  latencyMs?: number;
}): React.ReactNode | undefined {
  if (!tokenUsage?.completion || !latencyMs || latencyMs <= 0) {
    return undefined;
  }

  const tokPerSec = tokenUsage.completion / (latencyMs / 1000);
  return (
    <span>{Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokPerSec)}</span>
  );
}

function getCostDisplay(cost?: number): React.ReactNode | undefined {
  return cost ? <span>${cost.toPrecision(2)}</span> : undefined;
}

function getCellStyles({
  isHighlighted,
  maxImageWidth,
  maxImageHeight,
}: {
  isHighlighted: boolean;
  maxImageWidth: number;
  maxImageHeight: number;
}): {
  cellStyle: CSSPropertiesWithCustomVars;
  contentStyle: React.CSSProperties;
} {
  return {
    cellStyle: {
      ...(isHighlighted ? { backgroundColor: 'var(--cell-highlight-color)' } : {}),
      '--max-image-width': `${maxImageWidth}px`,
      '--max-image-height': `${maxImageHeight}px`,
    },
    contentStyle: isHighlighted ? { color: 'var(--cell-highlight-text-color)' } : {},
  };
}

function renderCommentNode({
  commentTextToDisplay,
  handleCommentOpen,
  contentStyle,
}: {
  commentTextToDisplay?: string;
  handleCommentOpen: () => void;
  contentStyle: React.CSSProperties;
}): React.ReactNode {
  if (!commentTextToDisplay) {
    return null;
  }

  return (
    <div className="comment" onClick={handleCommentOpen} style={contentStyle}>
      {commentTextToDisplay}
    </div>
  );
}

function renderCellDetail({
  showStats,
  tokenUsageDisplay,
  latencyDisplay,
  tokPerSecDisplay,
  costDisplay,
}: {
  showStats: boolean;
  tokenUsageDisplay?: React.ReactNode;
  latencyDisplay?: React.ReactNode;
  tokPerSecDisplay?: React.ReactNode;
  costDisplay?: React.ReactNode;
}): React.ReactNode {
  if (!showStats) {
    return null;
  }

  return (
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
  );
}

function getStatusClass(output: EvaluateTableOutput, counts: ReturnType<typeof getPassFailCounts>) {
  return output.pass === true || (counts.passCount > 0 && counts.failCount === 0) ? 'pass' : 'fail';
}

function renderStatusBlock({
  showPassFail,
  statusClass,
  namedScores,
  passFailText,
  scoreString,
  providerOverride,
  failReasons,
  showPassReasons,
  passReasons,
}: {
  showPassFail: boolean;
  statusClass: string;
  namedScores: Record<string, number>;
  passFailText: React.ReactNode;
  scoreString: string;
  providerOverride: React.ReactNode;
  failReasons: string[];
  showPassReasons: boolean;
  passReasons: string[];
}): React.ReactNode {
  if (!showPassFail) {
    return null;
  }

  return (
    <div className={`status ${statusClass}`}>
      <div className="status-row">
        <div className="pill">
          {passFailText}
          {scoreString && <span className="score"> {scoreString}</span>}
        </div>
        {providerOverride}
      </div>
      <CustomMetrics lookup={namedScores} />
      {failReasons.length > 0 && (
        <span className="fail-reason">
          <FailReasonCarousel failReasons={failReasons} />
        </span>
      )}
      {showPassReasons && passReasons.length > 0 && (
        <div className="pass-reasons">
          {passReasons.map((reason, index) => (
            <div key={index} className="pass-reason">
              {reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderPromptBlock({
  showPrompts,
  firstOutput,
  prompt,
}: {
  showPrompts: boolean;
  firstOutput?: EvaluateTableOutput | null;
  prompt: EvaluateTableOutput['prompt'];
}): React.ReactNode {
  if (!showPrompts || !firstOutput?.prompt) {
    return null;
  }

  return (
    <div className="prompt">
      <span className="pill">Prompt</span>
      {typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2)}
    </div>
  );
}

function renderResponseAudioPlayer(
  responseAudioSource: ReturnType<typeof resolveAudioSource>,
): React.ReactNode {
  if (!responseAudioSource?.src) {
    return null;
  }

  return (
    <div className="response-audio" style={{ marginBottom: '8px' }}>
      <audio controls style={{ width: '100%', height: '32px' }} data-testid="response-audio-player">
        <source src={responseAudioSource.src} type={responseAudioSource.type || 'audio/mpeg'} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

function renderOutputActions({
  showExtraActions,
  copied,
  linked,
  isHighlighted,
  activeRating,
  openPrompt,
  output,
  text,
  rowIndex,
  promptIndex,
  evaluationId,
  testCaseId,
  cloudConfig,
  addFilter,
  resetFilters,
  replayEvaluation,
  fetchTraces,
  handleCopy,
  handleToggleHighlight,
  handleRowShareLink,
  handleRating,
  handleSetScore,
  handleCommentOpen,
  handlePromptOpen,
  handlePromptClose,
  setActionsHovered,
}: {
  showExtraActions: boolean;
  copied: boolean;
  linked: boolean;
  isHighlighted: boolean;
  activeRating: boolean | null;
  openPrompt: boolean;
  output: EvaluateTableOutput;
  text: string;
  rowIndex: number;
  promptIndex: number;
  evaluationId?: string;
  testCaseId?: string;
  cloudConfig: ReturnType<typeof useCloudConfig>['data'];
  addFilter: ReturnType<typeof useTableStore.getState>['addFilter'];
  resetFilters: ReturnType<typeof useTableStore.getState>['resetFilters'];
  replayEvaluation: ReturnType<typeof useEvalOperations>['replayEvaluation'];
  fetchTraces: ReturnType<typeof useEvalOperations>['fetchTraces'];
  handleCopy: () => void;
  handleToggleHighlight: () => void;
  handleRowShareLink: () => void;
  handleRating: (isPass: boolean) => void;
  handleSetScore: () => void;
  handleCommentOpen: () => void;
  handlePromptOpen: () => void;
  handlePromptClose: () => void;
  setActionsHovered: (hovered: boolean) => void;
}): React.ReactNode {
  return (
    <div
      className="cell-actions"
      onMouseEnter={() => setActionsHovered(true)}
      onMouseLeave={() => setActionsHovered(false)}
    >
      {showExtraActions && (
        <>
          <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="action p-1 rounded hover:bg-muted transition-colors"
                onClick={handleCopy}
                onMouseDown={(e) => e.preventDefault()}
              >
                {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>Copy output to clipboard</TooltipContent>
          </Tooltip>
          <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`action p-1 rounded hover:bg-muted transition-colors ${isHighlighted ? 'text-amber-500 dark:text-amber-400' : ''}`}
                onClick={handleToggleHighlight}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Toggle test highlight"
              >
                <Star
                  className={`size-4 ${isHighlighted ? 'stroke-amber-600 dark:stroke-amber-300' : ''}`}
                  fill={isHighlighted ? 'currentColor' : 'none'}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Toggle test highlight</TooltipContent>
          </Tooltip>
          <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="action p-1 rounded hover:bg-muted transition-colors"
                onClick={handleRowShareLink}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Copy link to output"
              >
                {linked ? <Check className="size-4" /> : <Link className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>Copy link to output</TooltipContent>
          </Tooltip>
        </>
      )}
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`action p-1 rounded hover:bg-muted transition-colors ${activeRating === true ? 'active text-emerald-600 dark:text-emerald-400' : ''}`}
            onClick={() => handleRating(true)}
            aria-pressed={activeRating === true}
            aria-label="Mark test passed"
          >
            <ThumbsUp
              className={`size-4 ${activeRating === true ? 'stroke-emerald-700 dark:stroke-emerald-300' : ''}`}
              fill={activeRating === true ? 'currentColor' : 'none'}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>Mark test passed (score 1.0)</TooltipContent>
      </Tooltip>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`action p-1 rounded hover:bg-muted transition-colors ${activeRating === false ? 'active text-red-600 dark:text-red-400' : ''}`}
            onClick={() => handleRating(false)}
            aria-pressed={activeRating === false}
            aria-label="Mark test failed"
          >
            <ThumbsDown
              className={`size-4 ${activeRating === false ? 'stroke-red-700 dark:stroke-red-300' : ''}`}
              fill={activeRating === false ? 'currentColor' : 'none'}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>Mark test failed (score 0.0)</TooltipContent>
      </Tooltip>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="action p-1 rounded hover:bg-muted transition-colors"
            onClick={handleSetScore}
            aria-label="Set test score"
          >
            <Hash className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Set test score</TooltipContent>
      </Tooltip>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="action p-1 rounded hover:bg-muted transition-colors"
            onClick={handleCommentOpen}
            aria-label="Edit comment"
          >
            <Pencil className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Edit comment</TooltipContent>
      </Tooltip>
      {output.prompt && (
        <>
          <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="action p-1 rounded hover:bg-muted transition-colors"
                onClick={handlePromptOpen}
                aria-label="View output and test details"
              >
                <Search className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>View output and test details</TooltipContent>
          </Tooltip>
          {openPrompt && (
            <EvalOutputPromptDialog
              open={openPrompt}
              onClose={handlePromptClose}
              prompt={output.prompt}
              provider={output.provider}
              gradingResults={getDialogGradingResults(output)}
              output={text}
              metadata={output.metadata}
              providerPrompt={getActualPrompt(output.response, { formatted: true })}
              evaluationId={evaluationId}
              testCaseId={testCaseId || output.id}
              testIndex={rowIndex}
              promptIndex={promptIndex}
              variables={output.metadata?.inputVars || output.testCase?.vars}
              onAddFilter={addFilter}
              onResetFilters={resetFilters}
              onReplay={replayEvaluation}
              fetchTraces={fetchTraces}
              cloudConfig={cloudConfig}
            />
          )}
        </>
      )}
    </div>
  );
}

export interface EvalOutputCellProps {
  output: EvaluateTableOutput;
  maxTextLength: number;
  rowIndex: number;
  promptIndex: number;
  showStats: boolean;
  onRating: (isPass?: boolean | null, score?: number, comment?: string) => void;
  evaluationId?: string;
  testCaseId?: string;
}

/**
 * Renders a single evaluation output cell including content, pass/fail badges, metrics, actions, and dialogs.
 *
 * This component displays an evaluation output (text, image, or audio), optional diffs against a reference
 * output, human grading UI (pass/fail/score/comment), token/latency/cost stats, and utility actions
 * (copy, share, highlight). It also manages internal dialogs for viewing the prompt/test details and editing comments.
 *
 * @param output - The evaluation output record to render (text/audio/metadata, grading results, scores, etc.).
 * @param maxTextLength - Maximum characters shown before truncation.
 * @param firstOutput - Reference output used when `showDiffs` is true to compute and render diffs.
 * @param showDiffs - When true, attempt to show a diff between `firstOutput` and `output`.
 * @param searchText - Optional search string; when present and table highlighting is enabled, matches are highlighted in the output text.
 * @param showStats - When true, renders token usage, latency, tokens/sec, cost, and other detail stats.
 * @param onRating - Callback invoked to report human grading changes. Called as `onRating(pass?: boolean, score?: number, comment?: string)`.
 * @param evaluationId - Evaluation identifier passed to the prompt/details dialog.
 * @param testCaseId - Test case identifier passed to the prompt/details dialog (falls back to `output.id` when not provided).
 * @param onMetricFilter - Optional callback to filter by a custom metric (passed through to the CustomMetrics child).
 */
function EvalOutputCell({
  output,
  maxTextLength,
  rowIndex,
  promptIndex,
  onRating,
  firstOutput,
  showDiffs,
  searchText,
  showStats,
  evaluationId,
  testCaseId,
}: EvalOutputCellProps & {
  firstOutput?: EvaluateTableOutput | null;
  showDiffs: boolean;
  searchText?: string;
}) {
  const outputCellId = useId();
  const {
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    showPassReasons,
    maxImageWidth,
    maxImageHeight,
  } = useResultsViewSettingsStore();

  const { shouldHighlightSearchText, addFilter, resetFilters } = useTableStore();
  const { data: cloudConfig } = useCloudConfig();
  const { replayEvaluation, fetchTraces } = useEvalOperations();

  const [openPrompt, setOpen] = React.useState(false);
  const [activeRating, setActiveRating] = React.useState<boolean | null>(
    getHumanRating(output)?.pass ?? null,
  );

  // Update activeRating when output changes
  React.useEffect(() => {
    const humanRating = getHumanRating(output)?.pass;
    setActiveRating(humanRating ?? null);
  }, [output]);

  const handlePromptOpen = () => {
    setOpen(true);
  };
  const handlePromptClose = () => {
    setOpen(false);
  };

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImage, setLightboxImage] = React.useState<string | null>(null);

  // Memoized to maintain stable reference across renders, preventing
  // unnecessary re-renders of markdown components that use this callback.
  // Uses functional update to avoid stale closure issues.
  // @see https://github.com/promptfoo/promptfoo/issues/969
  const toggleLightbox = useCallback((url?: string) => {
    setLightboxImage(url ?? null);
    setLightboxOpen((prev) => !prev);
  }, []);

  // Memoized components object for ReactMarkdown to prevent re-renders.
  // Creating this inline would cause ReactMarkdown to re-render on every
  // parent render, even when content hasn't changed.
  // @see https://github.com/promptfoo/promptfoo/issues/969
  const markdownComponents = useMemo(
    () => ({
      img: ({ src, alt }: { src?: string; alt?: string }) => (
        <img
          loading="lazy"
          src={src}
          alt={alt}
          onClick={() => toggleLightbox(src)}
          style={{ cursor: 'pointer' }}
        />
      ),
    }),
    [toggleLightbox],
  );

  const [commentDialogOpen, setCommentDialogOpen] = React.useState(false);
  const [commentText, setCommentText] = React.useState(output.gradingResult?.comment || '');
  const [commentDraftText, setCommentDraftText] = React.useState(
    output.gradingResult?.comment || '',
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset local draft state when switching outputs that share the same stored comment value.
  React.useEffect(() => {
    const persistedComment = output.gradingResult?.comment || '';
    setCommentText(persistedComment);
    setCommentDraftText(persistedComment);
  }, [output.id, output.gradingResult?.comment]);

  const handleCommentOpen = () => {
    setCommentDraftText(commentText);
    setCommentDialogOpen(true);
  };

  const handleCommentClose = () => {
    setCommentDraftText(commentText);
    setCommentDialogOpen(false);
  };

  const handleCommentSave = () => {
    setCommentText(commentDraftText);
    onRating(undefined, undefined, commentDraftText);
    setCommentDialogOpen(false);
  };

  const handleToggleHighlight = () => {
    let newCommentText;
    if (commentText.startsWith('!highlight')) {
      newCommentText = commentText.slice('!highlight'.length).trim();
      onRating(undefined, undefined, newCommentText);
    } else {
      newCommentText = ('!highlight ' + commentText).trim();
      onRating(undefined, undefined, newCommentText);
    }
    setCommentText(newCommentText);
    setCommentDraftText(newCommentText);
  };

  const text = stringifyOutputText(output.text);
  const normalizedText = normalizeMediaText(text);
  const inlineImageSrc = resolveImageSource(text);
  const primaryRenderedImageSrc = getPrimaryRenderedImageSrc(text, inlineImageSrc);
  const outputAudioSource = resolveAudioSource(output.audio);
  const { failReasons, passReasons } = getFailAndPassReasons(output);

  // Extract response audio from the last turn of redteamHistory for display in the cell
  const redteamHistory = output.metadata?.redteamHistory || output.metadata?.redteamTreeHistory;
  const lastTurn = redteamHistory?.[redteamHistory.length - 1];
  const responseAudio = lastTurn?.outputAudio as
    | { data?: string; format?: string; blobRef?: { uri?: string; hash?: string } }
    | undefined;
  const responseAudioSource = resolveAudioSource(responseAudio);

  const node = renderOutputNode({
    output,
    firstOutput,
    showDiffs,
    searchText,
    shouldHighlightSearchText,
    text,
    normalizedText,
    renderMarkdown,
    prettifyJson,
    markdownComponents,
    toggleLightbox,
    outputAudioSource,
    primaryRenderedImageSrc,
  });

  const handleRating = (isPass: boolean) => {
    const newRating = activeRating === isPass ? null : isPass;
    setActiveRating(newRating);
    // Defer the API call to allow the UI to update first
    queueMicrotask(() => {
      onRating(newRating, undefined, commentText);
    });
  };

  const [scoreDialogOpen, setScoreDialogOpen] = React.useState(false);

  const handleSetScore = () => {
    setScoreDialogOpen(true);
  };

  const handleScoreSave = (score: number) => {
    onRating(undefined, score, commentText);
    setScoreDialogOpen(false);
  };

  const [linked, setLinked] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const isMountedRef = React.useRef(true);
  const linkedResetTimeoutRef = React.useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const copiedResetTimeoutRef = React.useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const clearLinkedResetTimeout = useCallback(() => {
    if (linkedResetTimeoutRef.current !== null) {
      globalThis.clearTimeout(linkedResetTimeoutRef.current);
      linkedResetTimeoutRef.current = null;
    }
  }, []);

  const clearCopiedResetTimeout = useCallback(() => {
    if (copiedResetTimeoutRef.current !== null) {
      globalThis.clearTimeout(copiedResetTimeoutRef.current);
      copiedResetTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearLinkedResetTimeout();
      clearCopiedResetTimeout();
    };
  }, [clearLinkedResetTimeout, clearCopiedResetTimeout]);

  const scheduleLinkedReset = useCallback(() => {
    clearLinkedResetTimeout();
    linkedResetTimeoutRef.current = globalThis.setTimeout(() => {
      linkedResetTimeoutRef.current = null;
      if (isMountedRef.current) {
        setLinked(false);
      }
    }, 3000);
  }, [clearLinkedResetTimeout]);

  const scheduleCopiedReset = useCallback(() => {
    clearCopiedResetTimeout();
    copiedResetTimeoutRef.current = globalThis.setTimeout(() => {
      copiedResetTimeoutRef.current = null;
      if (isMountedRef.current) {
        setCopied(false);
      }
    }, 3000);
  }, [clearCopiedResetTimeout]);

  const handleRowShareLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('rowId', String(rowIndex + 1));

    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        if (!isMountedRef.current) {
          return;
        }
        setLinked(true);
        scheduleLinkedReset();
      })
      .catch((error) => {
        if (!isMountedRef.current) {
          return;
        }
        logger.error('Failed to copy link to clipboard', { error: getErrorMessage(error) });
      });
  };

  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (!isMountedRef.current) {
          return;
        }
        setCopied(true);
        scheduleCopiedReset();
      })
      .catch((error) => {
        if (!isMountedRef.current) {
          return;
        }
        logger.error('Failed to copy output to clipboard', { error: getErrorMessage(error) });
      });
  };

  const latencyDisplay = getLatencyDisplay(output);
  // Check for token usage in both output.tokenUsage and output.response?.tokenUsage.
  const tokenUsage = output.tokenUsage || output.response?.tokenUsage;
  const tokenUsageDisplay = formatTokenUsageDisplay(tokenUsage);
  const tokPerSecDisplay = getTokensPerSecondDisplay({
    tokenUsage,
    latencyMs: output.latencyMs,
  });
  const costDisplay = getCostDisplay(output.cost);
  const commentIsHighlighted = commentText.startsWith('!highlight');
  const { cellStyle, contentStyle } = getCellStyles({
    isHighlighted: commentIsHighlighted,
    maxImageWidth,
    maxImageHeight,
  });

  const counts = getPassFailCounts(output);
  const passFailText = getPassFailText(counts);
  const statusClass = getStatusClass(output, counts);

  const scoreString = scoreToString(output.score);
  const providerOverride = getProviderOverrideBadge(output);
  const commentTextToDisplay = getCommentTextToDisplay(commentText);

  const shiftKeyPressed = useShiftKey();
  const [actionsHovered, setActionsHovered] = React.useState(false);
  const showExtraActions = shiftKeyPressed || actionsHovered;

  return (
    <div id={`eval-output-cell-${outputCellId}`} className="cell" style={cellStyle}>
      {renderStatusBlock({
        showPassFail,
        statusClass,
        namedScores: output.namedScores ?? {},
        passFailText,
        scoreString,
        providerOverride,
        failReasons,
        showPassReasons,
        passReasons,
      })}
      {renderPromptBlock({ showPrompts, firstOutput, prompt: output.prompt })}
      {renderResponseAudioPlayer(responseAudioSource)}
      <div
        className={!showPassFail && !showPrompts ? 'content-needs-action-clearance' : undefined}
        style={contentStyle}
      >
        <TruncatedText
          text={node || normalizedText}
          maxLength={
            renderMarkdown && (isImageProvider(output.provider) || isVideoProvider(output.provider))
              ? 0
              : maxTextLength
          }
        />
      </div>
      {renderCommentNode({
        commentTextToDisplay,
        handleCommentOpen,
        contentStyle,
      })}
      {renderCellDetail({
        showStats,
        tokenUsageDisplay,
        latencyDisplay,
        tokPerSecDisplay,
        costDisplay,
      })}
      {renderOutputActions({
        showExtraActions,
        copied,
        linked,
        isHighlighted: commentIsHighlighted,
        activeRating,
        openPrompt,
        output,
        text,
        rowIndex,
        promptIndex,
        evaluationId,
        testCaseId,
        cloudConfig,
        addFilter,
        resetFilters,
        replayEvaluation,
        fetchTraces,
        handleCopy,
        handleToggleHighlight,
        handleRowShareLink,
        handleRating,
        handleSetScore,
        handleCommentOpen,
        handlePromptOpen,
        handlePromptClose,
        setActionsHovered,
      })}
      {lightboxOpen && lightboxImage && (
        <div className="lightbox" onClick={() => toggleLightbox()}>
          <img src={lightboxImage} alt="Lightbox" />
        </div>
      )}
      {commentDialogOpen && (
        <CommentDialog
          open={commentDialogOpen}
          contextText={getCombinedContextText(output)}
          commentText={commentDraftText}
          onClose={handleCommentClose}
          onSave={handleCommentSave}
          onChange={setCommentDraftText}
        />
      )}
      {scoreDialogOpen && (
        <SetScoreDialog
          open={scoreDialogOpen}
          currentScore={output.score}
          onClose={() => setScoreDialogOpen(false)}
          onSave={handleScoreSave}
        />
      )}
    </div>
  );
}
const MemoizedEvalOutputCell = React.memo(EvalOutputCell);

export default MemoizedEvalOutputCell;
