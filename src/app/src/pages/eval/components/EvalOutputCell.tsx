import * as React from 'react';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useShiftKey } from '@app/hooks/useShiftKey';
import Tooltip from '@mui/material/Tooltip';
import { METADATA_PREFIX } from '@promptfoo/constants';
import { type EvaluateTableOutput, ResultFailureReason, type MediaMetadata } from '@promptfoo/types';
import { diffJson, diffSentences, diffWords } from 'diff';
import remarkGfm from 'remark-gfm';
import CustomMetrics from './CustomMetrics';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import FailReasonCarousel from './FailReasonCarousel';
import CommentDialog from './TableCommentDialog';
import MediaRenderer, { findMediaMetadata as findMediaMetadataUtil, detectMediaType } from './MediaRenderer';
import TruncatedText from './TruncatedText';
import { useStore as useResultsViewStore } from './store';

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
 * Finds media metadata for a base64-encoded media file.
 * Uses the METADATA_PREFIX to look for corresponding metadata in the output.
 * 
 * @param output The EvaluateTableOutput that might contain media metadata
 * @param varName The variable name to check for media content
 * @returns The media metadata if found, null otherwise
 */
function findMediaMetadata(output: EvaluateTableOutput, varName: string): MediaMetadata | null {
  if (!output.metadata) {
    return null;
  }
  
  return findMediaMetadataUtil(output.metadata, varName);
}

export interface EvalOutputCellProps {
  output: EvaluateTableOutput;
  maxTextLength: number;
  rowIndex: number;
  promptIndex: number;
  showStats: boolean;
  onRating: (isPass?: boolean, score?: number, comment?: string) => void;
}

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
}: EvalOutputCellProps & {
  firstOutput: EvaluateTableOutput;
  showDiffs: boolean;
  searchText: string;
}) {
  const { renderMarkdown, prettifyJson, showPrompts, showPassFail, maxImageWidth, maxImageHeight } =
    useResultsViewStore();
  const [openPrompt, setOpen] = React.useState(false);
  const [activeRating, setActiveRating] = React.useState<boolean | null>(
    output.gradingResult?.componentResults?.find((result) => result.assertion?.type === 'human')
      ?.pass ?? null,
  );

  // Update activeRating when output changes
  React.useEffect(() => {
    const humanRating = output.gradingResult?.componentResults?.find(
      (result) => result.assertion?.type === 'human',
    )?.pass;
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
  const toggleLightbox = (url?: string) => {
    setLightboxImage(url || null);
    setLightboxOpen(!lightboxOpen);
  };

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

  let text = typeof output.text === 'string' ? output.text : JSON.stringify(output.text);
  let node: React.ReactNode | undefined;
  let failReasons: string[] = [];

  // Check if this output contains media content
  const detectMediaContent = () => {
    // Try to find media metadata in the output metadata 
    if (output.metadata) {
      // First check if the text itself might be a var name with metadata
      const mediaMetadata = findMediaMetadata(output, text);
      if (mediaMetadata) {
        const mediaType = detectMediaType(text, mediaMetadata.filename);
        console.log('EvalOutputCell: Found metadata by variable name', { 
          text: text.substring(0, 30) + '...',
          mediaType,
          metadata: mediaMetadata
        });
        return {
          isMedia: true,
          mediaType,
          metadata: mediaMetadata,
          content: text // The actual base64 content
        };
      }
      
      // If not, check output metadata keys directly
      for (const key in output.metadata) {
        if (key.startsWith(METADATA_PREFIX) && typeof output.metadata[key] === 'object') {
          // Just use the first media metadata we find and assume content is in output.text
          const metadata = output.metadata[key] as MediaMetadata;
          const mediaType = detectMediaType(text, metadata.filename);
          console.log('EvalOutputCell: Found metadata with prefix', { 
            key, 
            mediaType,
            metadata 
          });
          return {
            isMedia: true,
            mediaType,
            metadata,
            content: text
          };
        }
      }
    }
    
    // Default detection for backward compatibility
    if (typeof text === 'string') {
      // Check for common audio file signatures
      if (text.startsWith('RIFF') || text.startsWith('UklGR')) {
        console.log('EvalOutputCell: Detected WAV file from signature');
        return {
          isMedia: true,
          mediaType: 'audio',
          metadata: {
            type: 'audio',
            mime: 'audio/wav',
            extension: 'wav',
            filename: 'audio_file.wav'
          },
          content: text
        };
      } else if (text.startsWith('ID3') || text.startsWith('SUQz')) {
        console.log('EvalOutputCell: Detected MP3 file from signature');
        return {
          isMedia: true,
          mediaType: 'audio',
          metadata: {
            type: 'audio',
            mime: 'audio/mpeg',
            extension: 'mp3',
            filename: 'audio_file.mp3'
          },
          content: text
        };
      }
      
      // Generic media detection
      const mediaType = detectMediaType(text);
      const isMedia = mediaType !== 'unknown';
      
      if (isMedia) {
        console.log('EvalOutputCell: Detected media type from content', { 
          mediaType, 
          textSample: text.substring(0, 30) + '...'
        });
        
        // Create appropriate metadata based on the detected media type
        let metadata = null;
        if (mediaType === 'audio') {
          metadata = {
            type: 'audio',
            mime: 'audio/wav', // Default to WAV for unknown audio
            extension: 'wav',
            filename: 'audio_file.wav'
          };
        } else if (mediaType === 'video') {
          metadata = {
            type: 'video',
            mime: 'video/mp4', // Default to MP4 for unknown video
            extension: 'mp4',
            filename: 'video_file.mp4'
          };
        }
        
        return {
          isMedia,
          mediaType,
          metadata,
          content: text
        };
      }
    }

    return { isMedia: false, mediaType: null };
  };

  const mediaContent = detectMediaContent();

  // Handle failure messages by splitting the text at '---'
  if (!output.pass && text.includes('---')) {
    failReasons = (output.gradingResult?.componentResults || [])
      .filter((result) => (result ? !result.pass : false))
      .map((result) => result.reason);
    text = text.split('---').slice(1).join('---');
  }

  if (showDiffs && firstOutput) {
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
    } catch (error) {
      console.error('Invalid regular expression:', (error as Error).message);
    }
  } else if (mediaContent.isMedia) {
    // Use the MediaRenderer component for all media types
    console.log('EvalOutputCell: Rendering media content', { 
      mediaContent,
      maxWidth: maxImageWidth,
      maxHeight: maxImageHeight
    });
    node = (
      <MediaRenderer
        content={mediaContent.content || ''}
        metadata={mediaContent.metadata}
        alt={output.prompt || 'Media content'}
        maxWidth={maxImageWidth}
        maxHeight={maxImageHeight}
        onImageClick={toggleLightbox}
      />
    );
  } else if (output.audio) {
    // For direct output.audio format, create audio player directly
    console.log('EvalOutputCell: Rendering audio from output.audio field', output.audio);
    
    // Determine the format and create a proper MIME type
    const audioFormat = output.audio.format || 'wav';
    const audioMime = `audio/${audioFormat}`;
    
    // Create a unique filename from the ID or a fallback
    const audioFilename = output.audio.id || `audio_file_${new Date().getTime()}`;
    
    // Log more details for debugging
    console.log('EvalOutputCell: Creating audio MediaRenderer with', {
      dataLength: output.audio.data?.length,
      format: audioFormat,
      mime: audioMime,
      filename: audioFilename,
      hasTranscript: !!output.audio.transcript
    });
    
    node = (
      <MediaRenderer
        content={output.audio.data || ''}
        metadata={{
          type: 'audio',
          mime: audioMime,
          extension: audioFormat,
          filename: audioFilename,
          transcript: output.audio.transcript
        }}
        alt="Audio content"
        maxWidth={maxImageWidth}
        maxHeight={maxImageHeight}
      />
    );
  } else if (renderMarkdown && !showDiffs) {
    node = (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => (
            <img
              loading="lazy"
              src={src}
              alt={alt}
              onClick={() => toggleLightbox(src)}
              style={{ cursor: 'pointer' }}
            />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    );
  } else if (prettifyJson) {
    try {
      node = <pre>{JSON.stringify(JSON.parse(text), null, 2)}</pre>;
    } catch {
      // Ignore because it's probably not JSON.
    }
  }

  const handleRating = React.useCallback(
    (isPass: boolean) => {
      setActiveRating(isPass);
      onRating(isPass, undefined, output.gradingResult?.comment);
    },
    [onRating, output.gradingResult?.comment],
  );

  const handleSetScore = React.useCallback(() => {
    const score = prompt('Set test score (0.0 - 1.0):', String(output.score));
    if (score !== null) {
      const parsedScore = Number.parseFloat(score);
      if (!Number.isNaN(parsedScore) && parsedScore >= 0.0 && parsedScore <= 1.0) {
        onRating(undefined, parsedScore, output.gradingResult?.comment);
      } else {
        alert('Invalid score. Please enter a value between 0.0 and 1.0.');
      }
    }
  }, [onRating, output.score, output.gradingResult?.comment]);

  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(() => {
    navigator.clipboard.writeText(output.text);
    setCopied(true);
  }, [output.text]);

  let tokenUsageDisplay;
  let latencyDisplay;
  let tokPerSecDisplay;
  let costDisplay;

  if (output.latencyMs) {
    latencyDisplay = (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(output.latencyMs)} ms
      </span>
    );
  }

  if (output.tokenUsage?.completion) {
    const tokPerSec = output.tokenUsage.completion / (output.latencyMs / 1000);
    tokPerSecDisplay = (
      <span>{Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokPerSec)}</span>
    );
  }

  if (output.cost) {
    costDisplay = <span>${output.cost.toPrecision(2)}</span>;
  }

  if (output.response?.tokenUsage?.cached) {
    tokenUsageDisplay = (
      <span>
        {Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
          output.response?.tokenUsage?.cached ?? 0,
        )}{' '}
        (cached)
      </span>
    );
  } else if (output.response?.tokenUsage?.total) {
    const promptTokens = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
      output.response?.tokenUsage?.prompt ?? 0,
    );
    const completionTokens = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
      output.response?.tokenUsage?.completion ?? 0,
    );
    const totalTokens = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
      output.response?.tokenUsage?.total ?? 0,
    );

    if (output.response?.tokenUsage?.completionDetails?.reasoning) {
      const reasoningTokens = Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
        output.response.tokenUsage.completionDetails.reasoning ?? 0,
      );

      tokenUsageDisplay = (
        <Tooltip
          title={`${promptTokens} prompt tokens + ${completionTokens} completion tokens = ${totalTokens} total & ${reasoningTokens} reasoning tokens`}
        >
          <span>
            {totalTokens}
            {(promptTokens !== '0' || completionTokens !== '0') &&
              ` (${promptTokens}+${completionTokens})`}
            {` R${reasoningTokens}`}
          </span>
        </Tooltip>
      );
    } else {
      tokenUsageDisplay = (
        <Tooltip
          title={`${promptTokens} prompt tokens + ${completionTokens} completion tokens = ${totalTokens} total`}
        >
          <span>
            {totalTokens}
            {(promptTokens !== '0' || completionTokens !== '0') &&
              ` (${promptTokens}+${completionTokens})`}
          </span>
        </Tooltip>
      );
    }
  }

  const comment =
    output.gradingResult?.comment && output.gradingResult.comment !== '!highlight' ? (
      <div className="comment" onClick={handleCommentOpen}>
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

  const shiftKeyPressed = useShiftKey();
  const actions = (
    <div className="cell-actions">
      {shiftKeyPressed && (
        <>
          <span className="action" onClick={handleCopy} onMouseDown={(e) => e.preventDefault()}>
            <Tooltip title="Copy output to clipboard">
              <span>{copied ? '✅' : '📋'}</span>
            </Tooltip>
          </span>
          <span
            className="action"
            onClick={handleToggleHighlight}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Tooltip title="Toggle test highlight">
              <span>🌟</span>
            </Tooltip>
          </span>
        </>
      )}
      {output.prompt && (
        <>
          <span className="action" onClick={handlePromptOpen}>
            <Tooltip title="View output and test details">
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
            metadata={output.metadata}
          />
        </>
      )}
      <span
        className={`action ${activeRating === true ? 'active' : ''}`}
        onClick={() => handleRating(true)}
      >
        <Tooltip title="Mark test passed (score 1.0)">
          <span>👍</span>
        </Tooltip>
      </span>
      <span
        className={`action ${activeRating === false ? 'active' : ''}`}
        onClick={() => handleRating(false)}
      >
        <Tooltip title="Mark test failed (score 0.0)">
          <span>👎</span>
        </Tooltip>
      </span>
      <span className="action" onClick={handleSetScore}>
        <Tooltip title="Set test score">
          <span>🔢</span>
        </Tooltip>
      </span>
      <span className="action" onClick={handleCommentOpen}>
        <Tooltip title="Edit comment">
          <span>✏️</span>
        </Tooltip>
      </span>
    </div>
  );

  const cellStyle = useMemo(() => {
    const base =
      output.gradingResult?.comment === '!highlight' ? { backgroundColor: '#ffffeb' } : {};

    return {
      ...base,
      '--max-image-width': `${maxImageWidth}px`,
      '--max-image-height': `${maxImageHeight}px`,
    } as CSSPropertiesWithCustomVars;
  }, [output.gradingResult?.comment, maxImageWidth, maxImageHeight]);

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

  const providerOverride = useMemo(() => {
    const provider = output.testCase?.provider;
    let testCaseProvider: string | null = null;

    if (!provider) {
      return null;
    }

    if (typeof provider === 'string') {
      testCaseProvider = provider;
    } else if (typeof provider === 'object' && 'id' in provider) {
      const id = provider.id;
      if (typeof id === 'string') {
        testCaseProvider = id;
      }
    }

    if (testCaseProvider) {
      return (
        <Tooltip title="Model override for this test" arrow placement="top">
          <span className="provider pill">{testCaseProvider}</span>
        </Tooltip>
      );
    }
    return null;
  }, [output]);

  return (
    <div className="cell" style={cellStyle}>
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
          {!output.pass && (
            <span className="fail-reason">
              <FailReasonCarousel failReasons={failReasons} />
            </span>
          )}
        </div>
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
      {lightboxOpen && lightboxImage && (
        <div className="lightbox" onClick={() => toggleLightbox()}>
          <MediaRenderer
            content={lightboxImage}
            metadata={mediaContent.isMedia ? mediaContent.metadata : null}
            alt="Lightbox view"
            maxWidth={window.innerWidth * 0.9}
            maxHeight={window.innerHeight * 0.9}
          />
        </div>
      )}
      <CommentDialog
        open={commentDialogOpen}
        contextText={getCombinedContextText()}
        commentText={commentText}
        onClose={handleCommentClose}
        onSave={handleCommentSave}
        onChange={setCommentText}
      />
    </div>
  );
}
const MemoizedEvalOutputCell = React.memo(EvalOutputCell);

export default MemoizedEvalOutputCell;
