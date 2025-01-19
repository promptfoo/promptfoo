import * as React from 'react';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useShiftKey } from '@app/hooks/useShiftKey';
import Tooltip from '@mui/material/Tooltip';
import { ResultFailureReason, type EvaluateTableOutput } from '@promptfoo/types';
import { diffSentences, diffJson, diffWords } from 'diff';
import remarkGfm from 'remark-gfm';
import CustomMetrics from './CustomMetrics';
import EvalOutputPromptDialog from './EvalOutputPromptDialog';
import FailReasonCarousel from './FailReasonCarousel';
import CommentDialog from './TableCommentDialog';
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
  } else if (
    text.match(/^data:(image\/[a-z]+|application\/octet-stream|image\/svg\+xml);(base64,)?/)
  ) {
    node = (
      <img
        src={text}
        alt={output.prompt}
        style={{ width: '100%' }}
        onClick={() => toggleLightbox(text)}
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
          <img src={lightboxImage} alt="Lightbox" />
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
