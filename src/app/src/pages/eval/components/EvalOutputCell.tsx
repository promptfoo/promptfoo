import React, { useCallback, useMemo } from 'react';

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
import { type EvaluateTableOutput, ResultFailureReason } from '@promptfoo/types';
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
  isRedteam?: boolean;
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
 * @param isRedteam - When true, shows probe-specific stats (e.g., numRequests) in the stats panel.
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
  isRedteam,
}: EvalOutputCellProps & {
  firstOutput: EvaluateTableOutput;
  showDiffs: boolean;
  searchText?: string;
}) {
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

  const handleCommentOpen = () => {
    setCommentDialogOpen(true);
  };

  const handleCommentClose = () => {
    setCommentDialogOpen(false);
  };

  const handleCommentSave = () => {
    onRating(undefined, undefined, commentText);
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
  };

  const text = typeof output.text === 'string' ? output.text : JSON.stringify(output.text);
  const normalizedText = normalizeMediaText(text);
  const inlineImageSrc = resolveImageSource(text);
  const outputAudioSource = resolveAudioSource(output.audio);
  let node: React.ReactNode | undefined;
  let failReasons: string[] = [];
  let passReasons: string[] = [];

  // Extract response audio from the last turn of redteamHistory for display in the cell
  const redteamHistory = output.metadata?.redteamHistory || output.metadata?.redteamTreeHistory;
  const lastTurn = redteamHistory?.[redteamHistory.length - 1];
  const responseAudio = lastTurn?.outputAudio as
    | { data?: string; format?: string; blobRef?: { uri?: string; hash?: string } }
    | undefined;
  const responseAudioSource = resolveAudioSource(responseAudio);

  // Extract failure and pass reasons from component results
  if (output.gradingResult?.componentResults) {
    failReasons = output.gradingResult.componentResults
      .filter((result) => (result ? !result.pass : false))
      .map((result) => result.reason)
      .filter((reason) => reason); // Filter out empty/undefined reasons

    passReasons = output.gradingResult.componentResults
      .filter((result) => (result ? result.pass : false))
      .map((result) => result.reason)
      .filter((reason) => reason); // Filter out empty/undefined reasons
  }

  // Include provider-level error if present (e.g., from Python provider returning error)
  // Only add for true provider errors (ERROR), not assertion failures (ASSERT) which are already in componentResults
  if (output.error && output.failureReason === ResultFailureReason.ERROR) {
    failReasons.unshift(output.error);
  }

  if (showDiffs && firstOutput) {
    const firstOutputText =
      typeof firstOutput.text === 'string' ? firstOutput.text : JSON.stringify(firstOutput.text);

    let diffResult;
    try {
      // Try parsing the texts as JSON
      JSON.parse(firstOutputText);
      JSON.parse(text);
      // If no errors are thrown, the texts are valid JSON
      diffResult = diffJson(firstOutputText, text);
    } catch {
      // If an error is thrown, the texts are not valid JSON
      if (firstOutputText.includes('. ') && text.includes('. ')) {
        // If the texts contain a period, they are considered as prose
        diffResult = diffSentences(firstOutputText, text);
      } else {
        // If the texts do not contain a period, use diffWords
        diffResult = diffWords(firstOutputText, text);
      }
    }
    node = diffResult.map(
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

  if (searchText && shouldHighlightSearchText) {
    // Highlight search matches
    try {
      const regex = new RegExp(searchText, 'gi');
      const matches: { start: number; end: number }[] = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: regex.lastIndex,
        });
      }
      node =
        matches.length > 0 ? (
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
        ) : (
          <span key="no-match">{text}</span>
        );
    } catch (error) {
      console.error('Invalid regular expression:', (error as Error).message);
    }
  } else if (
    text?.match(/^data:(image\/[a-z]+|application\/octet-stream|image\/svg\+xml);(base64,)?/) ||
    inlineImageSrc ||
    text?.trim().startsWith('<svg')
  ) {
    // Convert raw SVG to data URI if needed
    let src = inlineImageSrc || text;
    if (text?.trim().startsWith('<svg')) {
      src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
    }
    node = (
      <img
        src={src}
        alt={output.prompt}
        style={{ width: '100%' }}
        onClick={() => toggleLightbox(src)}
      />
    );
  } else if (output.audio) {
    if (outputAudioSource) {
      node = (
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
    } else if (output.audio.transcript) {
      node = (
        <div className="transcript">
          <strong>Transcript:</strong> {output.audio.transcript}
        </div>
      );
    }
  } else if (output.video || output.response?.video) {
    // Support both top-level video (new format) and response.video (fallback)
    // Video can use blob storage (blobRef), storage refs (storageRef), or legacy URL paths
    const videoData = output.video || output.response?.video;
    const videoSource = resolveVideoSource(videoData);
    if (videoSource) {
      node = (
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
  } else if ((prettifyJson || renderMarkdown) && !showDiffs) {
    // When both prettifyJson and renderMarkdown are enabled,
    // display as JSON if it's a valid object/array, otherwise render as Markdown
    let isJsonHandled = false;
    if (prettifyJson) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) {
          node = <pre>{JSON.stringify(parsed, null, 2)}</pre>;
          isJsonHandled = true;
        }
      } catch {
        // Not valid JSON, continue to Markdown if enabled
      }
    }
    if (!isJsonHandled && renderMarkdown) {
      // Use stable constants and memoized components to prevent unnecessary
      // re-renders when parent re-renders due to layout changes.
      // @see https://github.com/promptfoo/promptfoo/issues/969
      node = (
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          urlTransform={IDENTITY_URL_TRANSFORM}
          components={markdownComponents}
        >
          {normalizedText}
        </ReactMarkdown>
      );
    }
  }

  const handleRating = (isPass: boolean) => {
    const newRating = activeRating === isPass ? null : isPass;
    setActiveRating(newRating);
    // Defer the API call to allow the UI to update first
    queueMicrotask(() => {
      onRating(newRating, undefined, output.gradingResult?.comment);
    });
  };

  const handleSetScore = () => {
    const score = prompt('Set test score (0.0 - 1.0):', String(output.score));
    if (score !== null) {
      const parsedScore = Number.parseFloat(score);
      if (!Number.isNaN(parsedScore) && parsedScore >= 0.0 && parsedScore <= 1.0) {
        onRating(undefined, parsedScore, output.gradingResult?.comment);
      } else {
        alert('Invalid score. Please enter a value between 0.0 and 1.0.');
      }
    }
  };

  const [linked, setLinked] = React.useState(false);
  const handleRowShareLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('rowId', String(rowIndex + 1));

    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setLinked(true);
        setTimeout(() => setLinked(false), 3000);
      })
      .catch((error) => {
        console.error('Failed to copy link to clipboard:', error);
      });
  };

  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      })
      .catch((error) => {
        console.error('Failed to copy output to clipboard:', error);
      });
  };

  let tokenUsageDisplay;
  let latencyDisplay;
  let tokPerSecDisplay;
  let costDisplay;

  if (output.latencyMs) {
    const isCached = output.response?.cached;
    latencyDisplay = (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(output.latencyMs)} ms
        {isCached ? ' (cached)' : ''}
      </span>
    );
  }

  // Check for token usage in both output.tokenUsage and output.response?.tokenUsage
  const tokenUsage = output.tokenUsage || output.response?.tokenUsage;

  if (tokenUsage?.completion && output.latencyMs && output.latencyMs > 0) {
    const tokPerSec = tokenUsage.completion / (output.latencyMs / 1000);
    tokPerSecDisplay = (
      <span>{Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokPerSec)}</span>
    );
  }

  if (output.cost) {
    costDisplay = <span>${output.cost.toPrecision(2)}</span>;
  }

  if (tokenUsage?.cached) {
    tokenUsageDisplay = (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokenUsage.cached ?? 0)}{' '}
        (cached)
      </span>
    );
  } else if (tokenUsage?.total) {
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
      tokenUsageDisplay = (
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
    } else {
      tokenUsageDisplay = (
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
  }

  const cellStyle: CSSPropertiesWithCustomVars = {
    ...(output.gradingResult?.comment?.startsWith('!highlight')
      ? { backgroundColor: 'var(--cell-highlight-color)' }
      : {}),
    '--max-image-width': `${maxImageWidth}px`,
    '--max-image-height': `${maxImageHeight}px`,
  };

  // Style for main content area when highlighted
  const contentStyle = output.gradingResult?.comment?.startsWith('!highlight')
    ? { color: 'var(--cell-highlight-text-color)' }
    : {};

  // Pass/fail badge creation
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  const gradingResult = output.gradingResult;

  if (gradingResult) {
    if (gradingResult.componentResults) {
      gradingResult.componentResults.forEach((result) => {
        if (result?.pass) {
          passCount++;
        } else {
          failCount++;
        }
      });
    } else {
      passCount = gradingResult.pass ? 1 : 0;
      failCount = gradingResult.pass ? 0 : 1;
    }
  } else if (output.pass) {
    passCount = 1;
  } else if (!output.pass) {
    failCount = 1;
  }

  if (output.failureReason === ResultFailureReason.ERROR) {
    errorCount = 1;
  }

  let passFailText;
  if (errorCount === 1) {
    passFailText = 'ERROR';
  } else if (failCount === 1 && passCount === 1) {
    passFailText = (
      <>
        {`${failCount} FAIL`} {`${passCount} PASS`}
      </>
    );
  } else {
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

    passFailText = (
      <>
        {failText}
        {separator}
        {passText}
      </>
    );
  }

  const scoreString = scoreToString(output.score);

  const getCombinedContextText = () => {
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
  };

  // Compute provider override badge for test case-level model overrides
  let providerOverride: React.ReactNode = null;
  const testCaseProvider = output.testCase?.provider;
  if (testCaseProvider) {
    const providerId: string | null =
      typeof testCaseProvider === 'string'
        ? testCaseProvider
        : typeof testCaseProvider === 'object' &&
            testCaseProvider !== null &&
            'id' in testCaseProvider &&
            typeof testCaseProvider.id === 'string'
          ? testCaseProvider.id
          : null;
    if (providerId) {
      providerOverride = (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="provider pill">{providerId}</span>
          </TooltipTrigger>
          <TooltipContent side="top">Model override for this test</TooltipContent>
        </Tooltip>
      );
    }
  }

  const commentTextToDisplay = output.gradingResult?.comment?.startsWith('!highlight')
    ? output.gradingResult.comment.slice('!highlight'.length).trim()
    : output.gradingResult?.comment;

  const comment = commentTextToDisplay ? (
    <div className="comment" onClick={handleCommentOpen} style={contentStyle}>
      {commentTextToDisplay}
    </div>
  ) : null;

  const detail = showStats ? (
    <div className="cell-detail">
      {tokenUsage?.numRequests !== undefined && isRedteam && (
        <div className="stat-item">
          <strong>Probes:</strong> {tokenUsage.numRequests}
        </div>
      )}
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

  const shiftKeyPressed = useShiftKey();
  const [actionsHovered, setActionsHovered] = React.useState(false);
  const showExtraActions = shiftKeyPressed || actionsHovered;

  const actions = (
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
                className={`action p-1 rounded hover:bg-muted transition-colors ${commentText.startsWith('!highlight') ? 'text-amber-500 dark:text-amber-400' : ''}`}
                onClick={handleToggleHighlight}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Toggle test highlight"
              >
                <Star
                  className={`size-4 ${commentText.startsWith('!highlight') ? 'stroke-amber-600 dark:stroke-amber-300' : ''}`}
                  fill={commentText.startsWith('!highlight') ? 'currentColor' : 'none'}
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

  return (
    <div id="eval-output-cell" className="cell" style={cellStyle}>
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
      {comment}
      {detail}
      {actions}
      {lightboxOpen && lightboxImage && (
        <div className="lightbox" onClick={() => toggleLightbox()}>
          <img src={lightboxImage} alt="Lightbox" />
        </div>
      )}
      {commentDialogOpen && (
        <CommentDialog
          open={commentDialogOpen}
          contextText={getCombinedContextText()}
          commentText={commentText}
          onClose={handleCommentClose}
          onSave={handleCommentSave}
          onChange={setCommentText}
        />
      )}
    </div>
  );
}
const MemoizedEvalOutputCell = React.memo(EvalOutputCell);

export default MemoizedEvalOutputCell;
