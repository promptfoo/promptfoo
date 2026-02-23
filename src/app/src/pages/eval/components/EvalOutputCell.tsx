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
import { type EvaluateTableOutput, type ImageOutput, ResultFailureReason } from '@promptfoo/types';
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
import CustomMetrics from './CustomMetrics';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
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

function scoreToString(score: number | null) {
  if (score === null || score === 0 || score === 1) {
    // Don't show boolean scores.
    return '';
  }
  return `(${score.toFixed(2)})`;
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

// ---------------------------------------------------------------------------
// Helper: compute diff node between two output texts
// ---------------------------------------------------------------------------
function computeDiffNode(firstOutputText: string, text: string): React.ReactNode {
  let diffResult;
  try {
    JSON.parse(firstOutputText);
    JSON.parse(text);
    diffResult = diffJson(firstOutputText, text);
  } catch {
    if (firstOutputText.includes('. ') && text.includes('. ')) {
      diffResult = diffSentences(firstOutputText, text);
    } else {
      diffResult = diffWords(firstOutputText, text);
    }
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

// ---------------------------------------------------------------------------
// Helper: build search-highlight node
// ---------------------------------------------------------------------------
function buildSearchHighlightNode(text: string, searchText: string): React.ReactNode | null {
  try {
    const regex = new RegExp(searchText, 'gi');
    const matches: { start: number; end: number }[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: regex.lastIndex });
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
    console.error('Invalid regular expression:', (error as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: build inline image node from text
// ---------------------------------------------------------------------------
function buildImageNode(
  text: string,
  inlineImageSrc: string | null | undefined,
  output: EvaluateTableOutput,
  toggleLightbox: (url?: string) => void,
): React.ReactNode {
  let src = inlineImageSrc || text;
  if (text?.trim().startsWith('<svg')) {
    src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }
  return (
    <img
      src={src}
      alt={output.prompt}
      style={{ width: '100%' }}
      onClick={() => toggleLightbox(src)}
    />
  );
}

// ---------------------------------------------------------------------------
// Helper: build audio node
// ---------------------------------------------------------------------------
function buildAudioNode(
  output: EvaluateTableOutput,
  outputAudioSource: ReturnType<typeof resolveAudioSource>,
): React.ReactNode | undefined {
  if (outputAudioSource) {
    return (
      <div className="audio-output">
        <audio controls style={{ width: '100%' }} data-testid="audio-player">
          <source src={outputAudioSource.src} type={outputAudioSource.type || 'audio/mpeg'} />
          Your browser does not support the audio element.
        </audio>
        {output.audio?.transcript && (
          <div className="transcript">
            <strong>Transcript:</strong> {output.audio.transcript}
          </div>
        )}
      </div>
    );
  }
  if (output.audio?.transcript) {
    return (
      <div className="transcript">
        <strong>Transcript:</strong> {output.audio.transcript}
      </div>
    );
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Helper: build video node
// ---------------------------------------------------------------------------
function buildVideoNode(output: EvaluateTableOutput): React.ReactNode | undefined {
  const videoData = output.video || output.response?.video;
  const videoSource = resolveVideoSource(videoData);
  if (!videoSource) {
    return undefined;
  }
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
        {videoData?.model && <span style={{ marginRight: '12px' }}>Model: {videoData.model}</span>}
        {videoData?.size && <span style={{ marginRight: '12px' }}>Size: {videoData.size}</span>}
        {videoData?.duration && <span>Duration: {videoData.duration}s</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: build prettified JSON or markdown node
// ---------------------------------------------------------------------------
function buildPrettifiedNode(
  text: string,
  normalizedText: string,
  prettifyJson: boolean,
  renderMarkdown: boolean,
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'],
): React.ReactNode | undefined {
  if (prettifyJson) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) {
        return <pre>{JSON.stringify(parsed, null, 2)}</pre>;
      }
    } catch {
      // Not valid JSON, fall through to markdown
    }
  }
  if (renderMarkdown) {
    return (
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={IDENTITY_URL_TRANSFORM}
        components={markdownComponents}
      >
        {normalizedText}
      </ReactMarkdown>
    );
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Helper: append structured images to an existing node
// ---------------------------------------------------------------------------
function appendImageElements(
  existingNode: React.ReactNode | undefined,
  images: ImageOutput[],
  output: EvaluateTableOutput,
  toggleLightbox: (url?: string) => void,
): React.ReactNode | undefined {
  const imageElements = images.map((img, idx) => {
    const src = resolveImageSource(img);
    return src ? (
      <img
        key={`img-${idx}`}
        src={src}
        alt={output.prompt || 'Generated image'}
        loading="lazy"
        style={{ width: '100%', cursor: 'pointer' }}
        onClick={() => toggleLightbox(src)}
      />
    ) : null;
  });
  if (!existingNode) {
    return <>{imageElements}</>;
  }
  return (
    <>
      {existingNode}
      {imageElements}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper: determine the main content node for the cell
// ---------------------------------------------------------------------------
function buildContentNode(
  output: EvaluateTableOutput,
  text: string,
  normalizedText: string,
  inlineImageSrc: string | null | undefined,
  outputAudioSource: ReturnType<typeof resolveAudioSource>,
  showDiffs: boolean,
  firstOutput: EvaluateTableOutput,
  searchText: string | undefined,
  shouldHighlightSearchText: boolean,
  prettifyJson: boolean,
  renderMarkdown: boolean,
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'],
  toggleLightbox: (url?: string) => void,
): React.ReactNode | undefined {
  // Diff mode
  if (showDiffs && firstOutput) {
    const firstOutputText =
      typeof firstOutput.text === 'string' ? firstOutput.text : JSON.stringify(firstOutput.text);
    return computeDiffNode(firstOutputText, text);
  }

  // Search highlight mode
  if (searchText && shouldHighlightSearchText) {
    return buildSearchHighlightNode(text, searchText) ?? undefined;
  }

  // Inline image or SVG
  const isInlineImage =
    text?.match(/^data:(image\/[a-z]+|application\/octet-stream|image\/svg\+xml);(base64,)?/) ||
    inlineImageSrc ||
    text?.trim().startsWith('<svg');
  if (isInlineImage) {
    return buildImageNode(text, inlineImageSrc, output, toggleLightbox);
  }

  // Audio
  if (output.audio) {
    return buildAudioNode(output, outputAudioSource);
  }

  // Video
  if (output.video || output.response?.video) {
    return buildVideoNode(output);
  }

  // Prettified JSON / markdown
  if ((prettifyJson || renderMarkdown) && !showDiffs) {
    return buildPrettifiedNode(
      text,
      normalizedText,
      prettifyJson,
      renderMarkdown,
      markdownComponents,
    );
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Helper: compute pass/fail counts
// ---------------------------------------------------------------------------
function computePassFailCounts(output: EvaluateTableOutput): {
  passCount: number;
  failCount: number;
  errorCount: number;
} {
  let passCount = 0;
  let failCount = 0;
  const errorCount = output.failureReason === ResultFailureReason.ERROR ? 1 : 0;
  const gradingResult = output.gradingResult;

  if (gradingResult) {
    if (gradingResult.componentResults) {
      for (const result of gradingResult.componentResults) {
        if (result?.pass) {
          passCount++;
        } else {
          failCount++;
        }
      }
    } else {
      passCount = gradingResult.pass ? 1 : 0;
      failCount = gradingResult.pass ? 0 : 1;
    }
  } else if (output.pass) {
    passCount = 1;
  } else {
    failCount = 1;
  }

  return { passCount, failCount, errorCount };
}

function buildPassFailText(
  passCount: number,
  failCount: number,
  errorCount: number,
): React.ReactNode {
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

  let failText = '';
  if (failCount > 1 || (passCount > 1 && failCount > 0)) {
    failText = `${failCount} FAIL`;
  } else if (failCount === 1) {
    failText = 'FAIL';
  }

  let passText = '';
  if (passCount > 1 || (failCount > 1 && passCount > 0)) {
    passText = `${passCount} PASS`;
  } else if (passCount === 1 && failCount === 0) {
    passText = 'PASS';
  }
  const separator = failText && passText ? ' ' : '';

  return (
    <>
      {failText}
      {separator}
      {passText}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper: compute token usage display
// ---------------------------------------------------------------------------
function buildTokenUsageDisplay(output: EvaluateTableOutput): React.ReactNode {
  const tokenUsage = output.tokenUsage || output.response?.tokenUsage;
  if (!tokenUsage) {
    return undefined;
  }

  if (tokenUsage.cached) {
    return (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokenUsage.cached ?? 0)}{' '}
        (cached)
      </span>
    );
  }

  if (!tokenUsage.total) {
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

// ---------------------------------------------------------------------------
// Helper: compute provider override badge
// ---------------------------------------------------------------------------
function buildProviderOverride(output: EvaluateTableOutput): React.ReactNode {
  const testCaseProvider = output.testCase?.provider;
  if (!testCaseProvider) {
    return null;
  }
  const providerId: string | null =
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

// ---------------------------------------------------------------------------
// Helper: extract response audio source from redteam history
// ---------------------------------------------------------------------------
function extractResponseAudioSource(
  output: EvaluateTableOutput,
): ReturnType<typeof resolveAudioSource> {
  const redteamHistory = output.metadata?.redteamHistory || output.metadata?.redteamTreeHistory;
  if (!redteamHistory?.length) {
    return null;
  }
  const lastTurn = redteamHistory[redteamHistory.length - 1];
  const responseAudio = lastTurn?.outputAudio as
    | { data?: string; format?: string; blobRef?: { uri?: string; hash?: string } }
    | undefined;
  return resolveAudioSource(responseAudio);
}

// ---------------------------------------------------------------------------
// Helper: get combined context text for comment dialog
// ---------------------------------------------------------------------------
function getCombinedContextText(output: EvaluateTableOutput): string | EvaluateTableOutput['text'] {
  if (!output.gradingResult?.componentResults) {
    return output.text;
  }
  return output.gradingResult.componentResults
    .map((result, index) => {
      const displayName = result.assertion?.metric || result.assertion?.type || 'unknown';
      const value = result.assertion?.value || '';
      return `Assertion ${index + 1} (${displayName}): ${value}`;
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Helper: copy text to clipboard with temporary feedback state
// ---------------------------------------------------------------------------
function copyToClipboard(text: string, setFlag: (v: boolean) => void): void {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      setFlag(true);
      setTimeout(() => setFlag(false), 3000);
    })
    .catch((error) => {
      console.error('Failed to copy to clipboard:', error);
    });
}

// ---------------------------------------------------------------------------
// Helper: build output text from output object
// ---------------------------------------------------------------------------
function getOutputText(output: EvaluateTableOutput): string {
  return typeof output.text === 'string' ? output.text : JSON.stringify(output.text);
}

// ---------------------------------------------------------------------------
// Helper: get comment text for display (strips !highlight prefix)
// ---------------------------------------------------------------------------
function getCommentDisplayText(output: EvaluateTableOutput): string | undefined {
  const comment = output.gradingResult?.comment;
  if (!comment) {
    return undefined;
  }
  if (comment.startsWith('!highlight')) {
    return comment.slice('!highlight'.length).trim();
  }
  return comment;
}

// ---------------------------------------------------------------------------
// Helper: build cell style object
// ---------------------------------------------------------------------------
function buildCellStyle(
  output: EvaluateTableOutput,
  maxImageWidth: number,
  maxImageHeight: number,
): CSSPropertiesWithCustomVars {
  const isHighlighted = Boolean(output.gradingResult?.comment?.startsWith('!highlight'));
  return {
    ...(isHighlighted ? { backgroundColor: 'var(--cell-highlight-color)' } : {}),
    '--max-image-width': `${maxImageWidth}px`,
    '--max-image-height': `${maxImageHeight}px`,
  };
}

// ---------------------------------------------------------------------------
// Helper: extract failure and pass reasons
// ---------------------------------------------------------------------------
function extractReasons(output: EvaluateTableOutput): {
  failReasons: string[];
  passReasons: string[];
} {
  let failReasons: string[] = [];
  let passReasons: string[] = [];

  if (output.gradingResult?.componentResults) {
    failReasons = output.gradingResult.componentResults
      .filter((result) => (result ? !result.pass : false))
      .map((result) => result.reason)
      .filter((reason): reason is string => Boolean(reason));

    passReasons = output.gradingResult.componentResults
      .filter((result) => (result ? result.pass : false))
      .map((result) => result.reason)
      .filter((reason): reason is string => Boolean(reason));
  }

  if (output.error && output.failureReason === ResultFailureReason.ERROR) {
    failReasons.unshift(output.error);
  }

  return { failReasons, passReasons };
}

// ---------------------------------------------------------------------------
// Helper: compute per-output latency/toks-per-sec/cost displays
// ---------------------------------------------------------------------------
function buildOutputStats(output: EvaluateTableOutput): {
  latencyDisplay: React.ReactNode;
  tokPerSecDisplay: React.ReactNode;
  costDisplay: React.ReactNode;
} {
  const tokenUsage = output.tokenUsage || output.response?.tokenUsage;

  let latencyDisplay: React.ReactNode;
  let tokPerSecDisplay: React.ReactNode;
  let costDisplay: React.ReactNode;

  if (output.latencyMs) {
    const isCached = output.response?.cached;
    latencyDisplay = (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(output.latencyMs)} ms
        {isCached ? ' (cached)' : ''}
      </span>
    );
  }

  if (tokenUsage?.completion && output.latencyMs && output.latencyMs > 0) {
    const tokPerSec = tokenUsage.completion / (output.latencyMs / 1000);
    tokPerSecDisplay = (
      <span>{Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokPerSec)}</span>
    );
  }

  if (output.cost) {
    costDisplay = <span>${output.cost.toPrecision(2)}</span>;
  }

  return { latencyDisplay, tokPerSecDisplay, costDisplay };
}

// ---------------------------------------------------------------------------
// Sub-component: CellActions
// ---------------------------------------------------------------------------
interface CellActionsProps {
  copied: boolean;
  linked: boolean;
  activeRating: boolean | null;
  commentText: string;
  showExtraActions: boolean;
  output: EvaluateTableOutput;
  rowIndex: number;
  promptIndex: number;
  evaluationId: string | undefined;
  testCaseId: string | undefined;
  openPrompt: boolean;
  onCopy: () => void;
  onToggleHighlight: () => void;
  onShareLink: () => void;
  onRatingTrue: () => void;
  onRatingFalse: () => void;
  onSetScore: () => void;
  onCommentOpen: () => void;
  onPromptOpen: () => void;
  onPromptClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  addFilter: ReturnType<typeof useTableStore>['addFilter'];
  resetFilters: ReturnType<typeof useTableStore>['resetFilters'];
  replayEvaluation: ReturnType<typeof useEvalOperations>['replayEvaluation'];
  fetchTraces: ReturnType<typeof useEvalOperations>['fetchTraces'];
  cloudConfig: ReturnType<typeof useCloudConfig>['data'];
  text: string;
}

function CellActions({
  copied,
  linked,
  activeRating,
  commentText,
  showExtraActions,
  output,
  rowIndex,
  promptIndex,
  evaluationId,
  testCaseId,
  openPrompt,
  onCopy,
  onToggleHighlight,
  onShareLink,
  onRatingTrue,
  onRatingFalse,
  onSetScore,
  onCommentOpen,
  onPromptOpen,
  onPromptClose,
  onMouseEnter,
  onMouseLeave,
  addFilter,
  resetFilters,
  replayEvaluation,
  fetchTraces,
  cloudConfig,
  text,
}: CellActionsProps) {
  const isHighlighted = commentText.startsWith('!highlight');

  return (
    <div className="cell-actions" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {showExtraActions && (
        <>
          <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="action p-1 rounded hover:bg-muted transition-colors"
                onClick={onCopy}
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
                onClick={onToggleHighlight}
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
                onClick={onShareLink}
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
            onClick={onRatingTrue}
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
            onClick={onRatingFalse}
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
            onClick={onSetScore}
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
            onClick={onCommentOpen}
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
                onClick={onPromptOpen}
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
              onClose={onPromptClose}
              prompt={output.prompt}
              provider={output.provider}
              gradingResults={output.gradingResult?.componentResults}
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
  firstOutput: EvaluateTableOutput;
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

  const handleCommentSave = () => {
    onRating(undefined, undefined, commentText);
    setCommentDialogOpen(false);
  };

  const handleToggleHighlight = () => {
    const newCommentText = commentText.startsWith('!highlight')
      ? commentText.slice('!highlight'.length).trim()
      : ('!highlight ' + commentText).trim();
    onRating(undefined, undefined, newCommentText);
    setCommentText(newCommentText);
  };

  const text = getOutputText(output);
  const normalizedText = normalizeMediaText(text);
  const inlineImageSrc = resolveImageSource(text);
  const outputAudioSource = resolveAudioSource(output.audio);

  // Extract response audio from the last turn of redteamHistory for display in the cell
  const responseAudioSource = extractResponseAudioSource(output);

  const { failReasons, passReasons } = extractReasons(output);

  // Build the main content node
  let node = buildContentNode(
    output,
    text,
    normalizedText,
    inlineImageSrc,
    outputAudioSource,
    showDiffs,
    firstOutput,
    searchText,
    shouldHighlightSearchText,
    prettifyJson,
    renderMarkdown,
    markdownComponents,
    toggleLightbox,
  );

  // Append structured images (e.g. from Gemini text+image responses)
  if (output.images?.length) {
    node = appendImageElements(node, output.images, output, toggleLightbox);
  }

  const handleRating = (isPass: boolean) => {
    const newRating = activeRating === isPass ? null : isPass;
    setActiveRating(newRating);
    // Defer the API call to allow the UI to update first
    queueMicrotask(() => {
      onRating(newRating, undefined, output.gradingResult?.comment);
    });
  };

  const [scoreDialogOpen, setScoreDialogOpen] = React.useState(false);

  const handleScoreSave = (score: number) => {
    onRating(undefined, score, output.gradingResult?.comment);
    setScoreDialogOpen(false);
  };

  const [linked, setLinked] = React.useState(false);
  const handleRowShareLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('rowId', String(rowIndex + 1));
    copyToClipboard(url.toString(), setLinked);
  };

  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    copyToClipboard(text, setCopied);
  };

  const tokenUsageDisplay = buildTokenUsageDisplay(output);
  const { latencyDisplay, tokPerSecDisplay, costDisplay } = buildOutputStats(output);

  const isHighlightedCell = Boolean(output.gradingResult?.comment?.startsWith('!highlight'));
  const cellStyle = buildCellStyle(output, maxImageWidth, maxImageHeight);
  const contentStyle = isHighlightedCell ? { color: 'var(--cell-highlight-text-color)' } : {};

  const { passCount, failCount, errorCount } = computePassFailCounts(output);
  const passFailText = buildPassFailText(passCount, failCount, errorCount);
  const scoreString = scoreToString(output.score);

  const providerOverride = buildProviderOverride(output);
  const commentTextToDisplay = getCommentDisplayText(output);

  const shiftKeyPressed = useShiftKey();
  const [actionsHovered, setActionsHovered] = React.useState(false);
  const showExtraActions = shiftKeyPressed || actionsHovered;

  return (
    <div id={`eval-output-cell-${outputCellId}`} className="cell" style={cellStyle}>
      {showPassFail && (
        <div className={`status ${output.pass ? 'pass' : 'fail'}`}>
          <div className="status-row">
            <div className="pill">
              {passFailText}
              {scoreString && <span className="score"> {scoreString}</span>}
            </div>
            {providerOverride}
          </div>
          <CustomMetrics lookup={output.namedScores} />
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
      )}
      {showPrompts && firstOutput.prompt && (
        <div className="prompt">
          <span className="pill">Prompt</span>
          {typeof output.prompt === 'string'
            ? output.prompt
            : JSON.stringify(output.prompt, null, 2)}
        </div>
      )}
      {/* Show response audio from redteam history if available (target's audio response) */}
      {responseAudioSource?.src && (
        <div className="response-audio" style={{ marginBottom: '8px' }}>
          <audio
            controls
            style={{ width: '100%', height: '32px' }}
            data-testid="response-audio-player"
          >
            <source src={responseAudioSource.src} type={responseAudioSource.type || 'audio/mpeg'} />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
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
      {commentTextToDisplay && (
        <div className="comment" onClick={() => setCommentDialogOpen(true)} style={contentStyle}>
          {commentTextToDisplay}
        </div>
      )}
      {showStats && (
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
      )}
      <CellActions
        copied={copied}
        linked={linked}
        activeRating={activeRating}
        commentText={commentText}
        showExtraActions={showExtraActions}
        output={output}
        rowIndex={rowIndex}
        promptIndex={promptIndex}
        evaluationId={evaluationId}
        testCaseId={testCaseId}
        openPrompt={openPrompt}
        onCopy={handleCopy}
        onToggleHighlight={handleToggleHighlight}
        onShareLink={handleRowShareLink}
        onRatingTrue={() => handleRating(true)}
        onRatingFalse={() => handleRating(false)}
        onSetScore={() => setScoreDialogOpen(true)}
        onCommentOpen={() => setCommentDialogOpen(true)}
        onPromptOpen={() => setOpen(true)}
        onPromptClose={() => setOpen(false)}
        onMouseEnter={() => setActionsHovered(true)}
        onMouseLeave={() => setActionsHovered(false)}
        addFilter={addFilter}
        resetFilters={resetFilters}
        replayEvaluation={replayEvaluation}
        fetchTraces={fetchTraces}
        cloudConfig={cloudConfig}
        text={text}
      />
      {lightboxOpen && lightboxImage && (
        <div className="lightbox" onClick={() => toggleLightbox()}>
          <img src={lightboxImage} alt="Lightbox" />
        </div>
      )}
      {commentDialogOpen && (
        <CommentDialog
          open={commentDialogOpen}
          contextText={getCombinedContextText(output)}
          commentText={commentText}
          onClose={() => setCommentDialogOpen(false)}
          onSave={handleCommentSave}
          onChange={setCommentText}
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
